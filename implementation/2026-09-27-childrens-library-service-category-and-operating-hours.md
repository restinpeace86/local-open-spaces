# 순수 어린이도서관 노출중분류 매핑 + 운영시간/휴관일 백필

## 구현 대상
사용자 지시(2026-09-27): "어 있는것부터 일단 채워보자 156건에 대하여
노출중분류 어린이 도서관에 매핑시키고 나서 38건의 휴관일, 운영시간을 실제로
뽑아 쓰는 작업까지 해."

## 배경
- 도서관 후보 검토 중 확정한 순수 어린이도서관 156건(category_min='도서관',
  이름에 "어린이/아동" + "자료실" 제외, [[2026-09-27-library-candidate-badge-exclude-section-only]])을
  이미 존재하는 노출중분류 "어린이 도서관"(문화시설)에 일괄 매핑.
- 그중 38건(public_facility_open 19 + seoul_public_culture 19)은 원본에
  운영시간/휴관일 필드가 있는데 그동안 안 쓰고 있었다(각각 `rstde`, `OPENHOUR`/
  `CLOSEDAY`).

## 변경 사항
### 1. 노출중분류 일괄 매핑
`scripts/migrations/2026-09-27-map-pure-childrens-library-to-service-category.sql`
(적용 완료): 156건 전부 `service_category_id`를 "어린이 도서관"
(`22286b2a-b386-4bb6-a853-31b62b3f62c7`)으로 설정. 사전 확인 결과 155건은
비어있었고 1건은 이미 정확히 매핑돼 있어 충돌 없음.

### 2. 어댑터 코드 — 휴관일을 운영시간에 포함(향후 신규 수집분)
- `scripts/ingest/adapters/public-facility-open-adapter.mjs`의
  `buildOperatingHours`: `rstde`(휴관일)가 있으면 평일/주말 시간 뒤에
  "휴관일 {rstde}"를 덧붙인다. 실측: 이 소스 전체에서 rstde가 null/빈
  문자열/"-"인 경우 0건 — 플레이스홀더 필터링 불필요.
- `scripts/ingest/cultural-spaces.mjs`: 신규 `buildOperatingHours` 함수 —
  `OPENHOUR`(자주 빈 문자열, 실측: 도서관 19건 중 16건)와 `CLOSEDAY`(실측:
  전체 행 null/빈 문자열 0건)를 함께 조합.
- 두 함수 모두 export해 백필 스크립트와 테스트에서 재사용 가능하게 했다.

### 3. 기존 38건 백필(원본 재호출 없이 이미 저장된 raw_data로 계산)
`scripts/migrations/2026-09-27-backfill-childrens-library-operating-hours.mjs`
(신규): open_spaces는 `ALWAYS_REFRESH_FIELDS` 대상이 아니라 "기존 값이 있으면
유지" 병합 규칙이 적용되므로, 재수집만으로는 기존 행에 반영되지 않는다.

**설계 결정 — 전체 재계산이 아니라 휴관일만 덧붙인다**: 처음엔 두 어댑터의
수정된 `buildOperatingHours(raw_data)`를 그대로 재실행해 컬럼 전체를
다시 계산하려 했으나, 실측 드라이런에서 "남가좌새롬어린이도서관" 1건이
현재 `raw_data.OPENHOUR`는 빈 문자열인데 저장된 `operating_hours`엔 "연 2회
(4~5월, 9~10월)10:30~17:00"라는 더 구체적인 값이 남아있는 걸 발견했다
(open_spaces의 raw_data도 "기존 값 유지" 규칙 대상이라 이 값이 언제 어떻게
들어왔는지는 알 수 없다 — 제3장 제5조 추측 금지). 전체 재계산은 이 케이스에서
기존의 더 나은 정보를 휴관일 문구로 덮어쓸 위험이 있어, **기존
`operating_hours` 값은 절대 지우지 않고 원본의 휴관일 필드만 뒤에
이어붙이는 방식**(`computeAppendedOperatingHours`)으로 바꿨다 — 이미 그
문구가 포함돼 있으면 건드리지 않아 재실행해도 안전(멱등)하다.

## 검증
- `src/lib/admin/kids-space-candidate.test.ts` 등 기존 156건 판정 로직은
  이번 작업과 무관, 변경 없음.
- `scripts/ingest/adapters/public-facility-open-adapter.test.mjs`(신규 2개):
  rstde 있음/없음.
- `scripts/ingest/cultural-spaces.test.mjs`(신규 파일, 4개): OPENHOUR+CLOSEDAY
  조합, OPENHOUR만 빈 경우, 둘 다 없는 경우, `mapToOpenSpaceRow` 통합.
- `scripts/migrations/2026-09-27-backfill-childrens-library-operating-hours.test.mjs`
  (신규 6개): 이어붙이기, null 기존값, 기존 정보 보존(남가좌새롬 사례),
  멱등성, 원본에 휴관일 없음, 대상 소스 아님.
- `npx tsc --noEmit` / `npm run test`(209개 파일 2,426개) / `npm run build`
  모두 통과.
- 실제 DB 반영: 노출중분류 매핑 156건 전부 확인(`어린이 도서관` 156건).
  운영시간 백필 드라이런 후 실제 실행 — 38건 전부 성공(실패 0건).

## 특이 사항
- 백필 대상 38건 외 나머지 118건(cultural_facility_summary 86 + tourapi_4.0
  10 + localdata_playground 22)은 원본 자체에 운영시간/휴관일 필드가 없어
  이번 작업 대상이 아니다(실측 확인, 이전 대화 참고) — 이 필드는 계속
  비어있는 채로 남는다.
