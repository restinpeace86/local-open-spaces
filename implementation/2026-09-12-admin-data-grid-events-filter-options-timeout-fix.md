# /admin/data-grid 재차 지연 — VACUUM 아닌 인덱싱/쿼리 설계 문제였음

## 구현 대상
사용자 지시: "지금 또 나드리픽 관리자화면 느려졌어 많이 느림.. VACUUM을 하던
원인 확인하고 조치해줘 배큠해야하는지 인덱싱이 문제인지... 등등"

## 구현 일시
2026-09-12

## 1단계 — VACUUM(dead tuple) 상태부터 확인: 이번엔 정상이었음
`pg_stat_user_tables`로 이전 두 차례(2026-09-05/06) 문제였던 3개 핵심 테이블을
재확인:

```
open_spaces:      dead 1.94%(2,783/143,591)  last_autovacuum: 2026-09-09
events:           dead 1.16%(337/29,035)     last_autovacuum: 2026-09-12(오늘)
raw_ingest_data:  dead 1.56%(2,927/187,285)  last_autovacuum: 2026-09-11
```

세 테이블 다 이전에 낮춘 `autovacuum_vacuum_scale_factor=0.05` 설정이 그대로
살아 있고(reloptions 확인) dead tuple도 건강하다 — **이번엔 VACUUM/autovacuum
문제가 아니었다.**

## 2단계 — 실측으로 원인 추적: 8개 admin 필터 옵션 RPC 직접 호출
`/admin/data-grid` 서버 렌더링(`page.tsx`)이 병렬로 호출하는 8개 RPC를 각각
직접 호출해 시간을 쟀다:

```
get_open_spaces_source_type_options: 2396ms ok
get_open_spaces_category_options:     695ms ok
get_open_spaces_source_options:       516ms ok
get_open_spaces_seoul_yeyak_options:  111ms ok
get_events_filter_options:           8274ms ERROR canceling statement due to statement timeout
get_raw_ingest_data_filter_options:  2063ms ok
get_category_min_options(open_spaces): 506ms ok
get_category_min_options(events):     164ms ok
```

`get_events_filter_options()`만 8초 statement_timeout에 걸려 실패했다.
`page.tsx`는 이 8개를 `Promise.all`로 기다리고, 실패한 RPC는
`rpcWithRetry`(2회 재시도, 300ms 간격)가 다시 시도한다 — 이 RPC 하나 때문에
페이지 전체가 20초 이상 붙잡히는, 2026-09-05/06과 동일한 증상이었다(원인만 달랐음).

## 3단계 — EXPLAIN으로 근본 원인 특정
```sql
CREATE OR REPLACE FUNCTION get_events_filter_options() ... AS $$
  select
    array_agg(distinct source ...),
    array_agg(distinct event_type ...),
    array_agg(distinct raw_data->>'MINCLASSNM' ...),
    array_agg(distinct raw_data->>'SVCSTATNM' ...)
  from public.events;
$$
```
`EXPLAIN (analyze, buffers)` 결과:
```
Aggregate (actual time=5057.077..5057.087)
  Buffers: shared hit=94306 read=267
  -> Index Scan using idx_events_source on events (actual time=3.636..2786.787 rows=28698)
```

4개 값을 하나의 SELECT로 한 번에 집계하다 보니, `raw_data`(JSONB)가 필요한
두 값 때문에 옵티마이저가 어차피 테이블 전체를 훑는 스캔 하나로 묶어버렸다.
`raw_data->>'키'` 추출은 TOAST(큰 JSONB는 압축 저장)를 매 행 압축 해제해야 해서
비용이 크다 — 실측한 `raw_data` 크기 분포:

```
seoul_public_reservation: 5,833건, 평균 3.9KB, 최대 82KB (총 21.7MB)
seoul_public_culture:    19,181건, 평균 1.0KB (총 18.7MB)
```

이 소스(`seoul_public_reservation`)의 건수/페이로드 크기가 계속 늘면서 결국
8초 한도를 넘긴 것 — **VACUUM 문제가 아니라 "4개 값을 한 스캔에 몰아 계산하는
쿼리 설계 + raw_data 표현식에 인덱스가 없어 매번 TOAST를 다시 푸는" 인덱싱
문제**였다.

