- [ ] [기능 구현][SKIPPED 2026-08-20] 최신 spec/ 반영 후 광역 반경(20km/30km) 조건부 차단 제거 및 광역 클러스터링 연동
  - 최신 원격 변경사항을 수신하기 위해 `git pull` 우선 수행
  - Quick 필터 또는 카테고리 선택 시 광역 반경(20km, 30km) 차단 팝업 제거 및 활성화
  - `circle.getBounds()` 기반 자동 줌아웃 및 Mapbox/Leaflet 지도 상 숫자 클러스터링(Cluster) 정상 동작 연동
  - Playwright 실브라우저로 필터 적용 후 20km/30km 선택 시 지도 클러스터링 및 마커 스크리닝 동작 검증
  - **스킵 사유 (제3장 제4조 추측 금지):** `spec/common/search.md` 내부에 상충하는 두 정책이 공존함.
    - 2.2절(원본, 상세 정책): 반경 옵션은 `1km/5km/10km`만 존재하며, 10km 초과 시도는 예외 없이
      `GridViewPrompt`(시/구 단위 District Grid 전환 안내) 팝업으로 유도. 20km/30km라는 반경 값 자체가 언급되지 않음.
      현재 구현(`src/components/map/radius-selector.tsx`, `src/components/map/grid-view-prompt.tsx`)은 이 절을 인용하며 정확히 이를 따름.
    - 하단 "Radius & Scaling Guardrails" 절(2026-08-20 day2 commit7에서 추가, 2.2절과 조율 없이 별도 추가됨):
      20km/30km를 카테고리/Quick 필터 활성화 시 노출/활성화되는 정식 옵션으로 서술 — 2.2절의 "최대 10km, 초과 시 무조건 그리드 전환" 정책과 정면 충돌.
    - 두 절 중 어느 쪽이 우선인지, 20km/30km가 실제로 도입되어야 하는 신규 반경 옵션인지 아니면 오기(誤記)인지 Spec만으로 판단 불가.
      임의로 한쪽을 택해 반경 계산/차단 로직을 구현할 경우 제7장 제3조(임의 비즈니스 로직 생성 금지)에도 저촉될 소지가 있어 구현을 보류함.
    - **후속 조치 필요:** 기획 AI가 `spec/common/search.md` 2.2절과 "Radius & Scaling Guardrails" 절 중 최신 의도를 명확히 하여
      Spec을 정정한 뒤 재작업 요청 바람.
