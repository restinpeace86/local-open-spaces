# 이벤트 상세 팝업 — 연결된 스팟의 노출 중분류 확인/입력 (Step 118)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문)
사용자가 방이동생태학습관(open_spaces)을 이벤트와 연결(`events.space_id`, Step 114
개선사항10)해두었는데, 그 스팟이 스팟픽에서 노출 중분류(service_category_id)가
없으면 카테고리 필터로는 찾을 수 없다는 점을 짚었다(실제로 DB 조회 결과 해당
스팟의 `service_category_id`가 null임을 확인, 앞선 대화에서 설명함). 이어서:

> "이벤트픽에 대하여 관리자화면에서 현재 스팟 연결할수 있도록 해놨잖아.. 연결하면
> 연결됨이라고 뜨고 잘 연결되는거 같은데.. 해당 장소가 그럼 노출 중분류가 있는지를..
> 확인하고 노출중분류를 알려줘 노출중분류가 없으면 ..노출중분류 없다고 노출중분류를
> 입력하라고하고 해당 팝업화면에서 노출중분류 선택 및 저장 가능하도록 해줘"

## 변경 사항

### 1. 연결된 스팟의 노출 중분류 조회 API
- `src/app/api/admin/data-grid/space-link/route.ts`: 기존 PATCH(연결/해제)만 있던
  라우트에 GET을 추가. `?space_id=` 쿼리로 `open_spaces.id, name, standard_name,
  service_category_id`를 반환한다. 새 엔드포인트를 만들지 않고 이미 events↔
  open_spaces 연결을 다루는 이 라우트에 추가한 것(제5장 제4조).

### 2. `SpaceLinkEditor` (`raw-data-modal.tsx`) 확장
- 연결된 스팟이 바뀔 때마다(최초 로드 시 `row.space_id`, 또는 SpotPicker로 새로
  선택했을 때) 위 GET을 호출해 실제 스팟 이름(placeholder였던 "이름 확인은
  스팟픽에서"를 실제 이름으로 교체하는 부수 효과도 얻음)과 `service_category_id`를
  가져온다.
- 결과에 따라 3가지 상태를 보여준다:
  - 조회 중: "노출 중분류 확인 중..."
  - 있음: 초록 배지 "✅ 노출 중분류: {대분류} > {중분류}" (`serviceCategories` 목록에서
    이름을 찾아 표시, 못 찾으면 id 그대로 표시)
  - 없음: amber 경고 박스 "⚠️ 이 스팟은 노출 중분류가 없어요 — 카테고리 필터로는
    스팟픽에서 찾을 수 없어요. 지금 지정해 주세요." + `<select>`(기존
    `ServiceCategoryEditor`와 동일한 옵션 목록/문구 관례) + 저장 버튼.
- 저장 버튼은 기존 `/api/admin/open-spaces/bulk-category-mapping` POST를
  `ids: [연결된 스팟 id]` 하나짜리로 재사용한다(open_spaces 탭의 `ServiceCategoryEditor`가
  이미 이 라우트를 쓰고 있어 새 PATCH 라우트를 만들지 않음, 제5장 제4조). 저장
  성공 시 즉시 초록 배지로 전환된다(재조회 없이 로컬 상태만 갱신 — 이미 관리자가
  방금 고른 값이라 서버 재조회가 불필요).

### 3. `serviceCategories` 목록을 events 탭에도 전달
- `data-grid-client.tsx`: 기존에는 `service_category_id` 컬럼이 없는 events 탭에는
  노출 중분류 목록을 아예 로드/전달하지 않았다(open_spaces 탭 전용 가정). 이제
  `SpaceLinkEditor`가 "연결된 스팟(open_spaces)"의 노출 중분류를 다루므로, events
  탭 상세를 열 때도 `ensureServiceCategoriesLoaded()`를 함께 호출하고, `RawDataModal`에
  `serviceCategories`를 전달하도록 조건을 넓혔다(`tab === 'open_spaces' || tab ===
  'events'`).

## 실측 확인 (참고, 코드 변경 아님)
- `get_nearby_spaces_and_events`(필터 없는 기본 스팟픽 지도)는 `location_precision =
  'EXACT'`만 요구 — 노출 중분류 없어도 여기엔 나온다.
- `get_spots_by_service_category`(노출 중분류 칩으로 필터링할 때 호출되는 RPC)는
  `service_category_id = p_service_category_id`로 정확히 매칭돼야 — 없으면 그
  어떤 칩을 선택해도 걸리지 않는다.
- 따라서 "노출 중분류가 없으면 노출이 안 되는가?"는 부분적으로만 맞다: 필터 없이
  볼 땐 나오지만, 카테고리로 찾으려 하면 못 찾는다 — 이번 기능은 바로 이 사각지대를
  관리자가 이벤트↔스팟 연결 화면에서 바로 알아채고 고칠 수 있게 한다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 134 files / 1552 tests 전체 통과 (신규 2개: 노출 중분류
  있을 때 배지 표시, 없을 때 경고+선택+저장 후 배지로 전환; 기존 3개 테스트도
  새 GET 호출에 맞춰 fetch mock 보강).
- `npm run build`: 성공 (라우트 목록 기존과 동일, `/api/admin/data-grid/space-link` 그대로 유지).

## 특이 사항
- 저장 실패 시(네트워크 오류 등) 경고 박스 안에 에러 메시지만 보여주고 계속
  재시도할 수 있게 한다 — 화면 자체를 막지 않는다(제5장 제11조).
- 노출 중분류 선택은 필수 강제가 아니다(관리자가 "선택 안 함"으로 되돌릴 수도 있음,
  기존 `ServiceCategoryEditor`와 동일한 관례) — 이 기능은 어디까지나 "몰랐던 상태를
  알려주고 그 자리에서 고칠 수 있게" 하는 것이지 강제 검증 규칙을 추가하는 것이 아니다.
