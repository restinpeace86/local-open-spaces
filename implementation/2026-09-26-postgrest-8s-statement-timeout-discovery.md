# PostgREST 경유 요청의 실제 8초 statement_timeout 발견 (RPC 기반 조회 최적화는 되돌림)

## 구현 대상
사용자 지시(2026-09-25/26) 흐름: "왜 이렇게 오래걸리는거지? 8만여건이라
그런가? 근데 이걸 나눠서 upsert 하는데도 크게 시간차이가 안난다고?" →
"어 진행해줘 다만 그전에 검토 먼저해서 안전하게 변경할수있도록 해"(조회를
RPC로 옮겨 URL 길이 제한을 없애는 개선 승인) → 실제 적용 후 재현된 새
장애 → "다 뒤져서 단계별로 찾아봐 2가지 다 가설세우고" → 근본 원인 확정
후 → **"3으로 가자"(RPC 개선을 포기하고 기존 25분 타임아웃 조치만
유지하기로 결정)**.

## 시도한 것 (결과적으로 되돌림)
`upsertRowsSafeMerge()`(`scripts/ingest/lib/supabase-admin.mjs`)의 기존 행
조회가 `select('*').in('external_id', ids)`(GET, URL 길이 제한으로 200건
하드캡)를 쓰는데, 이 200건 캡이 upsert 배치 크기를 아무리 조정해도 줄지
않는 조회 왕복 횟수의 진짜 바닥(82,431건 ÷ 200 ≈ 412회)이라고 판단해,
조회만 POST 기반 RPC(`find_rows_by_external_ids`, URL 길이 제한 없음)로
옮기고 조회 배치를 2000건으로 크게 잡는 마이그레이션을 설계 검토 후
적용했다(Plan 서브에이전트로 병합 로직 영향 없음을 사전 검증 — 병합
로직은 JS에 100% 그대로 두고 조회 메커니즘만 교체).

## 실측으로 발견한 진짜 원인 — 되돌린 이유
배포 직후 실제 소스(SEOUL_YEYAK, LOCALDATA_PLAYGROUND)로 스모크 테스트하다
"canceling statement due to statement timeout"이 반복 재현됐다. 두 가설을
순서대로 검증했다:

1. **가설 1(기각)**: 2026-09-22에 `get_nearby_spaces_and_events`에서 겪은
   것과 같은 "generic plan" 재발(반복 호출 시 Postgres가 실제 인자값 대신
   일반화된 계획으로 전환). `alter function ... set plan_cache_mode =
   force_custom_plan`을 걸어봤지만 타임아웃이 그대로 재현돼 기각했다.
2. **가설 2(확정)**: **PostgREST를 경유하는 모든 요청(우리 admin
   client의 service_role 호출 포함)의 실제 `statement_timeout`은 8초다**,
   DB 전체 기본값(2분)이 아니다. 원인: PostgREST는 항상 물리적으로
   `authenticator` 롤로 접속하고 요청마다 `SET ROLE <요청 롤>`로 권한만
   바꾸는데, `authenticator`에 `ALTER ROLE authenticator SET
   statement_timeout = '8s'`가 걸려 있고 `service_role` 자체는 이를
   오버라이드하지 않는다(`rolconfig: null`) — 그래서 `SET ROLE`로 권한만
   바뀌어도 세션에 이미 걸린 8초 제한은 그대로 남는다. 임시 진단 함수
   (`select current_setting('statement_timeout')`)를 실제 admin client로
   호출해 `"8s"`가 나오는 것을 직접 확인했다.

이 발견이 그동안의 관찰을 전부 설명한다:
- 새 RPC의 조회 배치(2000건)가 `events`뿐 아니라 **`open_spaces`
  (LOCALDATA_PLAYGROUND)에서도 동일하게 재현**됐다 — events 전용 문제가
  아니라 "8초 안에 안 끝나는 크기의 배치"라는 일반 문제였다.
- 기존 200건 GET 조회가 안정적이었던 건 URL 길이 때문만이 아니라 200건이
  거의 항상 8초 안에 끝나는 크기였기 때문이기도 하다.
