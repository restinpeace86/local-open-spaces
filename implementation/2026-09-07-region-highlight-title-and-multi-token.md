# 지역명 하이라이팅 — 블로그 제목 포함 + 시/도·시/군/구 토큰 둘 다 반영

## 구현 대상
사용자 지시: "search api 네이버꺼 관련 다시 기존처럼 하게 해줘 상호명 + 지점까지
있을경우 점 제외하고.. 예로 쿠우쿠우 달서점의 경우 쿠우쿠우 달서로.. 그리고
모심갈비의 경우 그냥 모심갈비로 검색.. 그리고 인천광역시 남동구 용천로
주소가 되어있는데.. 시군구 이름은 인천시 남동구.. 인천하고 남동이 블로그
제목이나 본문에 포함되어있는지 확인해서 지금과 같인 노란색 마커표시..
지금까진 본문에서 남동만 찾아서 색 표시 했는데.. 이제는 블로그 제목도
포함시키고 남동뿐만아니라 인천도.. 색 표시해줘"

## 구현 일시
2026-09-07

## 검색 쿼리 부분(앞 두 예시) — 이미 반영돼 있음, 코드 변경 없음
"쿠우쿠우 달서점 → 쿠우쿠우 달서"(상호명이 "점"으로 끝나면 지역명 붙이지 않고
점만 제거)와 "모심갈비 → 모심갈비"(점으로 안 끝나면 지역명을 붙임, 다만 이
스팟의 sigungu_name이 없으면 지역명 없이 상호명만) 두 사례 모두 직전
[[2026-09-07-smart-query-branch-suffix-dedup.md]]에서 이미 구현·검증한
`buildSmartBlogQuery`의 현재 동작과 정확히 일치함을 코드로 재확인했다 —
이 부분은 추가로 손대지 않았다. (단, "모심갈비"에 sigungu_name이 있는데도
지역명 없이 "그냥 모심갈비"만 검색되길 원하시는 것이었다면 별도로 다시
알려주시면 그때 반영한다.)

## 지역명 하이라이팅 범위 확장 (실제 변경 사항)
사용자가 준 실사례로 실제 데이터 형태를 확인했다: 주소는
"인천광역시 남동구 용천로..."이지만 `open_spaces.sigungu_name`은 정규화된
"인천시 남동구"(2토큰: 시/도 "인천시" + 시/군/구 "남동구")다. 기존
`extractSigunguCoreName`은 이 중 **마지막 토큰만**("남동구"→"남동") 썼는데,
이번 요청은 하이라이팅 목적으로는 **두 토큰 다**("인천", "남동") 써야 한다는
것 — 그리고 지금까지 하이라이트/미스매치 판정 대상이 **본문만**이었는데
**블로그 제목**도 포함해야 한다는 것.

### 변경 사항
- `src/lib/admin/naver-blog-search.ts`: `extractAllSigunguCoreNames(sigunguName)`
  신규 추가 — sigungu_name의 모든 토큰(시/도 + 시/군/구)에서 각각 시/군/구
  접미사만 뗀 배열을 반환한다(`extractSigunguCoreName`의 검색 쿼리 조합
  동작은 마지막 토큰 하나만 쓰는 기존 그대로 유지 — 이 신규 함수는
  하이라이팅 전용).
- `src/lib/admin/use-spot-curation-form.ts`: `regionKeyword: string` →
  `regionKeywords: string[]`로 교체. 미스매치 경고 판정도 본문뿐 아니라
  **블로그 제목**(검색 API 응답에 이미 있는 데이터, 추가 크롤링 없음)까지
  함께 확인해, 키워드 중 **하나라도** 제목이나 본문 어디에 있으면 경고하지
  않는다(둘 다 없을 때만 경고).
- `src/components/admin/blog-reference-viewer.tsx`: 블로그 제목을 이제
  `highlightKeywords`로 렌더링한다(기존엔 평문이었음). `regionKeywords`
  배열 전체를 본문/설명/제목 하이라이트에 공통으로 전달한다. 경고 문구도
  "본문에서" → "제목/본문에서"로, 지역명도 여러 개를 "/"로 이어 보여준다
  (예: "인천/남동").
- `blog-curation-modal.tsx`/`mobile-curation-workbench.tsx`: prop 이름을
  `regionKeyword` → `regionKeywords`로 갱신.

## 검증
- `src/lib/admin/naver-blog-search.test.ts`: `extractAllSigunguCoreNames`
  신규 3건(시/도+시/군/구 둘 다 반환, "도"는 접미사 아니라 안 잘림 확인,
  null/undefined/빈 문자열은 빈 배열).
- `src/components/admin/blog-curation-modal.test.tsx`: 기존 지역명 관련
  테스트를 새 배열/조인 형식에 맞게 갱신 + 신규 2건(시/도+시/군/구 토큰
  둘 다 하이라이트, 제목에만 지역명이 있어도 하이라이트되고 경고는 안 뜸).
- `npx tsc --noEmit` / `npm run test`(115개 파일, 1278개 테스트) /
  `npm run build` 전체 통과.
