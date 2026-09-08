# open_spaces 상세에서 스팟 큐레이션 바로 열기

## 구현 대상
사용자 지시: "스팟큐레이션..(가격, 메뉴 등 입력)도 블로그 큐레이션처럼
open_spaces 에서 데이터 상세 열었을때 블로그 큐레이션 하고 같은 레벨로
해당 버튼 아래에 스팟 큐레이션 버튼 만들어서 그 버튼 누르면 스팟큐레이션
팝업가서 입력하도록 해줘"

## 구현 일시
2026-09-08

## 배경
Step 74에서 "블로그 뱃지 큐레이션"(BlogCurationModal, 블로그 검색+뱃지)과
"스팟 큐레이션"(대표 이미지/영업시간/가격/메뉴, SpotCurationsPanel의
CurationFormModal)을 다시 분리했다. 분리 이후 스팟 큐레이션은 오직
관리자 화면의 별도 'spot_curations' 탭(먼저 후보 목록에서 골라 여는 흐름)
에서만 접근 가능했는데, 이번 지시는 open_spaces 탭에서 특정 행의 상세를
열었을 때도(블로그 큐레이션 버튼처럼) 곧바로 그 스팟의 스팟 큐레이션
팝업을 열 수 있는 진입점을 추가해 달라는 것이다.

## 변경 사항
1. **`spot-curations-panel.tsx`**: `CurationFormModal`(신규/수정 겸용 폼)과
   그 props 타입(`SpotCurationItem`, `SpotSearchResult`)을 export했다 —
   기존 폼을 그대로 재사용하기 위함(제5장 제4조, 새 폼을 만들지 않음).
2. **`spot-curation-quick-modal.tsx`**(신규): `SpotCurationQuickModal`
   컴포넌트. `SpotCurationsPanel`의 목록 흐름은 미리 "이 스팟에 큐레이션이
   있는지"를 알고 있어(목록 조회 시 이미 조인해둠) `CurationFormModal`에
   `initial`(수정) 또는 `presetSpot`(신규) 중 맞는 쪽을 확실히 넘겼지만,
   여기서는 `spot_id` 하나만 가지고 곧장 여는 것이라 그 판단을 이 컴포넌트가
   대신한다 — 마운트 시 `/api/admin/spot-curations?spot_id=...`를 한 번
   조회해 있으면 편집 모드, 없으면 신규 등록 모드로 같은
   `CurationFormModal`을 그대로 연다. 조회가 로딩 중일 때는 짧은 로딩
   오버레이를 보여준다. 조회 실패 시에도 신규 등록으로 안전하게 폴백한다
   (제5장 제11조 — 실제로 이미 있었다면 저장 시 서버가 409로 명확히
   안내한다).
3. **`raw-data-modal.tsx`**: open_spaces 탭 상세에 "🏷️ 스팟 큐레이션(대표
   이미지/영업시간/가격/메뉴 입력)" 버튼을 기존 "🔍 블로그로 큐레이션"
   버튼 바로 아래(같은 레벨)에 추가했다. 블로그 큐레이션 버튼과 달리
   `onServiceCategoryUpdated` 유무와 무관하게 항상 노출한다 — 스팟
   큐레이션은 노출 중분류를 바꾸지 않으므로 그 콜백이 필요 없다.

## 검증
- `raw-data-modal.test.tsx`: 신규 테스트 3개 — (1) 기존 큐레이션 없는
  스팟은 "+ 스팟 큐레이션 등록"(신규 모드)으로 열림, (2) 기존 큐레이션이
  있는 스팟은 "스팟 큐레이션 수정"(편집 모드, 기존 메뉴 프리필)으로 열림,
  (3) events 탭에는 버튼이 없음.
- `spot-curations-panel.test.tsx`: export 변경 이후 기존 9개 테스트 전부
  그대로 통과 확인.
- `npx tsc --noEmit` / `npm run test`(1332건) / `npm run build` 전체 통과.

## 특이 사항
- 스팟 큐레이션 버튼을 눌러 저장/닫으면 그냥 모달만 닫는다
  (`onSaved`/`onClose` 둘 다 `setIsSpotCurationModalOpen(false)`) —
  open_spaces 상세 화면 자체의 다른 필드(노출 중분류 등)에는 영향이 없어
  별도 콜백을 부모(`data-grid-client.tsx`)로 올릴 필요가 없었다.
