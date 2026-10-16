# 유아숲체험원 CSV 추출 (네이버 플레이스 매칭 선행작업)

## 구현 대상
사용자 지시(2026-10-16): "자연/공원 > 유아숲체험원에 대하여 이전에 식당들에
대하여 csv파일로 추출한것처럼 추출해줘.. 이것들도 식당과 마찬가지로 네이버
플레이스 id 추출해봐."

## 구현 일시
2026-10-16

## 변경 사항
### `scripts/naver-kids-restaurant-agent/export-forest-experience.mjs` + 테스트(4개)
`export-restaurants.mjs`와 완전히 동일한 패턴(이 프로젝트가 이미 scripts/
루트에 `export-museum-name-address.mjs` 등 카테고리별 전용 export 스크립트를
여러 개 두는 관례, 제5장 제4조)을 `category_min='유아숲체험원'`에 재사용.
`metadata/유아숲체험원.csv`(명칭/주소/위도/경도)로 추출.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(331개 파일 3,299개 테스트) /
  `npm run build` 전부 통과.
- **실제 실행**: 330건 저장(374건 − 대표 아닌 중복 44건 제외). 한글 인코딩/
  쉼표 포함 주소 올바른 겹따옴표 처리 확인.

## 특이 사항
- 검색/매칭(`search-and-match.mjs`)과 속성추출(`scrape-kids-attributes.mjs`)은
  이미 임의의 csv 경로를 인자로 받을 수 있게 일반화돼 있어(2026-10-16 앞선
  변경) 새 스크립트 없이 그대로 재사용한다 — `node search-and-match.mjs
  metadata/유아숲체험원.csv`로 바로 실행 가능. 이 디렉토리 이름이
  "naver-kids-restaurant-agent"이지만, 실제 매칭 로직(상호명+주소로 네이버
  플레이스 검색/주소교차검증/LLM 보조 검색어)은 식당에 한정된 게 없어 다른
  카테고리에도 그대로 적용 가능함을 이번에 실증했다.
