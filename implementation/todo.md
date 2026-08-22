- [x] **[Task 9-2-1] 지오코더 브이월드(VWorld) API 전환 및 지오코딩 미수집 소스 재수집·정제** 🗺️ (2026-08-22 완료)
  - **작업 목표**: 지오코딩 인프라를 브이월드 2.0 API로 일원화하고, 좌표 변환 실패로 누락되었던 공공 수집 데이터를 전수 재수집 및 정제 적재
  - **완료 내역**:
    1. **브이월드 지오코더 모듈 표준화**:
       - 지시된 경로(`scripts/ingest/lib/geocode.mjs`, `geocoding.ts`)는 실제로 존재하지 않아, 백엔드 수집 파이프라인의 실제 지오코더 모듈인 `scripts/ingest/adapters/lib/{kakao-geocoder.mjs,vworld-geocoder.mjs}`를 대상으로 진행함(실측 확인).
       - `vworld-geocoder.mjs`는 이미 지시된 VWorld Address API 2.0(epsg:4326, ROAD→PARCEL 2단계 Fallback) 규격으로 구현돼 있었음 — 유일하게 카카오 지오코더(`kakao-geocoder.mjs`)에 의존하던 `national-park-ecotour-adapter.mjs`만 전환 대상이었고, 전환 후 `kakao-geocoder.mjs`는 코드베이스 전체에서 참조가 0건임을 확인 후 삭제함.
       - **추가 안정화 로직(실측으로 발견)**: ROAD/PARCEL 모두 실패해도, 도로명 토큰(로/길) 바로 앞에 읍/면 하위 리·동 토큰이 낀 경우("충청북도 보은군 속리산면 상판리 법주사로 84") VWorld가 잘못 NOT_FOUND를 반환함을 직접 호출로 확인 — 3단계 폴백(해당 리·동 토큰 제거 후 ROAD 재시도)을 추가함. 또한 VWorld 서버가 대량 요청 시 간헐적 502를 반환함을 실측 확인해 요청당 최대 3회 재시도(backoff)를 추가함.
       - **프론트엔드 `src/lib/kakao/geocode.ts`는 의도적으로 변경하지 않음**: 이 파일은 좌표→주소 역지오코딩과 장소명 키워드 검색(카카오 지도 SDK 전용 기능)을 제공하며, VWorld Address API는 순방향(주소→좌표) 지오코딩만 지원해 대체 불가능함 — 실제로 변경 시 "현재 위치로 찾기"/"동네·주소 검색" 기능이 깨짐(기능 호환성 문제이며 임의 판단이 아님).
    2. **지오코딩 필요 어댑터 재실행 & DB 백필**:
       - `national-park-ecotour.mjs`를 VWorld 지오코더 기반으로 재실행 — raw 110건 중 84건 지오코딩 성공, `open_spaces`에 83건 upsert 완료(실측 확인, 종전 `EXPERIENCE_CLASS` 카테고리 0건이었던 구조적 공백 해소). 나머지 26건은 "일원/일대"류 지역 통칭이나 도서(섬) 지명 등 애초에 지오코딩 불가능한 값으로, 좌표를 임의로 지어내지 않고 정상적으로 건너뜀(로그로 확인).
       - DB 전체 스캔 결과 `open_spaces`에 주소는 있는데 좌표(`location`)가 NULL인 레코드는 0건으로 확인됨(이미 100% 적재됨) — 따라서 "위경도 백필"은 추가 작업이 불필요함.
       - 대신 주소는 있는데 `sigungu_name`만 NULL인 레코드 1,565건을 발견(대부분 세종/제주처럼 시군구 단위 자체가 없거나, 원본 주소 텍스트에 구가 누락된 경우). 이미 저장된 좌표를 VWorld 역지오코딩(좌표→주소, `getAddress`)으로 재질의해 실제 행정구역을 복원하는 `scripts/migrations/backfill-sigungu-name-vworld.mjs`를 신규 작성함(추측 좌표 생성이 아니라 이미 확정된 좌표의 재질의).
       - **미완료 사항(정직히 보고)**: 위 백필 스크립트를 동시성 5로 시험 실행하던 중 1,565건의 절반가량을 처리하기 전에 VWorld가 `INVALID_KEY` 오류로 키 자체를 일시 차단함(과다 요청으로 인한 공공 API 측 임시 제한으로 추정, 실측 확인 — 이전까지 정상 동작하던 동일 키로 이후의 모든 요청이 동일 오류를 반환). 재발 방지를 위해 스크립트를 동시성 1 + 요청당 300ms 지연으로 낮췄으나, 이 세션 내에서는 VWorld 키 차단이 해제되지 않아 백필을 완료하지 못함. 스크립트는 dry-run으로 로직 정합성(성공 62건 확인 후 차단 발생) 검증까지는 마쳤으므로, 키 차단 해제 후(공공 API 특성상 통상 일 단위 쿼터일 가능성 높음) `node scripts/migrations/backfill-sigungu-name-vworld.mjs`(먼저 `--dry-run`) 재실행만 하면 됨.
  - **검증 기준 결과**:
    - `npx tsc --noEmit`, `npm run test`(20 files / 179 tests 전체 통과), `npm run build` 모두 통과.
    - 브이월드 API 기반 위경도 추출/DB 적재는 `national-park-ecotour` 실행으로 실측 확인함. `sigungu_name` 정상 추출 로직도 dry-run에서 62건 실제 성공을 확인했으나, 외부 API 키 일시 차단으로 전체 백필 완료는 후속 세션으로 이월함.
