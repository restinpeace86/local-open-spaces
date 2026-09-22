# [나드리픽 앱 전반 성능 점검 및 조치]

## 구현 대상
사용자 지시(2026-09-22): "현재 나드리픽 앱 전반적으로 느려.. 느린 원인 확인하고
... 성능 튜닝 혹은 문제 있는 부분 있는지 점검해줘 배큠 analyzer가 필요하면
하고"

## 진단 방법
`pg_stat_statements`(이미 활성화돼 있음 확인)로 누적 실행 시간 상위 쿼리를
조회하고, `pg_stat_user_tables`로 테이블 크기/dead tuple 비율/vacuum 이력을
확인했다. 의심되는 쿼리는 `EXPLAIN (ANALYZE, BUFFERS)`로 실제 실행 계획을
직접 재현해 추측 없이 검증했다.

## 발견 1 (가장 큰 사용자 체감 원인): `get_nearby_spaces_and_events` RPC 지연
### 실측
- `pg_stat_statements`: 이 RPC(4개 인자 호출) 평균 **2,662ms**, 106회 호출
  누적 282초.
- 직접 `EXPLAIN ANALYZE`로 재현: 서울 좌표 기준 단일 호출 **4,121ms**.
- 이 함수를 호출하는 코드: `src/lib/spaces/get-nearby.ts`,
  `src/lib/home/get-home-feed.ts`(홈피드), `src/components/map/map-explorer.tsx`
  (지도 탐색), `src/lib/ai-chat/search-engine.ts`(AI챗 검색),
  `src/app/api/mom-pick/popular-spots/route.ts` 등 — **앱에서 가장 트래픽이
  많은 화면들(홈/지도/AI챗)이 전부 이 RPC를 쓴다.**

### 원인
함수 내부의 핵심 쿼리는 `order by location::geography <-> user_point limit
1001`(PostGIS KNN 최근접 검색)을 두 번(open_spaces/events) 수행한다. 이
쿼리 자체를 좌표를 리터럴로 박아 독립적으로 `EXPLAIN ANALYZE`하면 각각
70ms/63ms로 매우 빠르다(GiST 인덱스의 정렬된 순회를 제대로 활용). 그런데
실제 RPC 호출은 40배 이상 느렸다.

원인은 PostgreSQL의 **"generic plan" 전환**(PostgreSQL/PostGIS에서 잘 알려진
함정): PostgREST는 이 함수를 커넥션 풀 위에서 준비된 문(prepared statement)
으로 반복 호출하는데, 같은 문이 여러 번 실행되면 Postgres가 매번 실제
좌표값으로 새로 계획을 세우는 대신 "일반화된" 계획을 재사용하려 시도한다.
KNN(`<->`) 정렬은 계획 시점에 실제 좌표값을 알아야 GiST의 정렬 순회
최적화를 쓸 수 있는데, 일반화된 계획은 좌표를 모수 취급해 이 최적화를
포기하고 훨씬 느린 "전체 스캔 후 정렬"로 폴백한다. 실측으로 재확인: 세션에
`SET plan_cache_mode = force_custom_plan`을 걸고 같은 EXPLAIN을 다시 돌리니
4,121ms → 1,690ms로 즉시 개선됐다.

### 조치 (사용자 승인 후 적용 — 스키마 변경)
`scripts/migrations/2026-09-22-fix-nearby-rpc-knn-generic-plan.sql`:
```sql
alter function public.get_nearby_spaces_and_events(double precision, double precision, integer)
  set plan_cache_mode = force_custom_plan;
alter function public.get_nearby_spaces_and_events(double precision, double precision, integer, text, text[])
  set plan_cache_mode = force_custom_plan;
```
함수 로직/반환값은 전혀 바뀌지 않는다 — 이 설정은 이 함수가 호출될 때마다
항상 실제 파라미터 값으로 다시 계획을 세우도록 강제해, generic plan으로의
전환 자체를 원천 차단한다. 매 호출마다 계획 수립 비용이 약간(수 ms) 늘지만
지금의 초 단위 지연에 비하면 무시할 수준이다. `node scripts/apply-sql.mjs`로
적용, `pg_proc.proconfig`에 `plan_cache_mode=force_custom_plan`이 반영됐음을
재조회로 확인했다.

**3-인자 오버로드(좌표+반경만, `st_dwithin` 기반이라 KNN 정렬 문제의 직접
영향은 덜할 것으로 보임)에도 방어적으로 동일하게 적용** — 같은 함수군이라
일관성을 위해서다.

