# open_spaces 상세 팝업에 운영시간/휴관일 노출

## 구현 대상
사용자 지시(2026-09-27): "어디에 추가됐는지 관리자 화면에서 확인이 어려운데..
추가된것중 한두개정도 샘플로 주고 어디에 추가됐는지 알려줘" — 직전에 백필한
`operating_hours`([[2026-09-27-childrens-library-service-category-and-operating-hours]])
값을 관리자가 화면에서 확인할 방법이 없었다.

## 원인
`operating_hours` 컬럼이 그리드 목록에도 없고, 상세 팝업(`raw-data-modal.tsx`)의
제목/부제에도 없었다 — 상세 팝업의 "전체 컬럼" 섹션은 `raw_data`(JSONB) 원문만
key-value로 나열하는데, `operating_hours`는 `raw_data`와 별개인 최상위 컬럼이라
그 목록에도 안 잡힌다. 즉 DB에는 정상적으로 저장돼 있었지만 화면 어디에도
노출 경로가 없었다.

## 변경 사항
`src/components/admin/raw-data-modal.tsx`의 `getModalContent`: open_spaces
행의 부제에 `operating_hours`가 있을 때만 " · 🕐 {operating_hours}"를 덧붙인다
— events 탭이 이미 부제에 "행사기간(start~end)"을 보여주는 것과 동일한 관례.

## 검증
- `src/components/admin/raw-data-modal.test.tsx`(신규 2개): operating_hours가
  있으면 부제에 보임, 없으면 기존 형태(`{source_type} · {external_id}`) 유지.
  이 모달이 데스크톱/모바일 두 버전을 동시에 렌더링하는 기존 관례(다른 테스트도
  `getAllByText` 사용) 그대로 따랐다.
- `npx tsc --noEmit` / `npm run test`(209개 파일 2,428개) / `npm run build`
  모두 통과.

## 확인용 샘플(실제 DB 값)
- 대방어린이도서관(서울 동작구): `operating_hours` = "휴관일 매주 월요일,
  법정공휴일"
- 서구어린이도서관 주차장(대구 서구): `operating_hours` = "평일 08:00~18:00,
  주말 00:00~23:59, 휴관일 연중무휴"

관리자 화면에서 이 두 스팟을 검색해 상세 팝업을 열면 이제 제목 바로 아래
부제에 위 값이 보인다.
