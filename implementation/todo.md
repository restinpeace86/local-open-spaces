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
- [ ] Source #02 전국(서울시) 공공체육시설 현황 — **Skip/Mock: 서울시 서버 측 장애로 잠정 보류 (사용자 확인, 다음 단계로 진행)**
      - 사용자가 서울 열린데이터광장 공식 문서에서 확인한 정확한 서비스명 `ListPublicSportsFacility` (공식 샘플 URL 원문 기준)로도 `/json/`, `/xml/` 두 방식 모두 `ERROR-500` 지속 확인
      - 누적 11종의 서비스명/포맷 조합이 모두 실패했고 공식 문서 원문과 일치하는 이름으로도 실패하므로, 서비스명 문제가 아니라 **서울시 서버의 해당 데이터셋 자체 장애**로 결론 (사용자 확인)
      - 사용자 지시에 따라 별도 수집 스크립트를 만들지 않고(가짜/목 데이터 생성 금지 원칙) Skip 상태로 유지, 이후 서울시 서버 정상화 시 재시도
      - 재시도 시: `node -e` 스니펫으로 `http://openapi.seoul.go.kr:8088/{KEY}/json/ListPublicSportsFacility/1/5/` 상태만 먼저 확인 후 정식 스크립트 작성
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
- [x] GitHub Actions 스케줄링 (`.github/workflows/ingest-monthly.yml`, `ingest-daily.yml`) — Source #01/#03(월 1회), #04/#05(매일)를 스케줄 워크플로로 구성. **주의: GitHub 저장소 Secrets(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PUBLIC_DATA_API_KEY, SEOUL_OPEN_DATA_KEY) 수동 등록 필요 — 이 환경에 gh CLI가 없어 자동 등록 불가**
- [ ] `supabase link` + DB 비밀번호 등록 — 현재는 Management API(`scripts/apply-sql.mjs`)로 마이그레이션 적용 중. DB 비밀번호 등록 시 CLI 표준 `supabase db push`로 전환 검토

## 참고
- 보류 항목은 `implementation/2026-08-19-tech-stack-and-core-schema.md`와 `implementation/2026-08-19-data-ingestion-pipeline.md`에 상세 근거 기록됨
- 위 보류 항목들은 임의로 구현 가능 상태로 바꾸지 말 것 — 엔드포인트/데이터셋 확정 후 진행
