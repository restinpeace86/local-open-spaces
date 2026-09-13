# get_events_filter_options() statement timeout 재발 — 근본 원인 수정

## 구현 대상
사용자 지시(2026-09-13):
> (관리자 화면 운영 가이드 스크린샷 촬영 중 발견한 콘솔 에러 보고에 대해) 어 원인
> 진단 및 조치해

## 구현 일시
2026-09-13

## 배경
`get_events_filter_options()`는 2026-09-12(Step 133)에 이미 한 번 "하나의 통합
집계 스캔이 통계 미활용으로 느려진다"는 문제를 4개 독립 스칼라 서브쿼리로
재작성해 고친 적이 있는 RPC다. 오늘 관리자 화면 운영 가이드용 스크린샷을
찍던 중 브라우저 콘솔에서 같은 함수가 다시 "canceling statement due to
statement timeout"으로 실패하는 것을 발견했다.

## 진단(Supabase Management API로 프로덕션에 직접 EXPLAIN ANALYZE — 추측 아님)

### 1. 4개 서브쿼리 개별 실측
| 서브쿼리 | 방식 | 실행 시간 |
| --- | --- | --- |
| source | Index Only Scan (Heap Fetches: 0) | 80ms |
| event_type | Index Only Scan (Heap Fetches: 0) | 115ms |
| raw_data->>'SVCSTATNM' | Index Scan(힙 방문 필요) | 270~996ms |
| raw_data->>'MINCLASSNM' | Index Scan(힙 방문 필요) | 1.3~3.3초 |

source/event_type는 인덱스만으로 끝나는데, MINCLASSNM/SVCSTATNM은 매번 힙을
방문해야 하고(`width=721~722`인 넓은 행) `array_agg(distinct ... order by
...)`의 정렬/중복제거 비용까지 겹쳐 눈에 띄게 느리다 — 특히 MINCLASSNM은
값의 종류(카디널리티)가 더 많아 정렬 비용이 더 크다.

### 2. 실제 statement_timeout 확인
`pg_roles.rolconfig`를 직접 조회해 처음으로 정확히 확인했다:
```
anon: statement_timeout=3s
authenticated: statement_timeout=8s
authenticator: statement_timeout=8s
```
지금까지 세션 중 사용해온 "2분" 수치는 Supabase **Management API** 세션
(superuser 계열, 이 값의 적용을 받지 않음)의 설정이었을 뿐, 실제 관리자
화면이 PostgREST를 통해 호출할 때 적용받는 값은 **8초**였다 — 이 프로젝트에
이미 있던 `get_sigungu_options()` 수정 커밋 주석에도 "PostgREST 8초
타임아웃"이라고 명시돼 있어(2026-09-04), 이번 진단으로 그 8초 값이 실측으로도
재확인됐다.

네 서브쿼리 합산 시간(80ms+115ms+270~996ms+1.3~3.3초 ≈ 최대 4.5초 이상,
조건에 따라 더 늘어날 수 있음)이 이 8초 한도에 근접하거나 넘을 수 있다.
MINCLASSNM/SVCSTATNM은 SEOUL_YEYAK 소스에만 존재하는 raw_data 필드라, 이
소스가 매일 대량으로 재적재(오늘도 2572건)될 때마다 해당 행들이 전부 "막
갱신된 행"이 되어 이 문제가 반복 재현될 수 있는 구조였다.

## 조치 — 머티리얼라이즈드 뷰 캐싱(기존 선례 재사용)
이 프로젝트에는 정확히 같은 모양의 문제를 이미 한 번 해결한 선례가 있다 —
`get_sigungu_options()`(2026-09-04, `scripts/migrations/2026-09-04-sigungu-
options-cache.sql`): "매 요청마다 16만 행을 재집계 → 17.68초 → 8초 타임아웃"을
머티리얼라이즈드 뷰 캐싱으로 "17.68초 → 4.7ms"로 해결한 바 있다. 이번
`get_events_filter_options()`도 반환값이 "관리자 필터 드롭다운 후보 목록"이라
**실시간 최신성이 필요 없는 참조성 데이터**라는 점이 완전히 동일해, 같은
패턴을 그대로 재사용했다(제5장 제4조 기존 구조 우선 — 추측성 새 해법을
만들지 않음).

`scripts/migrations/2026-09-13-events-filter-options-cache.sql`:
- `events_filter_options_cache` 머티리얼라이즈드 뷰(행 1건, 기존 4개
  서브쿼리 결과를 그대로 담음) 생성.
- `get_events_filter_options()`를 이 캐시를 읽기만 하도록 재정의 — **함수
  시그니처(이름/반환 타입)는 그대로**라 `src/app/admin/data-grid/page.tsx`의
  호출부는 코드 변경이 전혀 필요 없다(`get_sigungu_options()`와 동일한
  무중단 교체 방식).
- `refresh_events_filter_options_cache()` 함수(`REFRESH MATERIALIZED VIEW
  CONCURRENTLY` — 락 없는 갱신을 위해 상수 컬럼에 유니크 인덱스 추가).
- 마이그레이션 마지막에 최초 1회 즉시 refresh 실행.

`scripts/ingest/lib/supabase-admin.mjs`에 `refreshEventsFilterOptionsCache(client)`
래퍼 추가(`refreshSigunguOptionsCache`와 동일한 모양), `scripts/ingest/run-
daily.mjs`에 `REFRESH_EVENTS_FILTER_OPTIONS_CACHE` 후처리 단계를
`REFRESH_SIGUNGU_OPTIONS_CACHE` 바로 다음에 추가 — 매일 배치가 끝날 때마다
캐시를 자동으로 최신화한다.

## 적용 및 검증
- 마이그레이션을 Supabase Management API로 프로덕션에 직접 적용.
- `EXPLAIN (analyze, buffers) select * from get_events_filter_options()`
  재실행 결과: `Seq Scan on events_filter_options_cache` — **실행 시간
  0.103ms**(기존 수 초~타임아웃 대비 압도적 개선, `get_sigungu_options()`
  수정 때의 "4.7ms" 개선 폭과 같은 급).
- `npx tsc --noEmit`/`npm run test -- --run`(142 파일, 1674건)/`npm run
  build`: 전부 통과 — RPC 캐싱은 함수 내부 구현만 바뀌고 프런트엔드 코드는
  건드리지 않아 회귀 없음.

## 특이 사항
- 함수 시그니처를 그대로 유지했으므로 이 커밋만으로 프로덕션에 이미 반영된
  마이그레이션이 즉시 효과를 낸다 — 별도 배포/코드 변경 대기가 필요 없다.
- `refresh_events_filter_options_cache()`는 매일 배치 마지막에만 자동
  호출되므로, 새로운 source/event_type/원천 중분류/접수상태 값이 오늘 배치로
  처음 들어와도 최대 하루 지연 후 반영된다 — `get_sigungu_options()`와
  동일한 트레이드오프이며, 관리자 필터 드롭다운 특성상 문제되지 않는다고
  판단했다.
