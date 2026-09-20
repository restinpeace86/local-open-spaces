# [스팟 큐레이션 — 네이버 플레이스 ID 실제 저장 + "이미 가져온 것" 표시]

## 구현 대상
사용자 지시(2026-09-20): "그리고 처음에 스팟 큐레이션 등록때 네이버의 스팟 id
1419884543 이런거 저장하라고 했는데.. 이거 관련해서 스팟 큐레이션에서 보여줘
한번 이미 가져온거는."

## 조사 결과 — 컬럼은 있었지만 실제 저장 경로가 없었다
`open_spaces.naver_place_id`(text, unique, nullable)는
`scripts/migrations/2026-09-19-add-naver-place-id-to-open-spaces.sql`로 이미
추가돼 있었고, 딸부자 닭갈비 1건(`naver_place_id: '1107293125'`)만 그 도입
당시 수동으로 백필돼 있었다(DB 직접 조회로 확인 — 이 1건이 유일했다). 크롤링
라우트(`/api/admin/spot-curations/naver-crawl`)는 URL에서 뽑아낸 `placeId`를
이미 응답에 포함해 내려주고 있었지만(`extractNaverPlaceId` 결과), 클라이언트
(`CurationFormModal`)는 이 필드를 타입에조차 포함하지 않아 완전히 버려지고
있었다 — "저장하라고 했다"는 지시가 컬럼 추가까지만 실행되고 실제 저장 로직은
빠져 있던 상태였다.

## 변경 사항

### 저장 경로 신설
`src/app/api/admin/data-grid/naver-place-id/route.ts`(신규): display-name
route와 동일한 "필드 하나당 라우트 하나" 관례. `naver_place_id`는 unique
제약이 있어 다른 스팟에 이미 연동된 값을 또 저장하려 하면 23505 에러를
받는데, 이를 "이 네이버 플레이스는 이미 다른 스팟에 연동되어 있습니다"로
명확히 안내한다(추측으로 조용히 덮어쓰지 않음).

`src/components/admin/spot-curations-panel.tsx`:
- `handleCrawlNaverPlace`의 응답 타입에 `placeId`를 추가하고, 크롤링 성공 시
  `naverPlaceId` state에 반영한다(상호명 자동 채움과 동일한 패턴).
- `handleSubmit`에서 스팟 큐레이션 저장이 성공한 뒤, 값이 바뀐 경우에만 위
  라우트로 PATCH한다(display_name과 동일하게 별도 API 필요 — open_spaces
  컬럼이라 spot_curations 저장 본문에는 안 실림). 실패해도 이미 성공한
  큐레이션 저장을 되돌리지 않는다.
- `data.item.open_spaces`를 onSaved로 넘기기 전에 방금 반영한 naver_place_id로
  보정한다(직전 "편백회관 장곡점" display_name 스테일 상태 버그와 동일한
  패턴이라 처음부터 함께 고쳐 넣었다).

### "이미 가져온 것" 표시
- 폼을 열 때 `initialNaverPlaceId`(수정 모드는 `initial.open_spaces.naver_place_id`,
  신규 등록은 `presetSpot.naver_place_id`)가 있으면:
  - "네이버 플레이스 주소로 자동 채우기" URL 입력창을
    `https://pcmap.place.naver.com/restaurant/{id}/home`으로 미리 채운다 —
    관리자가 URL을 다시 찾아 붙여넣지 않고 "⚡ 데이터 가져오기"만 눌러 바로
    새로고침할 수 있다.
  - "✅ 이미 연동된 네이버 플레이스(ID: {id})" 안내 문구를 보여준다.

### 스테일 상태 방지(직전 버그 수정과 동일한 패턴 선반영)
`display_name`에서 겪은 것과 같은 문제(스팟 큐레이션에서 바꾼 값이 open_spaces
상세 모달에 바로 반영 안 됨)가 `naver_place_id`에서도 똑같이 날 수 있어, 처음
만들 때부터 같은 방어 코드를 함께 넣었다:
- `spot-curation-quick-modal.tsx`: `spotNaverPlaceId` prop(프리필용) +
  `onNaverPlaceIdUpdated` 콜백(저장된 최신 값을 부모에 즉시 알림) 추가.
- `raw-data-modal.tsx`: `onNaverPlaceIdUpdated` prop을 그대로 전달만 추가.
- `data-grid-client.tsx`: `AdminOpenSpaceRow`에 `naver_place_id` 추가하고,
  `onNaverPlaceIdUpdated` 콜백에서 `rows`/`selectedRow`를 즉시 갱신한다
  (`onDisplayNameUpdated`와 완전히 동일한 패턴).

### 연쇄 타입/API 반영
`SpotCurationItem.open_spaces`, `SpotSearchResult`, `CandidateSpotRow`에
`naver_place_id` 추가. `/api/admin/spot-curations` GET/POST/PATCH의
`open_spaces(...)` 조인 select 3곳에 `naver_place_id` 추가.
`/api/admin/data-grid`의 `OPEN_SPACES_COLUMNS`에도 추가(후보 목록 프리필용).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 171개 파일 2060개 테스트 전부 통과(신규 2개 —
  "⚡ 데이터 가져오기로 크롤링하면.. 저장 시 함께 반영된다",
  "이미 연동된 스팟을 다시 열면 URL이 자동으로 채워지고 안내 문구가 보인다").
- `npm run build` 통과.
- 실측: 현재 DB에 `naver_place_id`가 채워진 행은 딸부자 닭갈비 1건뿐임을
  재확인 — 사용자가 예시로 든 "1419884543"은 실제 DB 값이 아니라 설명용
  예시였다. 별도 데이터 백필은 필요 없고, 이제부터 관리자가 스팟 큐레이션에서
  크롤링+저장하면 자동으로 쌓인다.
