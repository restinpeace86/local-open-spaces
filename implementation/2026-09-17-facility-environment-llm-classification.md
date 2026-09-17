# [실내/야외 분류 LLM 파이프라인]

## 구현 대상
사용자 지시(2026-09-17): "공공데이터 및 외부 제휴 API에서 수집된 아이와 함께
가기 좋은 나들이/체험 상품 데이터(타이틀 및 상세 설명)를 분석하여, 해당 장소의
환경 속성을 자동으로 분류하는 실내/야외 분류 LLM 파이프라인(함수 또는
스크립트)을 구현" — INDOOR/OUTDOOR/BOTH/UNKNOWN 4분류 + confidence + reason의
구조화된 JSON 출력 요구.

후속 확인(AskUserQuestion으로 명확화):
- LLM: Google Gemini(기존 코드베이스 관례와 동일 — OpenAI는 미사용, SDK 없이
  REST fetch만 씀).
- 적용 대상: "제휴 상품과 공공데이터 둘 다".
- 실행 위치: "LLM 호출 + JSON 파싱하는 함수 하나 만들고 일단 관리자화면의 이벤트
  탭의 상세팝업페이지쪽과 제휴 상품쪽에 상품 등록쪽에 만들기를 원한다. open_spaces
  관련은 추후 필요하면 확장" — 제목+설명을 종합해 LLM에 던지는 방식.

## 구현 일시
2026-09-17

## 변경 사항

### 핵심 함수 (재사용 가능한 순수 로직)
`src/lib/admin/llm-facility-classification.ts` — 기존
`llm-blog-verification.ts`(스페이스 타입 검증)와 동일한 관례: 프롬프트
구성/응답 파싱만 순수 함수로 두고 실제 네트워크 호출은 API 라우트가 담당한다.
- `buildFacilityClassificationPrompt(title, description)`: 요청 원문의 4가지
  분류 정의(INDOOR/OUTDOOR/BOTH/UNKNOWN)를 그대로 프롬프트에 반영.
- `parseFacilityClassificationResponse(rawText)`: 마크다운 코드 블록 방어적
  제거 + 열거값 검증, 형식이 안 맞으면 추측으로 기본값을 채우지 않고 `null`
  반환(제3장 제5조).

### API 라우트
`POST /api/admin/classify-facility-environment` — `{title, description}` →
Gemini(`gemini-flash-lite-latest`, `responseMimeType: 'application/json'`,
20초 타임아웃 — 기존 `llm-verify` 라우트와 동일 설정) 호출 후 구조화된 결과
반환. 특정 테이블에 묶지 않은 범용 라우트라 이벤트 탭/제휴 상품 등록 폼
둘 다 이 하나를 공유한다.

### 저장 스키마 확인/설계
실측 확인: `events.facility_type`은 NOT NULL, 기본값 `'복합'`이며 전체
28,948건 중 22,118건(76%)이 이 기본값에 그대로 머물러 있다 — "실제로 복합
시설이라 판단됨"이 아니라 "ETL이 판단하지 못해 기본값"인 것과 사실상 같다.
그래서 새 문자열을 만들지 않고 이미 쓰이는 값 그대로 매핑한다:
INDOOR→'실내', OUTDOOR→'야외', BOTH→'복합'. UNKNOWN(판단 불가)은 저장할
대응값이 없어 자동 적용하지 않고 이유만 안내한다.
`curated_items`는 `facility_type` 컬럼이 아예 없어 신규 추가(마이그레이션
`scripts/migrations/2026-09-17-curated-items-facility-type.sql`, nullable —
coupang 등 실내외 판단이 필요 없는 상품도 있어서).

### 이벤트 탭 상세 팝업 (raw-data-modal.tsx)
- 신규 `FacilityTypeEditor` 컴포넌트 — 기존 `TargetAudienceEditor`와 동일한
  구조(select + 저장 버튼)에 "🤖 LLM로 실내/야외 자동 분류" 버튼을 추가.
  분류 결과(라벨/신뢰도/이유)를 안내 문구로 보여주고, INDOOR/OUTDOOR/BOTH면
  select 값을 자동으로 채운다.
- 신규 `PATCH /api/admin/data-grid/facility-type` — `target-audience/route.ts`와
  동일한 패턴(단일 컬럼 업데이트, 열거값 검증).
- `AdminEventRow` 타입에 `description` 필드 추가 + `EVENTS_COLUMNS` select에
  `description` 추가 — LLM에 넘길 설명 텍스트가 필요한데 관리자 그리드가
  지금까지 이 컬럼(공개 홈 피드 API는 이미 쓰고 있었음)을 select하지 않고
  있었다.
- `onFacilityTypeUpdated` 콜백을 `data-grid-client.tsx`에서 `onTargetAudienceUpdated`와
  동일한 방식으로 배선(rows/selectedRow 로컬 상태 갱신).

### 제휴 상품 등록 폼 (curated-item-form-modal.tsx)
- "실내/야외" select + "🤖 LLM 자동 분류" 버튼을 상세 설명 필드 바로 아래에
  추가. 폼에 이미 입력된 제목/설명을 그대로 넘겨 분류받는다(별도 원천 조회
  없음). 등록/수정 payload에 `facility_type` 포함.
- `/api/admin/curated-items` POST/PATCH가 `facility_type`을 저장하도록 확장.

## 검증
- `npx tsc --noEmit`/`npm run test`(전체 161개 파일 1879개 테스트, 신규 22개
  포함: lib 11개, raw-data-modal FacilityTypeEditor 4개, curated-item-form-modal
  classify 4개 등)/`npm run build` 모두 통과.
- 실제 Gemini API로 4가지 케이스 전부 재현 확인:
  - "숲속 키즈카페 이용권"(실내 놀이시설) → INDOOR, high
  - "OO목장 동물 먹이주기 체험"(야외 초원) → OUTDOOR, high
  - "OO 테마파크"(실내 어트랙션+야외 놀이기구) → BOTH, high
  - 제목만 있고 설명 없음 → UNKNOWN, low
- 실제 개발 서버에서 Playwright로 큐레이션/제휴 상품 수정 폼의 "🤖 LLM 자동
  분류" 버튼을 눌러, 실제 등록된 "원마운트 워터파크" 상품이 BOTH(복합)로
  정확히 분류되고 select가 자동으로 "복합"으로 채워지는 것을 확인.
