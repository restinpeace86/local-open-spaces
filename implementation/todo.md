## Phase 2 — 사용자 위치 온보딩 및 지도 시각화/스케일 최적화

- [x] LocalStorage 기반 비로그인 위치 설정 온보딩 및 헤더 연동
  - key: `user_location` (`lat`, `lng`, `address_name`) 관리 (`src/lib/location/user-location-storage.ts`)
  - 최초 진입 시 위치 미설정 상태이면 위치 설정 모달/화면 노출 (GPS 현위치 탐색 + 동네/주소 직접 검색 지원) — `src/components/map/location-onboarding-modal.tsx`, `src/lib/kakao/geocode.ts` (Kakao Geocoder/Places, `libraries=services`)
  - 위치 확정 시 지도 헤더에 현재 설정된 동네 이름 표시 (클릭 시 재설정 가능) — `src/components/map/location-header.tsx`
  - 위치 변경 즉시 해당 좌표를 기준점(Center)으로 지도 마커 및 RPC(`get_nearby_spaces_and_events`) 동기화 — `src/hooks/use-user-location.ts` 재작성
  - Playwright 실브라우저로 위치 미설정 시 온보딩 노출, GPS/동네 선택 후 지도 정상 전환 검증 완료 (dev 서버 기동 후 스모크 검증, 콘솔 에러 없음)

- [x] 내 위치 전용 펄스 마커 및 반경(1km/5km/10km) Circle Overlay 구현
  - 사용자 설정 위치(`userLocation`) 좌표에 일반 장소/행사 마커와 명확히 구분되는 '내 위치' 전용 펄스 마커(파란색 원형 + 파동 애니메이션) 노출 — `kakao.maps.CustomOverlay` + `.user-location-pulse` CSS 애니메이션(`src/app/globals.css`)
  - 선택된 반경(1km, 5km, 10km)에 맞춰 내 위치 중심의 반투명 원형 레이어(`kakao.maps.Circle`) 지도 위에 렌더링 — `src/components/map/kakao-map-view.tsx`
  - Playwright 실브라우저로 내 위치 마커 및 반경 원 정상 렌더링 검증 완료 (펄스 마커 좌표/반경 원 스크린샷 확인)

- [x] 반경 선택별 지도 자동 줌 스케일(Bounds) 연동 및 마커 클러스터링
  - 반경 선택 변경(1km, 5km, 10km) 시 반경 원 전체가 한눈에 들어오도록 `circle.getBounds()` 기반 자동 줌 레벨/축척 및 중심 조정 — `map.setBounds(circle.getBounds())`
  - Zoom Level 확대/축소 시 마커 밀도에 따라 숫자로 자동 그룹핑/해제되는 Kakao `MarkerClusterer` 적용 (기존 구현 유지·확인)
  - Playwright 실브라우저로 반경 전환 시 지도 줌 스케일 자동 조절 및 마커 클러스터링 동작 검증 완료 (5km→1km 전환 시 클러스터 해제 및 bounds 재조정 스크린샷 확인)
