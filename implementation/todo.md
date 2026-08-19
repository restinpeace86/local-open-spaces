# local-open-spaces 구현 Todo

## Phase 1 (MVP) — 데이터 파이프라인

- [x] 기술 스택 설치 (Next.js/TS/Tailwind/Supabase)
- [x] Supabase PostGIS Core 스키마 적용 (`open_spaces`, `events`, `get_nearby_spaces_and_events` RPC)
- [x] API 키 연결 상태 점검 스크립트 (`scripts/check-api-keys.mjs`)
- [x] Source #05 서울시 문화행사 정보 수집 스크립트 (`scripts/ingest/seoul-culture-events.mjs`) — 실제 호출 및 DB upsert 검증 완료
- [x] Source #01 전국 도시공원 정보 표준데이터 (`scripts/ingest/city-parks.mjs`) — 실제 호출 및 DB upsert 검증 완료 (전체 19,154건 중 200건 테스트 upsert). 전체 재수집 시 `--max-pages` 없이 실행
- [ ] Source #06 한국관광공사 TourAPI 축제 정보 (`scripts/ingest/tour-api-festival.mjs`) — **보류: 코드 아님, 계정 이슈 (재확인 완료)**
      - 엔드포인트(`KorService2/searchFestival2`)는 정상. 디코딩 키(+encodeURIComponent)/인코딩 키(raw) 두 방식 모두 재테스트했으나 동일하게 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` (returnReasonCode 30)
      - 같은 키로 Source #01(전국 도시공원) 호출은 정상 동작 → 키 자체는 유효하며, TourAPI 4.0 상품만 별도 활용신청 승인이 안 된 상태로 확인됨 (인코딩 문제 아님)
      - data.go.kr 마이페이지 > 활용신청 현황에서 "한국관광공사_국문 관광정보 서비스_GW(TourAPI 4.0)" 상품 승인 여부 확인 필요
      - 승인 확인되면 `node scripts/ingest/tour-api-festival.mjs --dry-run`으로 재검증
- [ ] Source #02 전국(서울시) 공공체육시설 현황 (`ListPublicSportsFacility`) — **보류: 서비스명이 서버에서 인식되지 않음 (ERROR-500)**
      - 사용자가 확인해준 서비스명(`ListPublicSportsFacility`)으로 시도했으나 `ERROR-500 서버 오류` 반환
      - 케이싱/단복수 변형(`ListPublicSportFacility`, `listPublicSportsFacility`, `ListPublicSportsFacilities`) 4종 모두 재시도했으나 동일 오류 — Source #04에서 목록 서비스명이 예상과 전혀 다른 이름(`tvYeyakCOllect`)이었던 전례처럼, 정확한 이름이 다를 가능성이 높음
      - 다음 필요: 서울 열린데이터광장에서 이 API가 실제로 정상 동작하는지 직접 확인 후 정확한 서비스명 재확인 요청
- [x] Source #03 서울시 문화공간 정보 (`scripts/ingest/cultural-spaces.mjs`, 서비스명 `culturalSpaceInfo`) — 실제 호출 및 DB upsert 검증 완료
      - 전체 1,076건 중 1,075건 `open_spaces` 테이블(`category=CULTURE`) upsert 성공
      - **주의**: 응답 필드명 `X_COORD`/`Y_COORD`가 실제로는 위도/경도가 뒤바뀌어 있음을 확인 (X_COORD≈37.x=위도, Y_COORD≈127.x=경도) → 값 범위(30~40)로 판별하도록 방어적으로 매핑
- [x] Source #04 서울시 공공서비스예약 - 종합 (`scripts/ingest/seoul-public-reservation.mjs`) — 실제 호출 및 DB upsert 검증 완료
      - 사용자가 확인해준 통합 서비스명(`tvYeyakCOllect`)으로 전환. 문화행사(978)/시설대관(594)/진료(28)/체육시설(606)/교육(394) 등 전체 5개 카테고리 2,600건을 단일 엔드포인트로 커버 (카테고리별 개별 엔드포인트의 상위 집합임을 실증)
      - 전체 2,600건 중 2,494건(좌표·일자 유효 데이터) `events` 테이블(`event_type=RESERVATION`) upsert 성공, RPC 반경 검색으로 확인 완료
- [x] Source #07 서울시 야외 행사 & 팝업 정보 — **결정: 별도 수집 없이 기존 #04/#05 데이터를 필터링해 대체 (기획 확인 완료)**
      - 독립된 데이터셋이 존재하지 않는 것으로 확인되어, 이미 수집된 #04(`tvYeyakCOllect`, event_type=RESERVATION)와 #05(문화행사, event_type=FESTIVAL/POPUP 등)에서 카테고리/태그 기준으로 필터링해 활용하기로 결정
      - 별도 수집 스크립트 불필요. 화면/쿼리 레이어에서 `event_type IN ('FESTIVAL','POPUP')` 등으로 필터링하는 것은 이후 화면 구현 단계에서 처리 (Spec 범위: 데이터 파이프라인이 아닌 조회 로직)
- [ ] AI 데이터 정제/태깅 파이프라인 (Gemini) — Source #05/#06은 현재 규칙 기반(rule-based) 카테고리 매핑만 적용 (`scripts/ingest/lib/category-map.mjs`). `spec/data/ai-rule.md`가 요구하는 비정형 텍스트 정제·요약 및 애매한 케이스의 AI 분류는 미구현
- [ ] GitHub Actions 스케줄링 (월 1회 공간형 3종 / 매일 1회 행사형 4종) — 개별 수집 스크립트 확정 후 구성
- [ ] `supabase link` + DB 비밀번호 등록 — 현재는 Management API(`scripts/apply-sql.mjs`)로 마이그레이션 적용 중. DB 비밀번호 등록 시 CLI 표준 `supabase db push`로 전환 검토

## 참고
- 보류 항목은 `implementation/2026-08-19-tech-stack-and-core-schema.md`와 `implementation/2026-08-19-data-ingestion-pipeline.md`에 상세 근거 기록됨
- 위 보류 항목들은 임의로 구현 가능 상태로 바꾸지 말 것 — 엔드포인트/데이터셋 확정 후 진행
