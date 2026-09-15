# [개선사항 8] LLM 기반 블로그 큐레이션 매장 검증

## 구현 대상
`implementation/todo.md` [개선사항 8] — 관리자가 상호명을 입력하면 멀티 쿼리(A: 아기의자/
B: 아기식기/C: 테라스 마당, 각 2개=총 6개) 블로그 스니펫을 자동 수집해 1년 이내로
필터링한 뒤 Gemini로 매장 동일성/영유아 친화 속성을 분석, 결과를 자동완성 폼으로
제공.

## 구현 일시
2026-09-15

## 적용 범위 결정: open_spaces 전용 (events 제외)
요청 원문은 "events / open_spaces의 탭"이라고 했지만, 삽입 기준점인 "뱃지들 바로
아래쪽"은 `curation_badges`(스팟 전용 개념, `spot_curations` 테이블)를 렌더링하는
`BlogCurationModal`(open_spaces)에만 존재한다 — `EventBlogCurationModal`(events)에는
뱃지 섹션 자체가 없다. 이 기능이 추출하는 속성(아기의자/유아식기/공간형태) 자체도
`curation-badges.ts`의 기존 `kids_chair`/`kids_tableware`/`outdoor_yard` 뱃지 키와
정확히 대응하는 "매장(식당류)" 전용 개념이라, events에 억지로 새 저장 위치를 만들지
않고 open_spaces의 `BlogCurationModal`에만 연결했다(제7장 제3조 — 근거 없는 새
스키마/UI를 임의로 만들지 않음).

## 변경 사항
### 1) 순수 로직 (`src/lib/admin/llm-blog-verification.ts`)
- `buildQueryVariants(storeName)`: 요청 원문의 3개 조합을 그대로 생성.
- `buildVerificationPrompt(storeName, storeAddress, snippets)`: 요청 원문의 역할극
  프롬프트/JSON 스키마/출력 제약 사항을 그대로 반영.
- `parseLlmVerificationResponse(rawText, storeName)`: 마크다운 코드블록 방어적 제거 +
  필수 필드 타입 검증(하나라도 안 맞으면 null — 추측으로 기본값을 채우지 않음).

### 2) API 라우트 (`src/app/api/admin/spot-curations/llm-verify/route.ts`)
3개 쿼리를 병렬로 Naver 블로그 검색(각 2건) → 결과 통합(최대 6건) →
`isWithinRecentWindow()`(기존 1년 룰 함수 재사용)로 필터링 → Gemini
(`responseMimeType: 'application/json'`로 JSON 강제) 분석 → 파싱된 결과 반환.
"화면현시는 하지 않음"(요청 원문) — 개별 블로그 검색 결과 자체는 응답에 포함하지
않는다.

### 3) 관리자 UI
- `LlmBlogVerificationPanel`(신규): 상호명 입력칸(스팟명으로 기본값 채움, 수정
  가능) + "🤖 LLM 분석" 버튼 + 결과 카드(일치 여부/아기의자/유아식기/공간형태/
  신뢰도/근거 요약).
- `BlogCurationModal.tsx`: `CurationBadgeForm`(뱃지 체크박스 섹션) 바로 아래에 이
  패널을 배치. 분석 결과가 매장 일치(`is_valid_match: true`)이면 해당하는 기존
  뱃지(`kids_chair`/`kids_tableware`/`outdoor_yard`)를 자동으로 ON(OFF→ON 방향
  으로만, 이미 켜져 있으면 그대로 둠) — 매장 불일치면 아무 뱃지도 건드리지 않는다.
  관리자는 이후 기존 체크박스 UI로 언제든 직접 켜고 끌 수 있다("결과 확인:
  자동완성된 폼만 받아보고 컨펌하면 끝" — 자동 반영 후에도 여전히 일반 체크박스로
  보이므로 그대로 컨펌/수정 가능).

### 발견 후 수정한 실제 버그 (실측 없이는 못 찾았을 것)
운영 API로 실제 호출해보니, 수집된 스니펫이 0건일 때 Gemini가 `store_name` 필드에
프롬프트에 없던 엉뚱한 매장명(예: 입력한 매장과 무관한 이름)을 채워 반환하는 사례를
확인했다. 이 필드는 LLM이 판단할 대상이 아니라 입력값을 그대로 반환(echo)하면 되는
필드라, LLM 응답의 `store_name`은 아예 신뢰하지 않고 항상 호출부가 실제로 요청한
상호명으로 강제하도록 수정했다. 회귀 테스트 추가.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1765개, 신규 27개 포함), `npm run build`
  모두 통과.
- 운영 API(Naver 블로그 검색 + Gemini) 실측 호출: (1) 수집 스니펫 0건 시나리오 →
  `is_valid_match: false` + 정직한 근거 요약, store_name 강제 수정 확인, (2) 일반
  쿼리("카페")로 Naver 블로그 검색 API 자체가 정상 동작함을 별도 확인해 "0건"이
  API 장애가 아니라 특정 상호명+키워드 조합에 실제로 매칭되는 글이 없었던
  것임을 검증.
- 관리자 화면: LLM 분석 결과가 매장 일치/불일치에 따라 기존 뱃지 체크박스에
  올바르게 반영/미반영됨을 컴포넌트 테스트로 확인.
