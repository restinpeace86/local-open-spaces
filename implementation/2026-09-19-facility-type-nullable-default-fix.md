# [facility_type 기본값 결함 수정 — '복합' 기본값을 null(미판별)로]

## 구현 대상
사용자 지시(2026-09-19): "default를 복합으로 한게 잘못된거야.. unknown 혹은
null로 놔야돼 실내인지 야외인지 혹은 복합인지 판단이 안되면." — 이 지적은
`implementation/todo.md` [개선사항 3]의 스킵 사유(조건 A가 facility_type 기본값
'복합' 때문에 반영 불가)를 다시 인용하며 그 근본 원인 자체를 고쳐 달라는 요청.

## 구현 일시
2026-09-19

## 문제 진단
`events.facility_type`은 `NOT NULL DEFAULT '복합'`이었다 — "실내외 특성이 모두
포함되거나 판별이 불분명한 경우 기본값 적용"(spec/data/ai-rule.md 5.2-4, 원본
스펙 문구)이라, DB에서 "실제로 실내외 둘 다 확인된 복합 시설"과 "애초에 판별을
시도한 적도 없음"을 구분할 방법이 없었다. 실측(2026-09-17): 28,948건 중 22,118건
(76%)이 이 기본값에 그대로 머물러 있었다.

**부수 효과 확인**: `src/lib/ai-chat/search-engine.ts`의
`matchesOutdoorPreference()`가 이미 `if (!facilityType) return true;`(정보 없으면
배제하지 않음)로 null을 기대하는 코드를 갖고 있었다 — 즉 이 결함이 실제 챗봇
검색에서도 "미판별"과 "복합"을 구분 못 해 검색 필터 품질을 떨어뜨리고 있었다.

## 스펙 개정
`spec/data/ai-rule.md` 5.2-4/5.3, `project/database_schema.md`를 수정했다 —
'복합'은 이제 "실내외 둘 다 실제로 확인된 경우"에만 쓰는 확정값이고, 판별
불분명/미실행은 `null`이다(제7장 제7조 — 기획 변경은 스펙 수정 후 반영).

## 코드 변경

### 근본 원인 (가장 널리 쓰이는 경로)
`scripts/ingest/lib/ai-tagging.mjs`의 `deriveParentalTags()` — 여러 어댑터가
`broadTags.facility_type`으로 그대로 쓰는 핵심 함수. 이전엔
`실내외 키워드가 둘 다 있거나 둘 다 없음 → '복합'`이었는데, 이제
`둘 다 있으면 '복합', 하나만 있으면 그 값, 둘 다 없으면 null`로 고쳤다.

### 공용 정규화/기본값
`scripts/ingest/adapters/lib/schema-mapper.mjs`:
- `normalizeFacilityType()`: '실내'/'야외'/'복합' 외 값은 이제 null(이전엔 '복합').
- `buildEventRow`/`buildOpenSpaceRow`의 `facilityType` 기본 파라미터: `null`(이전엔
  '복합').

### 개별 어댑터의 하드코딩된 '복합' 제거
- `scripts/ingest/adapters/playground-adapter.mjs`: `idrodrCdNm`이 실내/실외 둘
  다 아니면 '복합' 단정 → null.
- `scripts/ingest/adapters/swimming-pool-adapter.mjs`: `inout_gbn_nm`의
  "실내외"(실제로 확인된 값)는 '복합'으로, 그 외("없음" 등, 근거 없음)는 null로
  구분(이전엔 둘 다 '복합').
- `scripts/ingest/adapters/rural-education-farm-adapter.mjs`: 근거 필드 없이
  하드코딩된 '복합' → null.

### DB 마이그레이션
`scripts/migrations/2026-09-19-facility-type-nullable-remove-default.sql` —
`events`/`open_spaces` 둘 다 `facility_type`의 `NOT NULL`/`DEFAULT '복합'` 제거.
`npm run gen:types`로 `src/types/database.types.ts` 재생성.

### 프런트엔드 null-safety
- `src/app/api/admin/data-grid/facility-type/route.ts`: PATCH가 이제 null(미판별로
  되돌리기)도 명시적으로 허용.
