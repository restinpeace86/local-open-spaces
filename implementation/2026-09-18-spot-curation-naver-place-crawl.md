# [관리자 스팟 큐레이션 — 네이버 플레이스 URL 크롤링 자동 채움]

## 구현 대상
`implementation/todo.md` [개선사항 4] — 관리자 페이지 스팟 큐레이션(및 open_spaces
상세팝업의 "스팟 큐레이션" 버튼)에 네이버 플레이스 URL을 입력하면 대표 이미지/영업시간/
메뉴/기본정보/뱃지(편의시설)를 자동으로 가져와 채우는 기능.

## 구현 일시
2026-09-18

## 실현 가능성 확인 (구현 전 실측)
seoul-yeyak-adapter의 가격 크롤링이 "동적 로딩 구조라 헤드리스 브라우저 없이는 불가능해
미구현"했던 선례가 있어, 먼저 pcmap.place.naver.com이 정적 fetch로 필요한 데이터를
얻을 수 있는지부터 실측했다. 결과: 이 페이지는 Next.js + Apollo Client 서버 렌더링
페이지라 `window.__APOLLO_STATE__`에 필요한 데이터(업체 정보/영업시간/메뉴/사진)가
전부 JSON으로 정적 HTML 안에 그대로 있다 — 헤드리스 브라우저 없이 일반 fetch만으로
가능함을 확인했다(실제 URL "라라코스트 동탄점"으로 직접 검증).

## 변경 사항

### 순수 로직: `src/lib/admin/naver-place-crawler.ts` (신규)
- `extractNaverPlaceId(url)`: `map.naver.com/p/entry/place/{id}`, `pcmap.place.naver.com/
  restaurant/{id}` 등 여러 URL 형식에서 장소 ID 추출.
- `buildNaverPlaceUrls(id)`: 사용자가 제시한 두 URL(`/restaurant/{id}/home`,
  `/restaurant/{id}/menu/list`) 생성.
- `parseApolloState(html)` / `denormalizeApolloValue(state, value)`: Apollo 정규화
  캐시에서 JSON을 파싱하고 `{ __ref }` 포인터를 재귀적으로 실제 객체로 치환(순환 참조
  방어 포함) — 특정 필드만 하드코딩하지 않고 범용으로 처리.
- `extractNaverPlaceCrawlResult(placeId, homeHtml, menuHtml)`: 업체 기본 정보(이름/
  도로명주소/지번주소/전화/카테고리/편의시설), 영업시간 원시 데이터
  (`placeDetail.newBusinessHours[0].businessHours[]`, 요일별 시작/종료/브레이크/휴무
  사유), 대표 이미지(`placeDetail.topPhotos.items[]` 중 `mediaSource: "business"`
  우선), 메뉴(`PlaceMenuItem:*` 키 전수 스캔, home/menu 두 페이지 결과를 이름 기준
  병합)를 추출.
- `formatBusinessHoursText`/`formatMenuText`: 기존
  `src/lib/admin/spot-curation-parsers.ts`의 `parseOperatingHoursText`/`parseMenuText`가
  이해하는 텍스트 형식으로 변환(새 파서를 만들지 않고 기존 것을 재사용, 제5장 제4조).

### API 라우트: `src/app/api/admin/spot-curations/naver-crawl/route.ts` (신규)
`POST { naverUrl }` → 위 순수 함수로 두 페이지를 병렬 fetch·파싱하고, 대표 이미지는
기존 `/api/admin/spot-curations/upload-image`와 동일한 버킷(`spot-curation-images`)·
리사이즈 규칙(`resizeImageForStorage`, 1400px 상한)으로 재호스팅해 우리 자체 URL로
변환 후 반환한다.

