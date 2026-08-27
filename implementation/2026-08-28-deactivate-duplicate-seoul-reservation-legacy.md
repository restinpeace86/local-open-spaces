# [API 데이터 중복 표시 수정] SEOUL_RESERVATION_* 구버전 중복 행 비활성화

## 문제 제보
"api 가 다른거에 대하여 데이터가 같은게 좀 있는거 같아 타이틀이 거의 똑같은것들... 이것들에
대하여 중복해서 있지 않게 잘 조절해봐" — `/api/events/ongoing`, `/api/events/reservation-open`
등에서 제목이 거의 동일한 행사 카드가 두 번씩 노출된다는 제보.

## 구현 일시
2026-08-28

## 근본 원인
`scripts/migrations/2026-08-27-backfill-legacy-seoul-reservation-raw-data.mjs`가 이미
문서화한 내용 그대로다:

- Decision 017로 서울시 공공서비스예약(SEOUL_YEYAK) 어댑터가 재작성되기 전, 구버전 어댑터는
  `SEOUL_RESERVATION_{SVCID}`를 external_id로 사용했다. 재작성된 신버전 어댑터
  (`seoul-yeyak-adapter.mjs`)는 `SEOUL_YEYAK_{SVCID}`를 사용한다.
- 2026-08-27 작업은 구버전 행의 `source`/`raw_data`를 백필했지만, 신버전 어댑터와의 upsert
  충돌을 피하기 위해 external_id는 바꾸지 않고 그대로 남겨두었다. 그 결과 같은 실제 행사
  (raw_data.SVCID 동일)가 구버전 행(is_active=true)과 신버전 행(is_active=true) 두 개로
  동시에 존재하게 되어, 완전히 같은 제목의 카드가 화면에 두 번 노출됐다.

## 실측 확인 (2026-08-28)
- `is_active=true`인 `SEOUL_RESERVATION_*` 행: 총 1,677건.
- 이 중 708건은 `raw_data.SVCID`가 동일하고 대응하는 `SEOUL_YEYAK_{SVCID}` 행이 실제로
  `is_active=true`로 존재함 — **진짜 중복**.
- 958건은 대응하는 활성 `SEOUL_YEYAK_*` 행이 없음(라이브 피드에서 이미 사라졌거나 다른 사유로
  신버전에 반영되지 않은 것일 수 있음 — 추측 금지, 손대지 않음).
- 11건은 `raw_data`에 SVCID 자체가 없어 대조 불가 — 손대지 않음.

## 조치
대응하는 활성 SEOUL_YEYAK_* 행이 확인된 708건만 `is_active=false`로 전환했다(레코드 삭제
아님 — 필요 시 되돌릴 수 있음). 나머지 958건(대응 행 없음) + 11건(SVCID 없음)은 근거 없이
손대지 않았다(제3장 제5조 추측 금지).

## 변경 사항
- `scripts/migrations/2026-08-28-deactivate-duplicate-seoul-reservation-legacy.mjs` (신규):
  `deactivateDuplicateSeoulReservationLegacy({ dryRun }, client)` — N+1 방지를 위해 활성
  `SEOUL_YEYAK_*` external_id를 한 번에 Set으로 로드한 뒤 로컬 대조. 테스트를 위해 `client`를
  선택적 DI 파라미터로 받는다(기본값은 실제 `createAdminClient()`).
- `scripts/migrations/2026-08-28-deactivate-duplicate-seoul-reservation-legacy.test.mjs`
  (신규): 가짜 client로 진짜 중복/orphan/SVCID 없음/대응 행이 비활성인 경우를 모두 검증하는
  시나리오 테스트 1건 + dry-run 무변경 검증 1건.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 48개 파일 519건 통과(본 작업 신규 2건 포함).
- `npm run build`: 성공(신규 라우트 없음, 마이그레이션 스크립트만 추가).
- dry-run 실행 결과가 사전 실측 조사와 정확히 일치 확인:
  `{ scanned: 1677, toDeactivateCount: 708, noSvcid: 11, noActiveMatch: 958 }`.
- 실제 실행(사용자 확인 후) 결과: `{ scanned: 1677, deactivated: 708, noSvcid: 11,
  noActiveMatch: 958 }` — dry-run과 정확히 일치.
- 로컬 서버(`npm run dev`) 실측: `/api/events/ongoing` 전체 422건 중 제목 중복 0건(실행 전
  같은 제목이 두 번 나오던 "체험관+현대화시설 견학 예약(단체 한정)", "아리수나라 어린이 체험
  예약", "구로 재난안전체험장" 등 모두 1건씩만 노출됨을 확인).
- `/api/events/reservation-open` 전체 465건 확인 결과 제목 중복 6쌍 발견 — 개별 조사 결과 각
  쌍은 SVCID와 예약 기간(예: 8월 회차/9월 회차)이 서로 다른, 매달 별도로 재등록되는 반복
  프로그램의 서로 다른 회차였다(같은 행사의 물리적 중복이 아님). 이번 작업의 근본 원인
  (구버전/신버전 external_id 중복)과는 무관한 별개 사안이라 임의로 병합하지 않고 사용자에게
  별도 보고했다.

## 특이 사항
- `SEOUL_RESERVATION_*` 행은 여전히 DB에 존재하며 `is_active=false`로만 전환됐다(삭제
  아님) — 되돌릴 수 있다.
- 남은 958건(orphan) + 11건(SVCID 없음)은 이번 작업 범위 밖으로 명시적으로 제외했다.
- "예약 가능" 화면에 남은 6쌍의 동명 프로그램(회차별 재등록)은 버그가 아니라 데이터 특성일
  가능성이 높으나, 화면 표시 방식(예: "8월 회차"/"9월 회차" 구분 표기 등)을 개선할지는 별도
  Spec 판단이 필요해 이번 작업에는 포함하지 않았다.