- `src/components/admin/raw-data-modal.tsx`의 `FacilityTypeEditor`: select에
  "미판별" 옵션 추가, 저장 시 그 값을 null로 변환.
- `src/components/admin/data-grid-client.tsx`: `AdminEventRow`/`AdminOpenSpaceRow`
  의 `facility_type` 타입을 `string | null`로 정정(런타임은 이미 null-safe했음 —
  타입만 실제와 일치시킴), `FacilityTypeBadge`의 null 라벨을 "NULL"에서 "미판별"로.

### 배치 조건 A 반영 (todo.md [개선사항 3] 재개)
`scripts/ingest/classify-new-events-facility-type.mjs`(일일 신규분)에
`.is('facility_type', null)` 필터를 추가 — 이제 "이미 판별된 행은 스킵"이 안전하게
반영된다(이전엔 기본값 '복합' 때문에 신규 행도 오인해 전부 건너뛸 위험이 있어
미반영 상태였음). 백필 스크립트(`scripts/classify-events-facility-type.mjs`)는
"다 해"(이미 분류된 것도 재검증 포함)라는 최초 지시가 여전히 유효해 이 필터를
추가하지 않았다.

## 기존 데이터 정리
`scripts/migrations/2026-09-19-facility-type-reset-never-classified.mjs` —
"100% 확실히 LLM 분류 배치의 후보였던 적이 없는" `facility_type='복합'` 행만
null로 되돌렸다(판단 근거: 배치 대상 조건은 항상 `is_active=true AND
target_audience IN (INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY)`였음):
- `is_active=false`: 20,014건
- `is_active=true AND target_audience IS NULL`: 937건
- `is_active=true AND target_audience NOT IN eligible`: 768건
- **합계 21,719건**

`is_active=true AND target_audience IN eligible`인 '복합' 110건은 건드리지
않았다 — 이 중 일부는 LLM이 실제로 BOTH로 판정한 것일 수 있고 일부는 배치가 아직
못 미친 극소수일 수 있어(개별 분류 이력을 남기지 않아 구분 불가) 안전한 쪽만
정리했다(제3장 제5조 추측 금지).

최종 분포(반영 후 실측): `null`(미판별) 21,719건 / `복합` 110건 / `실내` 3,498건
/ `야외` 3,704건.

## 실측 장애와 수정
20,014건 규모의 단일 `UPDATE ... WHERE`가 statement timeout으로 실패했다 —
"조건에 맞는 첫 500건 조회 → id로 직접 UPDATE → 재조회"(UPDATE가 매번 대상
집합을 줄여줘 커서 없이 자연히 수렴) 패턴으로 나눠 처리해 해결했다(이전 세션의
가격/연령 백필 스크립트와 동일한 패턴).

## 검증
- `npx tsc --noEmit`/`npm run test`(전체 166개 파일, 신규 케이스: ai-tagging.mjs
  facility_type 4개, schema-mapper normalizeFacilityType 4개 + 기본값 2개,
  playground-adapter 1개, swimming-pool-adapter 3개, rural-education-farm-adapter
  1개)/`npm run build` 모두 통과.
- 마이그레이션을 라이브 DB에 적용 후 `information_schema.columns`로 실제
  `is_nullable=YES`/`column_default=null` 확인.
- 기존 데이터 정리는 `--dry-run`으로 먼저 예상 건수(21,719건, 세부 3개 항목 모두
  일치) 확인 후 반영, 반영 후 재조회로 최종 분포까지 확인.

## 특이 사항
- `rural-education-farm-adapter.mjs`의 '복합' 하드코딩은 "농촌교육농장은 보통
  교실(실내)+체험 공간(실외)을 함께 갖춘다"는 도메인 지식으로 의도된 것일 수도
  있다 — 근거 코멘트가 없어 다른 두 사례(playground/swimming-pool의 "판별 불가
  폴백")와 동일한 패턴으로 보고 null로 바꿨다. 실제로 의도된 도메인 판단이었다면
  알려주시면 되돌리겠다.
- open_spaces.facility_type도 events와 동일한 결함이 있어 함께 고쳤다(스펙
  섹션이 두 테이블을 공통으로 규정) — 사용자가 명시적으로 요청한 범위는 아니었지만
  일관성을 위해 포함했다.
