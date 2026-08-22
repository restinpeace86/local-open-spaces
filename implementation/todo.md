- [ ] **[Task 9-2-1] 지오코더 브이월드(VWorld) API 전환 및 지오코딩 미수집 소스 재수집·정제** 🗺️
  - **작업 목표**: 지오코딩 인프라를 브이월드 2.0 API로 일원화하고, 좌표 변환 실패로 누락되었던 공공 수집 데이터를 전수 재수집 및 정제 적재
  - **세부 작업 지시**:
    1. **브이월드 지오코더 모듈 표준화 (`scripts/ingest/lib/geocode.mjs` 및 `geocoding.ts`)**:
       - 카카오 API 종속성 제거 및 VWorld Address API 2.0 기반 `getCoordByAddress` 함수 표준화.
       - API URL: `https://api.vworld.kr/req/address?service=address&request=getcoord&version=2.0&crs=epsg:4326&key=${VWORLD_API_KEY}`
       - ROAD(도로명) ➔ PARCEL(지번) 2단계 Fallback 변환 로직 적용.
    2. **지오코딩 필요 어댑터 전수 재실행 및 백필**:
       - `national-park-ecotour.mjs` 등 주소만 제공하고 좌표가 없던 어댑터를 브이월드 지오코더로 재실행하여 DB 적재 완료.
       - 기존 DB 내 위경도/sigungu_name이 누락된 레코드에 대해 브이월드 지오코딩 일괄 백필 마이그레이션 실행.
  - **검증 기준**:
    - `npx tsc --noEmit`, `npm run test`, `npm run build` 통과.
    - 브이월드 API 기반 위경도 및 `sigungu_name` 정상 추출/DB 적재 실측 확인.
