# DEDUPE_OPEN_SPACES / AUTO_ASSIGN_TO_EXISTING_GROUPS 매일 반복 실패 조사/수정

## 구현 대상
사용자 지시(2026-10-08): "파이프라인 관리 중에 AUTO_ASSIGN_TO_EXISTING_GROUPS...
DEDUPE_OPEN_SPACES... 이 2개는 매일 실패 반복해 얼마나 오래걸리는지 왜
오래걸리는지 뭐가 문제인지 한번 확인해봐" — 관리자 화면에 두 파이프라인
에이전트가 "canceling statement due to statement timeout"으로 22시간 전
(그리고 매일) 실패한 것이 보였다.

## 구현 일시
2026-10-08

## 조사 방법
Supabase Management API(`scripts/apply-sql.mjs`가 쓰는 것과 동일한 경로,
`SUPABASE_ACCESS_TOKEN`)로 직접 `EXPLAIN (ANALYZE, BUFFERS, TIMING)`을
돌려 실제 쿼리 플랜과 소요 시간을 측정했다(이 연결은 `statement_timeout`
이 2분이라 production의 더 짧은 타임아웃보다 여유가 있어 실측이 가능했다
— `show statement_timeout` 확인). 실제 데이터를 건드리지 않도록 UPDATE/
DELETE 테스트는 전부 `begin; ... rollback;`으로 감쌌다.

## DEDUPE_OPEN_SPACES — 원인: events.space_id에 인덱스 없음

`dedupeOpenSpaces()`가 마지막에 손실(loser) 행을 `DELETE ... WHERE id IN
(최대 200개)`로 지우는데, `open_spaces.id`를 참조하는 FK가 10개나 있다.
그 중 `events.space_id`/`partners.spot_id`/`user_bookmarks.spot_id` 3개
에만 인덱스가 없었다(나머지 7개는 이미 인덱스가 있음).

실측(실제 open_spaces 200건 DELETE, 롤백): 총 80.4초 중 **79.66초가
`events_space_id_fkey` 트리거 하나**에서 소모됐다(다른 9개 FK 트리거는
전부 합쳐도 0.5초 미만) — 삭제되는 행마다 `events` 테이블(30,249건)을
인덱스 없이 순차 스캔해 참조 여부를 확인해야 했기 때문이다.
`partners`(4건)/`user_bookmarks`(0건)는 지금은 작아서 문제가 안 됐지만
증가에 대비해 함께 인덱스를 추가했다.

**수정**: `idx_events_space_id`, `idx_partners_spot_id`,
`idx_user_bookmarks_spot_id` 3개 인덱스 추가(`scripts/migrations/
2026-10-08-fix-dedupe-and-autoassign-timeouts.sql`).

**수정 후 실측**: 동일한 200건 DELETE가 80.4초 → **0.33초**로 단축
(events_space_id_fkey 트리거: 79,662ms → 38ms).

## AUTO_ASSIGN_TO_EXISTING_GROUPS — 원인: 플래너의 카디널리티 오추정으로
## Merge Join이 선택돼 open_spaces 전체를 훑음

RPC `auto_assign_open_spaces_to_existing_groups()`는 기존 확정 그룹
(anchor, 814개)의 좌표 30m 이내에 있는 미그룹 신규 행(최대 142,309개
후보)을 찾아 그 그룹으로 편입하는 UPDATE다. 공간 조인(`st_dwithin`) 자체는
GiST 인덱스(`idx_open_spaces_location_geography`)를 정확히 쓰고 있어
단독 SELECT로는 5.5초면 끝난다(실제 매칭 264건, 플래너 추정 104,130건 —
PostGIS의 `st_dwithin` 선택도 추정은 일반적으로 부정확한 것으로 알려져
있다).

문제는 **UPDATE...FROM**으로 감싸는 순간: 플래너가 (잘못된) 104,130건
추정치를 근거로 Merge Join을 선택해, `open_spaces` 전체(14만여 건)를
pkey 인덱스로 처음부터 끝까지 merge 정렬 순서로 훑는 계획을 짰다.

실측(동일 쿼리, 롤백):
- 수정 전(Merge Join): **83.7초**(그 중 79초가 pkey 인덱스 전체 스캔)
- `enable_hashjoin=off`만: 35.9초(Seq Scan으로 바뀌지만 여전히 전체 스캔)
- `enable_mergejoin=off` + `enable_hashjoin=off`(Nested Loop 강제):
  **3.8초** — `m`(264건) 쪽을 outer로, `open_spaces_pkey`를 264회
  포인트룩업하는 계획으로 바뀜.

**수정**: 함수 본문 맨 앞에 `set local enable_mergejoin = off; set local
enable_hashjoin = off;` 추가(같은 마이그레이션 파일, `create or replace
function`). 이 함수가 다루는 "신규 미그룹 행이 기존 그룹 30m 이내에
있는 경우"는 본질적으로 희소한 결과셋이라 Nested Loop 강제가 항상
유리하다 — ANALYZE로는 해결 안 되는 PostGIS 선택도 추정의 구조적 한계라
GUC 강제가 적절한 대응이다.

**수정 후 실측**: 실제 RPC를 프로덕션과 동일한 경로(admin client)로
호출 → 4.6초, 264건 정상 업데이트, 에러 없음.

## 변경 사항
- `scripts/migrations/2026-10-08-fix-dedupe-and-autoassign-timeouts.sql`
  (적용 완료): 인덱스 3개 추가 + `auto_assign_open_spaces_to_existing_groups`
  함수 교체(SET LOCAL 추가, 쿼리 본문 자체는 동일).

## 검증
- 두 수정 모두 `begin; ... rollback;`으로 실제 데이터를 건지지 않고
  `EXPLAIN (ANALYZE, BUFFERS, TIMING)`으로 먼저 효과를 확인한 뒤 적용.
- 적용 후 실제 프로덕션 경로(RPC 직접 호출, `dedupeOpenSpaces()` 직접
  실행)로 재검증.

## 특이 사항
- 이번 조사는 Supabase Management API를 통한 직접 SQL 실행(EXPLAIN
  ANALYZE 포함)으로 가능했다 — PostgREST를 거치는 일반 RPC 경로보다
  훨씬 긴 statement_timeout(2분)을 가진 연결이라 실측이 가능했다. 같은
  방식(관리 API로 EXPLAIN ANALYZE 직접 실행)을 앞으로 유사한 "왜 느린지
  모르겠다" 조사에 재사용할 수 있다.