## 발견 2 (요청하신 배큠): `spot_weather_caches` dead tuple 20%
### 실측
`pg_stat_user_tables`: `spot_weather_caches`는 140,692행/46MB인데
**dead tuple이 28,136건(20%)**이었다. 이 테이블은 인덱스 조회가
**687만 회**에 달할 정도로 거의 모든 요청에서 읽히는 캐시 테이블이라(홈/
스팟 상세 등에서 날씨 표시), 잦은 upsert(6시간마다 배치)로 쌓인 dead
tuple이 인덱스/힙 조회 효율을 갉아먹고 있었을 가능성이 크다.

### 조치
`VACUUM ANALYZE`를 실행(요청하신 대로): `spot_weather_caches`(28,136→0),
`open_spaces`(4,195→0, 425MB 규모의 가장 큰 테이블), `events`(정리). 모두
Supabase Management API로 단일 문 단위 실행(`VACUUM`은 트랜잭션 블록 안에서
실행 불가 — 여러 문을 한 번에 보내면 실패해, 문장별로 분리해 실행).

## 발견 3 (참고 — 지금 당장 조치하지 않음): 배치 파이프라인의 open_spaces
전체 스캔이 DB 전체 쿼리 시간의 약 36%를 차지
`pg_stat_statements` 상위 쿼리 1·2위(각각 23.5%/12.1%)는 사용자 요청이
아니라 **배치 파이프라인의 커서 페이지네이션**(`WHERE location_precision = $1
AND id > $2 ORDER BY id LIMIT ...` — `fetchAllExactSpots`/
`fetchAllOpenSpacesWithAddress` 등 여러 어댑터가 매일 반복하는 전체 스캔
패턴)이었다. `EXPLAIN ANALYZE`로 확인한 결과 이 쿼리 자체는 비효율적이지
않다(반환 행 수만큼만 버퍼를 읽음 — `location_precision='EXACT'`가 테이블의
거의 전부를 차지해 선택도가 낮은 필터가 아니라서, 복합 인덱스를 추가해도
buffers 읽기량이 크게 줄지 않을 것으로 판단해 인덱스 추가는 시도하지
않았다). 다만 여러 어댑터가 매일 하루에도 여러 번 140,757행 전체를 반복
훑는 구조 자체가 누적 DB 부하의 큰 부분을 차지하는 건 사실이다 — 이건
개별 쿼리 버그가 아니라 "배치 아키텍처가 같은 전체 스캔을 여러 번
반복한다"는 구조적 특성이라, 사용자 확인 없이 배치 구조를 바꾸지 않았다
(제3장 제5조 추측 금지 — 사용자 트래픽과 배치 실행 시간대가 실제로
겹치는지, 겹친다면 배치 스케줄을 옮길지/공유 커서 결과를 캐싱할지는 제품
판단이 필요함).

## 검증
- `npx tsc --noEmit` / `npm run test`(197개 파일 2266개, 회귀 없음 — 이번
  변경은 순수 DB 설정이라 애플리케이션 코드 영향 없음) / `npm run build`
  모두 통과.
- `pg_proc.proconfig` 재조회로 `plan_cache_mode` 설정이 실제로 반영됐음을
  확인.
- `pg_stat_user_tables` 재조회로 dead tuple이 0으로 정리됐음을 확인.
- **주의**: `get_nearby_spaces_and_events`의 실제 개선 효과는 PostgREST의
  커넥션 풀 위에서 반복 호출될 때(=이 문제가 실제로 재현되는 조건) 나타난다
  — 이 세션의 진단 도구(매 호출이 독립된 새 연결)로는 "매 호출이 이미
  custom plan"이라 완전히 동일한 방식으로 재현하지는 못했다. 다만 세션에
  강제로 `force_custom_plan`을 걸었을 때 즉시 2배 이상 개선된 것과, 이
  설정이 정확히 이 종류의 문제(파라미터화된 KNN 쿼리의 generic plan
  폴백)에 대한 PostgreSQL 공식 권장 대응이라는 점에서 실제 운영 트래픽에서도
  같은 효과가 나타날 것으로 판단한다. **배포 후 실제 체감 속도를 다시
  확인해 주시면 좋겠다** — 여전히 느리면 추가로 `pg_stat_statements`를
  재조회해 이 RPC의 평균 실행 시간이 실제로 줄었는지 다시 확인할 수 있다.

## 특이 사항
- 이번 진단/조치는 전부 임시 스크립트(`scripts/tmp-*.sql`,
  `scripts/tmp-run-sql.mjs`)로 Supabase Management API를 직접 호출해
  수행했고, 완료 후 전부 삭제했다(리포지토리에는 실제 마이그레이션 파일
  하나만 남음).
- `ALTER FUNCTION`은 스키마 변경이라 자동 실행이 차단됐고, 사용자에게
  명시적으로 승인받은 뒤 진행했다 — `VACUUM ANALYZE`는 사용자가 이번
  요청에서 이미 "필요하면 하고"로 사전 승인했다고 판단해 바로 실행했다.
