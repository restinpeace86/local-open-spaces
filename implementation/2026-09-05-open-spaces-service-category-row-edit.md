# open_spaces 개별 행 노출 중분류(service_category_id) 수동 수정

## 구현 대상
사용자 지시: "일단 노출 중분류 -> 노출중분류 변경할수있도록 해줘 open_spaces쪽에서..."
— 지금까지는 노출 중분류를 (1) category_min 전체 일괄, (2) 여러 행 선택(RowPicker),
(3) 중복 그룹 병합 세 경로로만 매핑할 수 있었고, 관리자 화면(/admin/data-grid)에서
open_spaces 행 하나를 열어 그 자리에서 바로 값을 보거나 바꾸는 방법이 없었다(표준
중분류(category_min)는 이미 상세 모달에서 바로 수정 가능했던 것과 대조적).

## 구현 일시
2026-09-05

## 변경 사항
- `src/app/api/admin/data-grid/route.ts`: open_spaces 목록 조회 SELECT 컬럼에
  `service_category_id` 추가 — 지금까지는 매핑 API들만 이 값을 갱신할 뿐, 목록
  조회 응답 자체에는 아예 없어서 상세 모달이 현재 값을 알 방법이 없었다.
- `src/components/admin/data-grid-client.tsx`: `AdminOpenSpaceRow`에
  `service_category_id` 필드 추가. 노출 중분류 목록(serviceCategories)을 open_spaces
  행을 처음 열 때 한 번만 조용히 조회한다(관리자 페이지 성능 최적화 관례 — 자동
  조회 금지, 실제로 필요한 시점에만).
- `src/components/admin/raw-data-modal.tsx`: `ServiceCategoryEditor` 신규(기존
  `CategoryMinEditor`와 동일한 UI 패턴) — open_spaces 탭 전용, 현재 매핑된 노출
  중분류를 배지로 보여주고 드롭다운으로 바꾸거나 "(선택 안 함)"으로 해제할 수 있다.
  새 PATCH 엔드포인트를 만들지 않고, 이미 있는
  `POST /api/admin/open-spaces/bulk-category-mapping`을 `ids: [row.id]` 하나짜리로
  재사용한다(제5장 제4조 기존 구조 우선).
- `src/app/api/admin/open-spaces/bulk-category-mapping/route.ts`: `ids` 경로에서만
  `service_category_id`에 명시적 `null`(선택 해제)을 허용하도록 확장 — 기존
  category_min 전체 일괄 경로는 몇만 건 단위로 실수 위험이 커 계속 값 필수로
  남겨뒀다.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 109개 파일 / 1147개 테스트(기존 1143개 + 신규 4개: open_spaces
  전용 노출 여부, 현재 값 배지, 값 변경 저장, 선택 해제 저장) 전체 통과.
- `npm run build` 통과.

## 특이 사항
- **events 탭에는 이 에디터가 없다** — `service_category_id`는 open_spaces 전용
  컬럼이라 events 행에는 애초에 존재하지 않는다(스키마 확인).
- **"선택 해제"(null로 되돌리기)는 개별 행 경로에서만 허용된다** — category_min
  전체를 대상으로 하는 대량 매핑 경로는 몇만 건 단위로 한 번에 되돌릴 수 없이
  반영되는 작업이라, 실수로 전체를 한 번에 초기화하는 사고를 막기 위해 계속 값을
  필수로 요구한다.
