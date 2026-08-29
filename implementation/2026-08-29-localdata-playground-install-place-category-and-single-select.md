# [행안부 어린이놀이시설 설치장소코드 매핑 + 박물관/미술관 분리 + 스팟픽 단일 선택 전환]

## 요구사항 (원문 대비 확정 과정)
사용자 원문은 새로운 OpenAPI(`apis.data.go.kr/1741000/exfc5/getExfc5`)를 신규 연동해
설치장소코드(A003/A013/A022/A030/A032/A033/A092/A093) 기준으로 필터링·매핑하라는
내용이었다. **실제 API를 직접 호출해 확인한 결과, 사용자가 지정한 URL과 설명한 필터링
로직이 서로 다른 API를 가리키고 있었다**(추측 금지 원칙에 따라 구현 전 대표 확인):
- `exfc5/getExfc5`: 실제 호출 결과 "우수어린이놀이시설" 수상작 183건만 반환하고
  (exfcSn/pfctSn/rmk 등), 설치장소코드 필드 자체가 없음.
- 사용자가 설명한 설치장소코드(`instlPlaceCd`, 예: "A013"="놀이제공영업소")는 실제로는
  **이미 어댑터가 구현된 `pfc3/getPfctInfo3`(전국어린이놀이시설정보,
  LOCALDATA_PLAYGROUND) API**에서 확인됨(8만5천여 건, 이미 전수 수집 중).

대표 확인 결과 **기존 pfc3 어댑터(LOCALDATA_PLAYGROUND)를 instlPlaceCd 기준으로 개선**하는
것으로 범위 확정. 대화 중 추가로 확인된 사항:
- 박물관과 미술관 중분류는 별개로 유지(스팟픽 필터 칩도 분리).
- A030 자연휴양림/A092 육아종합지원센터/A093 유아교육진흥원은 새 중분류 대상.
- 스팟픽 핵심 중분류 필터를 복수 선택에서 단일 선택으로 변경.

## 구현 일시
2026-08-29

## 1. 설치장소코드(instlPlaceCd) → category_min 매핑

실측(pfc3 API 15,000건 이상 샘플)으로 각 코드의 실제 시설명을 확인해 매핑을 확정했다
(예: A013 샘플에 "서울형 키즈카페 마포구 서교동2호점"이 실제로 존재 → 키즈카페 확인):

| instlPlaceCd | instlPlaceCdNm | category_min |
| :--- | :--- | :--- |
| A003 | 도시공원 | 공원(기존 값) |
| A013 | 놀이제공영업소 | 키즈카페(기존 값) |
| A022 | 박물관 | 종합/기타박물관(기존 값, 미술관과 별개) |
| A030 | 자연휴양림 | 자연휴양림(기존 값) |
| A032 | 야영장 | 캠핑장(기존 값) |
| A033 | 공공도서관 | 도서관(기존 값) |
| A092 | 육아종합지원센터 | 육아종합지원센터(신규) |
| A093 | 유아교육진흥원 | 유아교육진흥원(신규) |

매핑 테이블은 `scripts/ingest/lib/localdata-playground-install-place-mapping.mjs`에
단일 출처로 두고, `playground-adapter.mjs`(신규 upsert 시)와 백필 스크립트(기존 행
적용 시)가 공유한다. `category_min_source='RAW'`(소스 자체가 가진 구조화된 분류값을
그대로 사용 — 키워드 추측이 아님)로 태깅한다. 매핑 대상이 아닌 코드는 기존과 동일하게
null로 남겨 기존 배치 후처리(category-rules.mjs 키워드 매칭)에 맡긴다 — 기존에
수집되던 다른 설치장소코드 데이터는 드롭하지 않는다(범위 축소 없음).

## 2. 실측 중 발견한 문제 — COALESCE 안전 병합이 새 매핑을 막음

어댑터 수정 후 실제로 전체 재수집(`node scripts/ingest/playground.mjs`, 82,381건
upsert)을 실행했으나, DB 확인 결과 A092/A093은 **143/49건 모두 0건 반영**됐다. 원인은
`upsertRowsSafeMerge()`의 COALESCE 안전 병합(이미 채워진 기존 컬럼값은 새 값으로
덮어쓰지 않음, 2026-08-25 Decision 017 도입)이 대부분의 기존 행에 이미
`category_min_source='RULE'`(범용 키워드 매칭)로 다른 값이 채워져 있어 새로 들어오는
더 정확한 instlPlaceCd 기반 값을 무시했기 때문이다. 대표 확인 결과, 이 8개 설치장소코드에
한해서는 **기존 값과 무관하게 명시적으로 덮어쓰는 백필**을 추가하기로 확정
(`legacy-source-category-mapping.mjs`가 NULL 행만 채우는 것과 의도적으로 다름 — 소스
자체의 구조화된 분류가 범용 키워드 추측보다 신뢰도가 높다는 것이 이번 지시의 취지).

