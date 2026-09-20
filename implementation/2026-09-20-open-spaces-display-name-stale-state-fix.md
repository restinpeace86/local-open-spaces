# [OPEN_SPACES 노출 이름 — 스팟 큐레이션에서 저장한 값이 상세 모달에 즉시 반영 안 되던 문제 수정]

## 구현 대상
사용자 제보(2026-09-20, "편백회관 장곡점" 사례): "편백회관 장곡점의 경우
스팟큐레이션에서 노출이름 편백회관 시흥장곡점으로 수정되었는데.. 창닫고
다시열어도 그 상세페이지의 노출이름 수동수정쪽은 편백회관 장곡점으로 그대로
있던데?"

## 원인 조사
DB를 직접 조회해 확인 — `open_spaces.display_name`은 정확히
"편백회관 시흥장곡점"으로 저장돼 있었다(반영 자체는 정상). 문제는 클라이언트
상태였다:
1. `CurationFormModal.handleSubmit`(spot-curations-panel.tsx)은 스팟 큐레이션
   저장 응답(`data.item`)을 받은 "뒤에" `open_spaces.display_name`을 별도로
   PATCH한다(display_name은 spot_curations 컬럼이 아니라 open_spaces 컬럼이라
   별도 API 호출이 필요 — 지난 구현 기록 참고). 그런데 `onSaved(data.item)`으로
   넘기는 `data.item.open_spaces`는 그 PATCH 이전 시점 스냅샷이라 새
   display_name을 담고 있지 않았다.
2. open_spaces 상세 모달(`RawDataModal`)이 "🏷️ 스팟 큐레이션" 버튼으로 여는
   `SpotCurationQuickModal`은 `onSaved`만 받아 모달을 닫는 데만 썼고, 방금
   바뀐 display_name을 부모(`data-grid-client.tsx`의 `rows`/`selectedRow`)에게
   알리는 경로 자체가 없었다. 그래서 같은 페이지 세션 안에서 상세 모달을
   닫았다 다시 열어도(전체 새로고침 없이는) 예전에 불러온 로컬 state 그대로
   "편백회관 장곡점"이 보였다.

## 변경 사항
`src/components/admin/spot-curations-panel.tsx`:
`handleSubmit`에서 display-name PATCH가 끝난 뒤 `onSaved`로 넘기기 전에
`data.item.open_spaces.display_name`을 방금 반영한 값으로 직접 보정한다.

`src/components/admin/spot-curation-quick-modal.tsx`:
`onDisplayNameUpdated?: (id, nextDisplayName) => void` prop 추가.
`CurationFormModal`에 넘기는 `onSaved`를 감싸, 저장된 item의
`spot_id`/`open_spaces.display_name`으로 이 콜백을 먼저 호출한 뒤 원래
`onSaved`를 호출한다. `BlogCurationModal`의 `onServiceCategoryUpdated`와
동일한 "다른 모달이 open_spaces 필드를 바꿨을 때 부모에게 알리는" 관례를
그대로 따랐다.

`src/components/admin/raw-data-modal.tsx`:
`SpotCurationQuickModal` 호출부에 이미 RawDataModal이 받고 있던
`onDisplayNameUpdated` prop(지난 구현에서 `SpotDisplayNameEditor`용으로
만들어둔 것)을 그대로 전달만 추가했다 — `data-grid-client.tsx`의 `rows`/
`selectedRow` 갱신 로직은 이미 있어 손댈 필요가 없었다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 171개 파일 2058개 테스트 전부 통과(신규 2개 — 실제 버그
  재현 시나리오대로 "저장 응답이 예전 display_name을 담고 있어도 다시 열면
  방금 저장한 값이 프리필된다"(spot-curations-panel.test.tsx),
  "SpotCurationQuickModal 저장 시 onDisplayNameUpdated가 최신 값으로
  호출된다"(신규 spot-curation-quick-modal.test.tsx)).
- `npm run build` 통과.
- 실측: "편백회관 장곡점" 행을 다시 조회해 DB 값 자체는 처음부터 정상이었음을
  재확인(별도 데이터 수정 불필요, 순수 클라이언트 상태 버그).

## 특이 사항
`SpotCurationsPanel` 자체 탭(스팟 큐레이션 후보 목록)의 `CandidateSpotRow`
목록은 `display_name`을 화면에 표시하지 않아(원본 `name`만 나열) 이번
스테일 상태 버그의 관측 대상이 아니었다 — 그래서 그쪽은 손대지 않았다.
