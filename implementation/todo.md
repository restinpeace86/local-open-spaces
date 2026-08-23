- [ ] **[Task 9-6-5] 카카오 REST API 키 기반 시설명 이벤트 장소 37건 `EXACT` 추가 승격 및 DB 적재** 🎯
  - **작업 배경**: VWorld 지오코더(도로명 주소 전용)로 변환 실패했던 시설명 단독 장소 37건을 `KAKAO_REST_API_KEY` 기반 카카오 장소 검색 API(`https://dapi.kakao.com/v2/local/search/keyword.json`)로 지오코딩 진행.
  - **세부 작업 지시**:
    1. **카카오 키워드 장소 검색 연동 (`scripts/ingest/adapters/gg-culture-location-enrichment.mjs`)**:
       - `.env.local`의 `KAKAO_REST_API_KEY` 환경변수를 활용해 카카오 장소 검색 REST API 호출부 추가.
       - VWorld 1차 검색 실패 시 카카오 장소 검색 API로 2차 검색(Fallback) 수행.
    2. **DB 업데이트 & `EXACT` 승격 적재**:
       - 변환 성공 시 DB `events` 테이블의 `venue_name`, `location` (PostGIS point), `location_precision = 'EXACT'` 값으로 direct UPDATE 적재.
    3. **지도 RPC 및 피드 실측 검증**:
       - 승격된 성남시/경기도 이벤트가 지도 주변 검색 RPC(`get_nearby_spaces_and_events`) 및 피드에 정상 반영되는지 실측 검증.
  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 카카오 REST API 검색 성공 건수 및 지도 RPC 노출 실측 결과 보고.
