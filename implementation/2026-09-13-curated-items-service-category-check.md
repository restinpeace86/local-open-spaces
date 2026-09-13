# 큐레이션/제휴 상품 등록에도 노출 중분류 확인/입력 UI 추가

## 구현 대상
사용자 지시(2026-09-13):
> 그리고 큐레이션/제휴 상품 등록탭에서도 장소 입력하면 해당 장소가 노출
> 중분류 없으면 관리자가 입력할수있도록 노출중분류도 뜨게 해줘 events쪽 의
> 관리자 상세 팝업에서 장소 넣으면 노출중분류 매핑되어있는지 체크해서 없으면
> 넣으라고해주는것처럼.

## 구현 일시
2026-09-13

## 기존 기능(재사용 대상) 확인
"events쪽의 관리자 상세 팝업"은 `raw-data-modal.tsx`의 `SpaceLinkEditor`
([연결된 스팟의 노출 중분류 확인/입력], 2026-09-12 사용자 지시)를 가리킨다 —
이벤트에 스팟을 연동하면 그 스팟의 `service_category_id`를 조회해, 있으면
초록 배지로, 없으면 경고+선택+저장 UI를 그 자리에서 보여준다.

`curated-items-panel.tsx`(큐레이션/제휴 상품 탭)의 등록/수정 폼인
`curated-item-form-modal.tsx`에도 이미 스팟 연동 기능(`spot_id`, 2026-09-10
사용자 지시)이 있었지만, 이 노출 중분류 확인/입력은 없었다.

## 변경 사항
1. `SpaceLinkEditor` 안에 있던 "노출 중분류 조회/경고/선택/저장" 로직을
   `SpotServiceCategoryCheck`(`src/components/admin/spot-service-category-
   check.tsx`, 신규)로 뽑아냈다 — `spotId`와 `serviceCategories`만 받는
   순수 프레젠테이션 컴포넌트다(제5장 제4조 기존 구조 우선, 같은 로직을
   두 번 만들지 않음).
   - `SpaceLinkEditor`에는 "선택된 스팟이 아직 이름 확인 중"인 자기만의
     placeholder 이름 해석 로직이 있어(이벤트가 이미 space_id를 갖고 있을 때
     이름을 나중에 불러옴) 이 부분만 그 컴포넌트에 남기고, 노출 중분류
     부분만 공유 컴포넌트로 옮겼다.
2. `curated-item-form-modal.tsx`에 `SpotServiceCategoryCheck`를 붙였다 —
   `SpotPicker`로 장소를 고르면 바로 아래에 노출 중분류 상태가 뜨고, 없으면
   그 자리에서 선택·저장할 수 있다. 이 폼은 원래 `serviceCategories`를 쓸
   일이 없어 조회하지 않았는데, 자체적으로 `/api/admin/service-categories`를
   조회하도록 추가했다(다른 자기완결 모달과 동일한 관례 — 부모 컴포넌트 체인에
   새 prop을 꿰지 않음).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 142 파일 / 1674건 전체 통과.
  - `raw-data-modal.test.tsx`: 기존 SpaceLinkEditor의 노출 중분류 관련 테스트
    (있음/없음/저장) 전부 리팩터링 후에도 그대로 통과 — 동작 변경 없이 로직만
    이동했음을 확인.
  - `curated-item-form-modal.test.tsx`(+4건, 신규 describe): 장소 연동 시
    노출 중분류 없으면 경고, 있으면 초록 배지, 경고에서 선택·저장하면
    배지로 전환(그리고 `/api/admin/open-spaces/bulk-category-mapping`이
    올바른 payload로 호출됨), 장소를 연동하지 않으면 이 UI 자체가 안 보임을
    검증.
- `npm run build`: 성공.

## 특이 사항
- `SpotServiceCategoryCheck`는 저장 후 상위 컴포넌트에 변경 사실을
  전파하는 콜백이 없다 — `SpaceLinkEditor`도 원래 그랬고(로컬 상태만
  갱신), 큐레이션 폼 쪽도 저장 성공 여부를 굳이 상위(목록)에 알릴 필요가
  없어(목록 화면 자체가 노출 중분류를 보여주지 않음) 그대로 뒀다.