## 조치 (`scripts/migrations/2026-09-12-events-filter-options-perf-fix.sql`, 적용 완료)
1. **표현식(함수) 인덱스 2개 추가**:
   ```sql
   create index idx_events_raw_data_minclassnm on public.events ((raw_data->>'MINCLASSNM'));
   create index idx_events_raw_data_svcstatnm on public.events ((raw_data->>'SVCSTATNM'));
   ```
   이 값들만 필요한 조회는 이제 `raw_data` 원문을 아예 건드리지 않고 인덱스에
   미리 뽑혀 저장된 값만 읽으면 된다.
2. **함수를 4개의 독립된 스칼라 서브쿼리로 재작성**:
   ```sql
   select
     (select array_agg(distinct source order by source) from public.events where source is not null),
     (select array_agg(distinct event_type order by event_type) from public.events where event_type is not null),
     (select array_agg(distinct raw_data->>'MINCLASSNM' ...) from public.events where raw_data->>'MINCLASSNM' is not null),
     (select array_agg(distinct raw_data->>'SVCSTATNM' ...) from public.events where raw_data->>'SVCSTATNM' is not null);
   ```
   4개를 하나의 스캔으로 묶지 않고 각자 독립된 서브쿼리로 분리해, 옵티마이저가
   각 값마다 최적의(그리고 가능하면 위 새 인덱스를 활용하는) 스캔 전략을 따로
   고를 수 있게 했다.

## 검증 (실측 전/후 비교)
`EXPLAIN (analyze, buffers)`로 재확인한 재작성 함수 전체 실행 계획:
```
Result (actual time=294.481..294.500)
  InitPlan 1: Index Only Scan using idx_events_source_created_at (9ms)
  InitPlan 2: Index Only Scan using idx_events_event_type (7.6ms)
  InitPlan 3: Index Scan using idx_events_raw_data_minclassnm (144.5ms) ← 신규 인덱스 사용
  InitPlan 4: Index Scan using idx_events_raw_data_svcstatnm (133.3ms) ← 신규 인덱스 사용
```
8개 RPC 재측정(안정화 후, 연속 2회):
```
get_events_filter_options: 8274ms(타임아웃) → 683ms → 352ms
나머지 7개도 전부 1초 이내로 안정적으로 완료
```

**부수적으로 확인한 것(문제 아니었음)**: 처음엔 open_spaces/events 메인 목록
쿼리(`order by created_at`/`start_date` + `limit 50`)도 느려 보이는 진단
스크립트 결과가 나왔으나, 재확인 결과 내 임시 진단 스크립트가 실제 애플리케이션
코드와 다르게 `nullsFirst` 옵션을 안 맞춰 보내 인덱스를 못 타는 것이었다(내
스크립트의 오류였지 실제 서비스 쿼리 문제가 아니었음). `route.ts`가 실제로
보내는 정확한 쿼리(`nullsFirst: false` 포함)로 다시 `EXPLAIN`한 결과 open_spaces
44ms, events 50ms로 이미 정상이었다 — 오탐이었음을 명시적으로 확인한 뒤 조치
대상에서 제외했다.

## 특이 사항
- 코드(`src/`) 변경 없음 — 순수 DB 마이그레이션(인덱스 추가 + 함수 재작성)만
  적용했다. `npx tsc --noEmit`/`npm run test`/`npm run build`는 회귀가 없음을
  재확인하는 차원에서 실행했다(2026-09-05 조치 때와 동일한 관례).
- 이 RPC(`get_events_filter_options`)는 `seoul_public_reservation` 소스의
  raw_data 페이로드가 계속 커지는 한 앞으로도 다시 느려질 가능성이 있다 — 이번
  조치로 "4개를 한 스캔에 묶는" 구조적 비효율은 없앴지만, `raw_data->>'키'`
  추출 자체의 TOAST 해제 비용은 여전히 행 수/페이로드 크기에 비례해 커진다.
  다음에 다시 느려지면 이번처럼 실측(EXPLAIN)으로 먼저 확인할 것 — 추측으로
  미리 손대지 않는다(제3장 제5조).