- 직전 작업(2026-09-25)에서 `open_spaces` upsert를 500건으로 올렸을 때
  이따금 재시도가 났던 것(12분→14분45초로 오히려 늘었던 사례)도 원인이
  같다 — 500건이 이따금 8초를 넘긴다.
- 2026-09-13 events 조사의 "2분 제한" 결론은 DB 전체 기본값만 보고 실제
  PostgREST 경로의 진짜 제한(8초)을 놓친 것으로 보인다(그 조사의 처방
  자체 — 배치 크기를 낮추라 — 는 결과적으로 맞았지만 근거 수치가 틀렸다).

**결론**: 배치를 키워 왕복 횟수를 줄이는 접근은 이 8초 제약 아래서는
근본적으로 안전하지 않다(왕복 감소분보다 재시도 비용이 더 클 수 있음 —
실측: 500건 배치가 200건보다 총 소요시간이 더 길었던 사례). 왕복을 진짜로
줄이려면 조회+병합+upsert를 하나의 작은 배치 RPC로 합쳐야 하는데(현재는
조회 1회+upsert 1회로 배치당 2왕복), 이는 두 테이블의 서로 다른 병합
규칙을 SQL로 재구현해야 해 위험도가 크다고 판단해 시도하지 않기로 했다
(사용자 최종 결정: "3으로 가자" — 여기서 멈추고 기존 조치만 유지).

## 최종 변경 사항
- `scripts/ingest/lib/supabase-admin.mjs` / `supabase-admin.test.mjs`:
  `git checkout`으로 2026-09-25 커밋(Step 44) 상태로 완전히 되돌렸다 —
  조회는 다시 `select('*').in()`(200건 배치), upsert 배치는 이전 Step
  44의 결정(`events: 200`, `open_spaces: 500`) 그대로 유지.
- 프로덕션 DB: 이번에 새로 만들었던 `find_rows_by_external_ids` RPC를
  `drop function`으로 완전히 제거했다(사용자 승인 후) — 아무 데서도
  안 쓰는 죽은 코드를 DB에 남기지 않기 위함.
- `LOCALDATA_PLAYGROUND` 전용 25분 스텝 타임아웃(2026-09-25에 이미 적용)은
  그대로 유지 — 왕복 횟수 최적화 대신 이 여유 시간으로 재시도를 흡수하는
  현재 방식이 최종 결론이다.

## 검증
- `npx tsc --noEmit` / `npm run test`(전체, Step 44 기준선으로 복귀 확인)
  모두 통과.
- 실측: 되돌리기 전, 새 RPC 접근이 `events`/`open_spaces` 양쪽 다에서
  타임아웃을 재현하는 것을 각각 확인(가설 검증 목적) — 이 실측 자체가
  "왜 되돌렸는지"의 근거.

## 특이 사항 — 향후 참고용
- **이 프로젝트에서 PostgREST/supabase-js로 나가는 모든 쿼리(RPC 포함)는
  실질적으로 8초 안에 끝나야 한다.** 앞으로 대량 배치 작업을 설계할 때
  "DB 기본 statement_timeout(2분)"을 기준으로 판단하면 안 되고, 이 8초
  제약을 기준으로 배치 크기를 정해야 한다. Management API(`apply-sql.mjs`,
  `postgres` 슈퍼유저 직접 접속)는 이 제약을 받지 않는다 — 그래서 EXPLAIN
  ANALYZE 등 진단 쿼리는 빨라 보여도 실제 파이프라인 경로에서는 느릴 수
  있다는 점을 항상 감안해야 한다(오늘 실측: 같은 조건 직접 접속 233ms vs
  실제 RPC 경로 반복 타임아웃).
- 이 8초 제한을 늘리고 싶다면 `ALTER ROLE authenticator SET
  statement_timeout = ...`을 바꿔야 하는데, 이건 PostgREST 전체(우리 앱의
  사용자 요청 경로 포함)에 영향을 주는 인프라 레벨 변경이라 이번 범위에서
  건드리지 않았다.
