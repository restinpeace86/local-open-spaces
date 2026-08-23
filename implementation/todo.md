- [ ] **[Task 9-6-10] `/nearby` 지도 상위 전역 위치 연동 완치 & 상시 공간 전용 단일화** 🗺️
  - **작업 목표**: 상위 전역 위치(성남시 분당구, 서울시 서초구 등) 변경 시 `/nearby` 지도 중심 좌표 및 검색 영역이 실시간 연동되도록 완치하고, 이벤트를 배제한 상시 공간(`open_spaces`) 전용 지도 뷰 구축.

  - **세부 작업 지시**:
    1. **전역 위치 상태 ➔ `/nearby` 지도 실시간 연동 수리 (`nearby-view.tsx` / `kakao-map.tsx`)**:
       - 하드코딩된 고정 좌표(Default Center) 제거.
       - 전역 위치 상태(Zustand / Context / URL 쿼리 / LocalStorage) 변경 시 지도의 중심 위치(`map.panTo` / `map.setCenter`)와 검색 RPC 매개변수가 실시간 갱신되도록 수리.
    2. **내 주변 지도 상시 공간(`open_spaces`) 전용 단일화**:
       - 지도 주변 검색 호출 시 `item_type = 'SPACE'` (상시 공간) 데이터만 단독 조회 및 마킹되도록 쿼리 파라미터 고정.
       - 지도 상단 필터 및 마커에서 이벤트 요소 완전히 제거.

  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 전역 위치를 '성남시 분당구' ➔ '서울시 서초구'로 변경 시 `/nearby` 지도가 해당 위치로 즉시 이동 및 주변 상시 공간 마커만 노출되는지 실측 검증.
