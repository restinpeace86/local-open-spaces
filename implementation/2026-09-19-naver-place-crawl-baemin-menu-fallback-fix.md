# [스팟 큐레이션 네이버 플레이스 크롤링 — 메뉴 미추출 버그 수정]

## 구현 대상
사용자 지시(2026-09-19): "개선사항 4관련 제대로 안되네 .. 대표 이미지는 가져오고
영업시간도 파싱되는거 같은데 ... 메뉴가 안돼" — 실제 URL(딸부자 닭갈비 닭도리탕,
placeId 1107293125)로 직접 테스트해보니 메뉴만 비어서 나온다는 버그 리포트.

## 구현 일시
2026-09-19

## 문제 진단
사용자가 제시한 실제 URL(`https://map.naver.com/p/search/.../place/1107293125?...`)로
라이브 페이지를 직접 다시 받아 확인했다(2026-09-18 최초 구현 때 검증에 썼던
"라라코스트 동탄점"과는 다른 업체). 이 업체는 네이버에 자체 메뉴(`PlaceMenuItem`
엔티티)를 등록하지 않고 배달의민족 메뉴만 연동돼 있었다 — `PlaceMenuItem:*` 키가
home/menu 페이지 둘 다에서 0건이었고, 실제 메뉴 데이터는
`placeDetail.baemin.menuGroups[].menus[]`(엔티티 키 `PlaceDetail_BaeminMenu:*`,
`{ name, price(문자열), images[] }`)에 있었다. 기존 `extractMenuItems()`는
`PlaceMenuItem:` 접두어만 스캔해 이 케이스를 완전히 놓치고 있었다 — 대표 이미지/
영업시간은 다른 필드(`topPhotos`, `newBusinessHours`)에서 오므로 정상 동작했던 것.

## 코드 변경
`src/lib/admin/naver-place-crawler.ts`:
- `extractBaeminMenuItems()` 신규 — `PlaceDetail_BaeminMenu:*` 엔티티를 접두어
  스캔해(Apollo 정규화 캐시라 여러 메뉴 그룹이 같은 항목을 참조해도 자연히 중복 없이
  모임, 기존 `PlaceMenuItem` 스캔과 동일한 방식) 가격 문자열("14000")을 숫자로
  변환하고 표시 텍스트("14,000원")를 만든다.
- `extractNaverPlaceCrawlResult()`: 자체 메뉴(`PlaceMenuItem`)가 하나라도 있으면
  그쪽을 그대로 쓰고, 자체 메뉴가 아예 없을 때만 배민 메뉴로 대체한다 — 배달가와
  매장가가 다를 수 있어 두 출처를 섞지 않는다(추측 금지, 제3장 제5조).

## 검증
- `src/lib/admin/naver-place-crawler.test.ts`: 실측 스키마 그대로의 픽스처로
  "배민 메뉴만 있으면 대체", "자체 메뉴가 있으면 배민 메뉴 무시" 2개 케이스 추가
  (25개 전체 통과).
- `npx tsc --noEmit`/`npm run test`(166개 파일, 1957개 테스트 전체 통과)/
  `npm run build` 모두 통과.
- 로컬 개발 서버를 새로 띄워(기존 세션의 잔여 프로세스 없음을 먼저 확인)
  `/api/admin/spot-curations/naver-crawl`에 사용자가 제시한 실제 URL을 그대로
  POST해 실측 검증: 메뉴 26개 항목("딸부자 닭갈비(1인분) 14,000원" 등) 정상 추출,
  대표 이미지 Supabase Storage 재호스팅도 정상 확인 후 테스트 이미지는 정리했다.

## 특이 사항
없음 — 2026-09-18 최초 구현의 설계(순수 파싱 함수 분리, 실측 우선 검증)는 그대로
유효했고, 이번엔 검증에 쓴 업체가 자체 메뉴 미등록 케이스라 놓쳤던 부분만 보강했다.