`scripts/ingest/lib/localdata-playground-install-place-mapping.mjs`의
`applyPlaygroundInstallPlaceCategoryMapping()`을 신설해 `source_type='LOCALDATA_
PLAYGROUND'` + 8개 instlPlaceCd 범위로 엄격히 제한한 UPDATE를 수행하고,
`run-monthly.mjs`에 `PLAYGROUND_INSTALL_PLACE_MAPPING` 단계로 상시 연결해(다른
카테고리 후처리 단계와 동일한 패턴) 향후 배치에서도 RULE 매칭이 먼저 채간 값을 자동으로
재정정하도록 했다.

## 3. 박물관/미술관 분리 + 신규 중분류 칩 (스팟픽 `/nearby`)

`src/lib/spaces/spot-category-groups.ts`의 `CORE_SPOT_CATEGORIES`를 개편:
- "박물관(미술관 포함)" 1개 칩 → "박물관"(`종합/기타박물관`+`역사박물관`)과
  "미술관"(`미술관`) 2개 칩으로 분리.
- "자연휴양림"/"육아종합지원센터"/"유아교육진흥원" 칩 신규 추가.
- "캠핑장"(A032 매핑 대상)은 이번 지시에 신규 칩으로 명시되지 않아 필터 칩은 추가하지
  않았다 — 데이터 자체는 category_min='캠핑장'으로 계속 적재된다.

어드민 `category-min-groups.ts`(대분류 그룹핑)와 `category-min-fallback.ts`(RPC 실패
시 안전망 목록)에도 신규 값 2종을 반영해 관리자 필터에서도 정상 노출되게 했다.

## 4. 스팟픽 핵심 중분류 필터 — 복수 선택 → 단일 선택 전환

`SpotCategoryFilter`/`MapExplorer`의 상태를 `selectedCategoryIds: string[]`(최대 5개
다중 선택)에서 `selectedCategoryId: string | null`(단일 선택)로 단순화. 이미 선택된
칩을 다시 누르면 해제(전체보기 복귀), 다른 칩을 누르면 선택이 교체된다(라디오 버튼
동작). 복수 선택이 아니므로 "최대 개수 초과" 케이스 자체가 사라져 관련 토스트/타이머
로직(`MAX_SPOT_CATEGORY_MIN_SELECTION`, `handleLimitExceeded`)을 전부 제거했다.
AI 추천 액션 칩은 이 선택 상태와 무관하게 그대로 동작한다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과
- `npm run test`(59파일 585건, 신규 `localdata-playground-install-place-mapping.
  test.mjs` 8건 + `playground-adapter.test.mjs` instlPlaceCd 매핑 테스트 10건 포함) 통과
- `npm run build` 통과

### 실측 검증(로컬 수동 실행, 프로덕션 DB)
- `node scripts/ingest/playground.mjs --dry-run`: 85,298건 수신, 82,381건 유효 변환
  확인(API 정상 응답, 파싱 에러 없음).
- `node scripts/ingest/playground.mjs`(실제 적재): 85,297건 RAW 보존 + 82,381건
  open_spaces upsert 성공.
- 백필 스크립트 실행: 82,409건 스캔, 3,841건 UPDATE(공원 1420/키즈카페 1890/캠핑장
  86/자연휴양림 119/도서관 45/종합·기타박물관 91/육아종합지원센터 142/유아교육진흥원 48).
- DB 직접 조회로 8개 category_min 값이 모두 정상 반영됨을 확인, 표본 5건(유아교육진흥원)
  주소/좌표/한글 텍스트 인코딩 손상 없음을 확인.
- Playwright로 `/nearby` 실제 화면에서 신규 칩(박물관/미술관 분리, 자연휴양림/
  육아종합지원센터/유아교육진흥원) 노출 확인, "공원" 선택 후 "도서관" 선택 시 이전
  선택이 자동 해제되는 단일 선택 동작 확인(200건 → 공원 45건 → 도서관 4건 → 재클릭
  시 200건 복귀), category_min 필터-API 연동 정상 확인.

## 특이 사항
- `exfc5/getExfc5`는 이번 작업에서 연동하지 않았다 — 실제 반환 데이터가 사용자 설명과
  맞지 않아(설치장소코드 없음, 183건의 수상작 목록) 대표 확인 하에 제외했다.
- COALESCE 안전 병합(`upsertRowsSafeMerge`)을 이번 8개 코드에 한해 명시적으로 우회하는
  것은 대표의 명시적 승인 사항이다 — 다른 매핑/소스에는 영향이 없도록 범위를 엄격히
  제한했다(source_type='LOCALDATA_PLAYGROUND' + 8개 instlPlaceCd만).
