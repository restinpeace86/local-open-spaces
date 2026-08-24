- [x] **[Task 9-6-10] `/nearby` 지도 전역 위치 연동 완치, 파란 원 제거, 계층별 클러스터링 & 상시 공간 단일화** 🗺️ (2026-08-23 완료, Task 9-6-9 재확인 포함)
  - **작업 목표**: 지도 줌 레벨에 맞춘 계층별(시/군 ➔ 구/동 ➔ 개별 마커) 클러스터링 적용, 파란색 반경 원 제거, 전역 위치 연동 및 상시 공간 단일화.

  - **세부 작업 지시**:
    1. **지도 줌 레벨별 마커 클러스터링 세팅 (`kakao-map.tsx`)**:
       - 카카오맵 `MarkerClusterer` 옵션(`gridSize`, `minLevel` 등)을 조정하여 지도 줌 레벨에 따라 광역/시·군 단위 ➔ 구/동 단위 ➔ 개별 마커 형태로 자연스럽게 묶여 숫자로 표출되도록 설정.
    2. **파란색 반경 원(Circle Overlay) 완전 제거**:
       - 지도상에 그려지던 파란색 원(`kakao.maps.Circle`) 및 관련 radius state 전면 삭제.
    3. **상위 전역 위치 실시간 연동 완치**:
       - 전역 위치 상태(성남시 분당구, 서울시 서초구 등) 변경 시 지도가 해당 중심점으로 부드럽게 이동(`panTo`)하고 주변 상시 공간 마커를 실시간 조회하도록 수리.
    4. **상시 공간(`open_spaces`) 전용 지도 단일화**:
       - 주변 검색 RPC/API 파라미터를 `item_type = 'SPACE'`로 고정하고 지도 필터 및 마커에서 이벤트 요소 완전히 배제.

  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 지도 축소/확대 시 계층별 숫자 묶음 클러스터링 작동 실측, 파란 원 0건 확인 및 전역 위치 이동 실측 검증.

  - **Task 9-6-9 재확인**: 지시서에 함께 포함된 Task 9-6-9(당일 한정 피딩/10개 강제 채움 제거/수도권 통합/캐러셀 뷰포트 이탈 정지)는 직전 세션에서 이미 완료·커밋돼 있었다(`git pull` 후 코드 온전함 확인) — 이번 턴에서는 재작업하지 않고 Task 9-6-10에 집중했다.

  - **(1) RPC 하위 호환 유지가 핵심 제약**: `get_nearby_spaces_and_events` RPC는 `/nearby` 지도뿐 아니라 `generate-notifications.ts`(D-1 예약 마감 알림, `item_type==='EVENT'`만 걸러 씀)에서도 호출된다 — 실측으로 이 사실을 확인해 RPC 자체를 spaces-only로 바꾸지 않고, `p_item_type` 파라미터(기본값 null=기존과 동일)를 추가하는 방식으로 처리했다. PostgreSQL이 파라미터 개수가 다른 `CREATE OR REPLACE`를 교체가 아니라 별도 오버로드로 만들어 PostgREST가 호출을 못 정하는 문제(PGRST203)를 실측으로 발견해, 기존 3-인자 시그니처를 `DROP FUNCTION`한 뒤에야 정상화했다. `source_type` 컬럼도 함께 추가(목적별 카테고리 칩 분류용). `database.types.ts`도 새 시그니처에 맞춰 수동 갱신.
  - **(2) 파란 원 제거 + 전역 위치 연동 버그의 실제 원인**: `kakao-map-view.tsx`의 반경 Circle이 하던 "반경에 맞춰 지도를 자동으로 맞춤"(`setBounds(circle.getBounds())`) 역할이 지도 이동의 유일한 경로였다 — 원을 걷어내면서 그 경로가 통째로 사라져 center/radius prop이 바뀌어도 지도가 반응하지 않는 문제가 될 뻔한 것을 `panTo`+`setLevel` 명시 호출로 대체해 막았다. 반경→줌레벨은 브라우저 실측 없이 "반경 2배마다 레벨 1.5" 근사 공식을 쓴다(정확한 픽셀 대응은 기기별로 달라 단정하지 않음 — 추측 금지).
  - **(3) 계층별 클러스터링**: 별도의 "여러 단계 클러스터러"를 만들지 않고(카카오맵 MarkerClusterer 하나가 원래 줌에 따라 격자를 다시 계산해 광역→구/동→개별로 자연 재편됨), `minLevel`을 6→5로 낮추고 `gridSize`를 60→80으로 넓혀 기본 반경(5km)에서도 클러스터링이 바로 보이도록 튜닝했다.
  - **(4) 상시 공간 단일화**: `map-explorer.tsx`가 RPC에 `p_item_type='SPACE'`를 명시하고, `LayerToggle`("상시 시설 보기" on/off 토글)을 완전히 제거(사용처가 이 화면 하나뿐임을 실측 확인 후 파일째 삭제)했다. 카테고리 칩은 events와 공유하던 5대 UI 카테고리 대신, 기존 `theme-spots.ts`의 목적별 테마 분류(`classifyThemeSpot`, ThemeSpotKey)를 재사용해(제5장 제4조 기존 구조 우선) 지시서가 준 라벨("공원·광장" 등 5개)로 표시하는 `NEARBY_CATEGORY_FILTER_OPTIONS`를 신규 추가했다.
  - **(5) 내 위치 이동 + 현 지도 범위 재검색**: 새 `[🎯 내 위치/설정위치로 이동]` 버튼(`my-location-button.tsx` 신규)은 드래그로 벗어난 `searchOverrideCenter`를 초기화해 원래 설정 위치로 되돌린다. 기존 `[🔄 이 위치에서 재검색]` 버튼은 `dragend`뿐 아니라 `zoom_changed`에도 반응하도록 확장했다 — 단, center/radius prop 변경으로 인한 프로그램적 `setLevel()` 호출까지 "사용자가 줌을 바꿨다"로 오인해 검색마다 버튼이 깜빡이지 않도록 억제 플래그(레벨이 실제로 바뀔 때만 세움)를 넣었다.
  - **실측 검증**: 개발 서버로 `/nearby` HTML을 직접 확인 — "상시 시설 보기" 텍스트 0건, 신규 카테고리 칩 5개 전부 노출, "내 위치/설정위치로 이동" 버튼 존재 확인. RPC를 직접 호출해 `p_item_type='SPACE'`가 SPACE만(201건, 타입 분포 1종) 반환함을 확인하고, 파라미터 없는 기존 호출 방식(`generate-notifications.ts`가 쓰는 형태)도 여전히 정상 동작함을 확인(20km 반경에 EVENT가 201건 존재하지만 SPACE 밀도가 더 높아 거리순 상위 201건 안에 안 든 것 — RPC 파라미터 없는 조회가 이벤트를 아예 못 찾는 회귀가 아님을 EVENT 전용 재조회로 별도 검증).
  - **검증**: `npx tsc --noEmit` 통과, `npm run test` 312/312 통과(map-explorer 9-6-10 신규 테스트 3건 추가, region-grid-view/nearby page 테스트의 하드코딩 날짜 리터럴을 동적 "오늘"로 교체해 세션 장기화로 인한 우연한 실패 방지), `npm run build` 통과.
  - **관련 파일**: `scripts/migrations/2026-08-23-nearby-rpc-item-type-and-source-type.sql`(신규), `src/types/database.types.ts`, `src/lib/spaces/get-nearby.ts`, `src/components/map/kakao-map-view.tsx`, `src/components/map/map-explorer.tsx`(+test), `src/components/map/my-location-button.tsx`(신규), `src/components/map/layer-toggle.tsx`(삭제), `src/lib/theme-spots.ts`, `src/types/kakao.d.ts`, `src/app/(explore)/nearby/page.test.tsx`, `src/components/region/region-grid-view.test.tsx`.
