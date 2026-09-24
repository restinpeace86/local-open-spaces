# open_spaces SafeMerge upsert 배치를 500→300으로 하향

## 구현 대상
사용자 지시(2026-09-26): "open_spaces upsert 조각을 500에서 300 정도로
낮춰서 재시도 빈도를 더 줄여볼까요?"(제안) → "이거 300정도로 낮춰.. 어차피
이거 월 1회 배치 아니야?"(승인 + 근거 확인).

## 배경
직전 조사([[2026-09-26-postgrest-8s-statement-timeout-discovery]])에서
PostgREST 경유 요청(우리 admin client의 service_role 호출 포함)의 실제
`statement_timeout`이 8초임을 실측으로 확정했다. `open_spaces` SafeMerge
upsert를 500건 배치로 처음 올렸을 때(2026-09-25) 이따금 이 8초를 넘겨
재시도가 발생하는 것을 두 차례 실측으로 확인했다 — 왕복 횟수는 줄었지만
재시도 비용 때문에 총 소요시간이 오히려 늘어난 사례(12분→14분45초)까지
있었다.

## 변경 사항
`scripts/ingest/lib/supabase-admin.mjs`: `SAFE_MERGE_UPSERT_BATCH_SIZE_BY_TABLE
.open_spaces`를 `UPSERT_BATCH_SIZE`(공용 500, `upsertRows()`가 쓰는 값과
공유)를 참조하던 것에서 독립적인 `300`으로 분리했다 — 이제 이 값은
`upsertRows()`(SafeMerge를 쓰지 않는 다른 25개 어댑터)의 500과 서로 다른
값으로 완전히 분리되어, 앞으로 어느 한쪽을 조정해도 다른 쪽에 영향을
주지 않는다.

`LOCALDATA_PLAYGROUND`(82,431건)는 월 1회만 도는 배치라 왕복이 165회→
약 275회로 늘어도 문제가 없고(이미 이 소스만 25분 스텝 타임아웃을 별도로
줌), 대신 8초 제한에 걸릴 확률 자체가 줄어든다.

`scripts/ingest/lib/supabase-admin.test.mjs`: 500건 배치 분할 테스트를
300건 배치(1200건 → 정확히 4배치) 기준으로 재작성.

## 검증
- `npx tsc --noEmit` / `npm run test`(202개 파일 2,329개, 재작성한 테스트
  포함) / `npm run build` 모두 통과.
- 실제 프로덕션 재실행을 통한 시간 재측정은 다음 정기 월간 배치(9월 말)
  또는 수동 재실행 시 확인 예정 — 이번 변경은 이전 실측(8초 제한 확정)에
  근거한 것이라 별도 재현 테스트 없이 바로 적용한다.
