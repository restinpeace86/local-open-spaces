# /admin/data-grid 초기 진입 극심한 지연 — 근본 원인(VACUUM 밀림) 수정

## 구현 대상
사용자 지시: "/admin/data-grid 관리자 페이지 초기 진입시 엄청 느려졌어 이거
왜이런거야? 각 탭에 대하여는 탭 누를때 데이터 호출하는거 맞지? 지연되는 문제를
좀 잡아줘"

## 구현 일시
2026-09-05

## 확인 — 탭 클릭 시에만 데이터 호출하는 것 맞음
`AdminDataGridClient`는 [관리자 페이지 성능 최적화](2026-08-30 사용자 지시) 이후
관례 그대로 각 탭에 `hasLoaded[tab]` 게이트가 있어, 탭을 클릭해도 자동으로
데이터를 조회하지 않고 "📥 불러오기" 버튼을 눌러야 그 탭의 조회 쿼리가 나간다
(코드 변경 없음, 기존 동작 재확인만 함).

느려진 건 그 이전 단계 — `/admin/data-grid` **페이지 자체의 서버 렌더링**
(`page.tsx`)이 8개 필터 옵션 RPC(source_type/category/source/seoul_yeyak/events/
raw_ingest/category_min×2)를 매번 병렬로 호출하는데, 이 중 하나가 실제로
DB에서 극도로 느려져 있었던 것.

## 실측으로 확인한 근본 원인
`node`로 8개 RPC를 직접 호출해 시간을 재보니:

```
get_open_spaces_source_type_options(): 8611ms ERROR: canceling statement due to statement timeout
get_open_spaces_category_options():    2952ms ok
get_events_filter_options():           5032ms ok
get_category_min_options(open_spaces): 4204ms ok
...
```

`get_open_spaces_source_type_options`가 8초 statement_timeout에 걸려 실패했고,
`rpcWithRetry`(재시도 2회, 300ms 간격)가 같은 쿼리를 최대 3번 반복 시도한다 —
`Promise.all`은 이 중 가장 느린 것을 기다려야 하므로, 이 RPC 하나 때문에 페이지
전체가 20초 넘게 붙잡혀 있었다.

`EXPLAIN (analyze, buffers)`로 내부 쿼리를 직접 까본 결과:

```
Index Only Scan using idx_open_spaces_source_type_created_at on open_spaces
  (actual time=6.174..18011.249 rows=142113 loops=1)
  Heap Fetches: 73221
```

Index Only Scan인데도 142,113건 중 73,221건(절반 이상)에서 "Heap Fetches"가
발생했다 — 이는 visibility map이 낡아 "이 페이지는 전부 보임" 표시가 없어서,
인덱스만으로 끝내지 못하고 실제 힙 페이지를 다시 읽어야 했다는 뜻이다.
`pg_stat_user_tables`를 확인하니:

```
n_live_tup=142182  n_dead_tup=19025  last_autovacuum=2026-08-29 (약 1주일 전)
```

dead tuple 비율이 19025/142182 ≈ 13.4%로, Postgres 기본 `autovacuum_vacuum_
scale_factor`(20%)에 아직 못 미쳐 autovacuum이 트리거되지 않고 있었다 — 그 사이
매일 배치 수집/관리자 대량 UPDATE가 계속 쌓이며 visibility map만 계속 낡아간
것이 근본 원인이다. **코드 버그가 아니라 DB 운영(VACUUM) 문제였다.**

## 조치
`scripts/migrations/2026-09-05-open-spaces-vacuum-and-autovacuum-tuning.sql`
(적용 완료, `node scripts/apply-sql.mjs`로 두 문장을 각각 실행 — `VACUUM`은
트랜잭션 블록 안에서 실행할 수 없어 관리 API가 감싸는 트랜잭션과 분리해 별도
호출함):

1. `VACUUM (ANALYZE) public.open_spaces;` — 즉시 visibility map/통계 갱신.
2. `ALTER TABLE public.open_spaces SET (autovacuum_vacuum_scale_factor = 0.05,
   autovacuum_analyze_scale_factor = 0.05);` — 기본 20% 대신 5%로 낮춰, 이
   테이블(배치 적재/대량 UPDATE가 잦고 Index Only Scan에 의존하는 필터 옵션
   RPC들이 많음)이 dead tuple을 덜 쌓은 상태에서 더 자주 자동 vacuum/analyze
   되도록 했다 — 같은 문제의 재발 방지.

## 검증 (실측 전/후 비교)
- VACUUM 직후 재조회: `n_dead_tup: 19025 → 0`.
- 8개 RPC 재실행 시간: `get_open_spaces_source_type_options` **8611ms(타임아웃)
  → 904ms**, 나머지도 전부 8초 한도 안에서 안정적으로 완료.
- `curl`로 `/admin/data-grid` 실제 페이지를 dev 서버에 직접 요청해 종단간 확인:
  첫 요청(컴파일 포함) 2.3초, 이후 웜 요청 **0.9~1.0초**(수정 전에는 재시도
  체인 때문에 20초 이상이었을 것으로 추정).
- `npx tsc --noEmit` 통과, `npm run test`(113개 파일/1185개 테스트) 전체 통과,
  `npm run build` 통과 — 애플리케이션 코드는 변경하지 않았으므로(DB 운영
  조치만) 회귀 없음을 재확인하는 차원.

## 특이 사항
- `get_events_filter_options`도 재측정 시 2.6~6초로 다소 변동이 있었다
  (`raw_data->>'MINCLASSNM'`/`'SVCSTATNM'` JSONB 추출이 매 행 힙 접근을
  요구해 폭이 넓은 테이블 스캔 비용이 있음) — 다만 `events` 테이블은
  `last_autovacuum`이 2026-09-04로 최근이라 이번 지연의 원인은 아니었고,
  8초 한도 안에서는 안정적으로 끝나 이번 긴급 수정 범위에는 포함하지 않았다.
  향후 이 RPC도 느려지면 같은 방식(EXPLAIN 실측)으로 원인을 확인해야 한다
  (추측으로 미리 손대지 않음).
- 이번 조치는 코드 변경이 아니라 DB 운영(VACUUM/저장 파라미터) 조치라
  `project/decision-log.md`에 별도 Decision을 남기지 않았다 — 기능/구조
  변경이 없고, 기존에 이미 이 프로젝트가 채택한 관례(2026-09-04 spot_dedup
  성능 수정 때도 `ANALYZE` 직접 실행으로 해결한 전례, `2026-09-04-spot-dedup-
  perf-fix-and-pagination.sql` 참고)와 동일한 성격의 순수 인프라 유지보수다.
