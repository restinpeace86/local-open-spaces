- [ ] **[Task 9-6-3] 활성/미래 이벤트 상세 URL 스크래핑 기반 정밀 주소/좌표 DB 업데이트 적재** 🎯
  - **작업 목표**: API 원본 주소가 부실했던 경기도/성남시 활성 이벤트의 상세 URL을 스크래핑하여 정확한 위치(도로명 주소, 장소명)를 추출하고, 지오코딩 좌표를 DB `events` 테이블에 직접 업데이트 적재 (`EXACT` 승격)
  - **세부 작업 지시**:
    1. **스크래핑 & 지오코딩 보완 파이프라인 연동 (`src/lib/ingestion/enrichment/enrich-event-locations.mjs`)**:
       - `end_date >= CURRENT_DATE` 인 활성/미래 이벤트 중 `location_precision`이 `'CITY_APPROX'` 또는 `'UNKNOWN'`인 레코드 조회.
       - 해당 레코드의 `url` 페이지 HTML 스크래핑 ➔ '주소', '장소', '위치', '도로명' 파싱을 통한 상세 주소 추출.
       - 네이버/카카오 지오코딩 API를 거쳐 정확한 위경도(`lat`, `lng`) 파악.
    2. **DB 적재 & 레코드 업데이트**:
       - 정밀 좌표 획득 성공 시, 해당 이벤트 레코드의 `address`, `venue_name`, `location` (PostGIS point), `location_precision = 'EXACT'` 값으로 DB direct UPDATE 적재.
    3. **지도 및 피드 검증**:
       - DB 보완 후 지도 RPC(`get_nearby_spaces_and_events`) 및 성남시 피드에서 `EXACT` 승격 이벤트가 지도상에 정확히 찍히고 피드에 노출되는지 실측 검증.
  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 스크래핑 후 DB 업데이트 성공 건수 및 지도 RPC 노출 실측 결과 보고.