### UI: `src/components/admin/spot-curations-panel.tsx`의 `CurationFormModal`
- 폼 최상단(헤더 바로 아래)에 네이버 플레이스 URL 입력 + "⚡ 데이터 가져오기" 버튼 추가.
- 성공 시:
  - 대표 이미지 → `imageUrl` 즉시 반영.
  - 영업시간 텍스트 → `hoursRaw`에 채우는 동시에 기존 "영업시간 자동 파싱"과 동일한
    `parseOperatingHoursText` 로직을 그 자리에서 호출해 open/close/break/lastOrder까지
    원클릭으로 채운다.
  - 메뉴 텍스트 → `menuRaw`에 채우는 동시에 기존 "메뉴 자동 파싱"과 동일한
    `parseMenuText`+`detectKidsMenuItems` 로직을 호출.
  - 업체명/주소/전화/편의시설은 참고용 미리보기 패널로만 표시(비교용) — 이 모달이
    관리하는 `spot_curations` 테이블에는 대응 컬럼이 없다(이름/주소는 이미 연결된
    `open_spaces` 값이라 별도 편집 UI가 이미 존재).
- 이 `CurationFormModal`은 스팟 큐레이션 탭과 open_spaces 상세팝업의 "스팟 큐레이션"
  버튼 양쪽에서 동일하게 재사용되는 컴포넌트라(2026-09-08 기존 구현), 이 한 곳에만
  구현해도 요구사항 "두 진입점 모두 동일하게 동작"이 자동으로 충족된다.

## 실측 장애와 수정
`placeDetail.topPhotos`를 처음엔 사진 배열 자체라고 가정했는데, 실제로는
`{ total, items: [...] }` 형태였다 — 실제 라이브 페이지로 직접 검증하기 전까지는
대표 이미지가 항상 null로 나오는 버그였다. 실제 fetch로 원본 JSON을 다시 확인해
`topPhotos.items`로 고쳤다(테스트 픽스처도 동일하게 정정).

## 검증
- `npx tsc --noEmit`/`npm run test`(전체 166개 파일 1936개 테스트, naver-place-crawler
  신규 23개 포함)/`npm run build` 모두 통과.
- **실제 네이버 플레이스 페이지로 end-to-end 실측 검증**: 로컬 dev 서버를 띄우고
  `POST /api/admin/spot-curations/naver-crawl`에 실제 URL(라라코스트 동탄점)을 보내
  이름/주소/전화/카테고리/편의시설/영업시간 텍스트/메뉴 텍스트/재호스팅된 이미지 URL이
  전부 정확히 반환되는지 확인했고, 재호스팅된 이미지가 실제로 Supabase Storage에서
  200으로 응답하는지도 확인했다(테스트용 업로드 파일은 이후 삭제).
- **브라우저 UI 자체는 확인하지 못했다** — 이 환경에 브라우저 자동화 도구가 없어
  React 상태 반영 로직(버튼 클릭 → 폼 필드 채움)은 타입 체크와 API 실측으로만
  검증했고, 실제 화면에서 클릭해 눈으로 확인하지는 않았다. 사용자가 관리자 화면에서
  직접 눌러보고 문제가 있으면 알려주시면 바로 고치겠다.

## 특이 사항
- 뱃지(주차 등 편의시설)는 이 화면(`CurationFormModal`)에는 체크박스 UI가 없다 —
  기존 구조상 일반 뱃지는 `blog-curation-modal.tsx`라는 별도 화면에서 관리한다
  (2026-09-08 "블로그 뱃지큐레이션하고 스팟큐레이션 합쳤는데 다시 분리해줘" 지시로
  이미 분리됨). 이번 작업은 그 구조를 그대로 유지하고, 크롤링한 편의시설 정보는
  참고용 미리보기로만 노출했다 — 필요하면 blog-curation-modal 쪽에도 이 크롤링
  결과를 연동할지 별도로 확인이 필요하다.
- 영업시간은 요일마다 시간이 다르면(예: 평일/주말 다름) 텍스트에 전부 나열은 되지만
  기존 파서(`parseOperatingHoursText`)가 "가장 많은 요일이 속한 시간대"만 자동으로
  필드에 반영한다 — 나머지는 관리자가 원문(hoursRaw)을 보고 직접 보정해야 한다(기존
  파서의 기존 한계를 그대로 계승, 새로 만들지 않음).
