# 표준중분류 미지정 데이터 LLM 분류(C열 채우기)

## 구현 대상
사용자 지시(2026-09-30): "미지정.csv 파일내에 약 1900건의 표준중분류
미지정된 데이터들이 있어. 여기서 제공되는 시설명(A열)과 주소(B열)를 보고,
우리 DB에 있는 [표준중분류 리스트] 중에서 가장 적합한 항목 '하나'를 골라
정확히 매칭해 줘. 단, 반드시는 아니고 어디에도 적합하지 않은건 미지정으로
아무것도 매칭안해도 돼. A열 B열의 데이터는 LLM에 우리 표준중분류리스트와
함께 던지고 내용변경하지마. 한번에 20개씩 요청해서 C열에.. 작성해줘"

이 지시는 DB를 직접 갱신하라는 요청이 아니라(제3장 제5조 추측 금지 —
명시되지 않은 DB 갱신은 임의로 하지 않음), 사용자가 검토할 분류 제안
CSV(C열)를 만들어 달라는 요청이라 그렇게만 구현했다. 실제 DB 이관은 이번
세션의 기존 관례(과학관/박물관 CSV들과 동일하게 CSV 검토 → 별도 이관 지시)
대로 사용자가 결과를 검토한 뒤 별도로 요청할 것으로 판단한다.

## 실측 확인
1. `미지정.csv`(CP949, UTF-8 변환 후 확인, **1,920개 행**)를 확인했다.
2. 분류 후보 표준중분류 리스트는 `src/lib/admin/category-min-groups.ts`의
   `OPEN_SPACES_GROUPS_STATIC`(어드민이 실제 쓰는 표준중분류 정의, open_spaces
   기준)을 그대로 옮겼다(scripts/는 TS를 직접 import하지 않는 기존 관례 —
   `category-min-groups.mjs`와 동일 패턴). 단 '기타'/'민원 등 기타'는
   "미지정과 사실상 같은 의미"라 후보에서 제외했다(사용자 지시의 "어디에도
   적합하지 않은건 미지정으로"와 정확히 대응) — 최종 후보 **56개**.
3. 1,920건을 건별로 LLM 호출하면 무료 티어 Gemini 일일 500회/모델 한도를
   훌쩍 넘기므로, **20건씩 묶어 한 번에 프롬프트로 던지는 배치 방식**을
   채택했다(96회 호출로 한도 안에 들어옴 — `scripts/ingest/lib/facility-
   classification.mjs`의 요청 간격/분당 한도 재시도 패턴을 재사용).
4. 실행 결과: **96/96 배치 전부 성공(오류 0건)**, 매칭 1,318건 / 미지정 유지
   602건.
5. 결과 샘플 검수: 매칭된 "키즈카페"(1,062건, 최다)는 실제로 "점핑스타",
   "펀시티", "플레이월드", "브릭스"처럼 몰/롯데시네마 등에 입점한 실내
   키즈카페 브랜드명이 다수 확인돼 타당했다. 미지정으로 남은 항목(602건)도
   "양양송이축제"(축제, 고정 시설 아님), "소래포구전통어시장"(전통시장),
   "따봄스테이"/"산막이가는길민박"(펜션/민박), "김천카트랜드"(카트장, 후보
   목록에 없음)처럼 실제로 현재 표준중분류 어디에도 명확히 맞지 않는
   사례들이라 억지로 끼워 맞추지 않은 판단이 타당해 보였다.

## 변경 사항
### `scripts/lib/unassigned-category-classification.mjs` (신규)
- `ALLOWED_CATEGORY_MINS`(56개, open_spaces 표준중분류 후보 목록).
- `buildCategoryMinClassificationPrompt(rows, allowedCategories)`: 최대 20건의
  시설명/주소를 번호와 함께 나열하고, 후보 목록과 함께 "추측/새 카테고리 생성
  금지, 안 맞으면 UNASSIGNED" 지침을 담은 프롬프트를 만든다.
- `parseCategoryMinClassificationResponse(rawText, expectedCount, allowedCategories)`:
  JSON 배열 응답을 index 기준으로 매핑하고, 후보 목록에 없는 값(환각)이나
  "UNASSIGNED"는 전부 null(미지정 유지)로 안전하게 처리한다.
- `classifyBatch(batchRows, apiKey, allowedCategories)`: Gemini
  `gemini-flash-lite-latest` 호출 + 분당 한도 재시도(기존 facility-
  classification.mjs와 동일한 65초 백오프 패턴).

### `scripts/lib/unassigned-category-classification.test.mjs` (신규, 14개 테스트)
프롬프트 생성/응답 파싱 순수 로직만 네트워크 없이 검증(마크다운 코드블록
벗기기, 환각 값 무시, index 누락/범위 초과 처리, 필터성 값 제외 등).

### `scripts/classify-unassigned-category-min.mjs` (신규, 실행 완료)
CSV를 읽어(따옴표 안 콤마/줄바꿈 대응 파서) 20건씩 배치로 `classifyBatch`를
호출하고, A/B열은 그대로 둔 채 C열("표준중분류(LLM 분류)")을 채운 새 CSV를
쓴다. 배치 하나가 실패해도 그 배치만 미지정으로 유지하고 나머지는 계속
처리하며, 연속 분당한도 초과 시에는 지금까지 처리한 결과만 저장하고
중단한다. DB는 갱신하지 않는다.

### `scripts/classify-unassigned-category-min.test.mjs` (신규, 3개 테스트)
`classifyBatch`를 모킹해 네트워크 없이 (1) A/B열 보존 + C열 채우기,
(2) 콤마 포함 주소 보존, (3) 배치 실패 시 해당 배치만 미지정 유지하고
나머지는 계속 처리하는지 검증.

## 실행 결과
- `node scripts/classify-unassigned-category-min.mjs 미지정_utf8.csv 미지정_분류결과.csv`
- 96/96 배치 성공, 매칭 1,318건 / 미지정 유지 602건 / 오류 0건.
- 결과 파일: `미지정_분류결과.csv`(1,920행, 3열: 명칭/주소/표준중분류(LLM 분류)).
  생성된 결과 CSV는 이번 세션의 기존 관례(export 결과물은 커밋하지 않음)에
  따라 커밋하지 않았다 — 사용자가 검토 후 필요한 항목만 실제 이관을 별도
  지시하면 그때 반영한다.

## 검증
- `npx vitest run scripts/lib/unassigned-category-classification.test.mjs scripts/classify-unassigned-category-min.test.mjs` — 17개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 232개 파일 2,558개) / `npm run build` 모두 통과.

## 특이 사항
이 작업은 DB를 갱신하지 않는 "분류 제안 CSV 생성"까지가 범위다. 사용자가
`미지정_분류결과.csv`의 C열을 검토(필요시 직접 수정)한 뒤, 실제로 몇 건을
어느 표준중분류로 이관할지 별도로 지시하면 그때 이번 세션의 기존
CSV-기반 이관 패턴(이름+주소 정확 매칭 → 모호 그룹 판단 → 마이그레이션
스크립트+테스트 작성 → 실행)을 그대로 적용할 예정이다.
