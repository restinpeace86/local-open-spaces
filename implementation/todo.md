- [ ] **[Task 9-6-1] 경기데이터드림 2개 API 연동 및 성남시/경기도 이벤트 대량 수집** 🎪
  - **작업 배경**: `localdata.go.kr` 서비스 폐기에 따라 `data.go.kr` 및 경기데이터드림 오픈 API로 수집 출처 단일화.
  - **수집 대상 API**:
    1. `https://openapi.gg.go.kr/GGCULTUREVENTSTUS` (경기도 문화 행사 현황)
    2. `https://openapi.gg.go.kr/GGCULFOUEVENSTM` (경기문화재단 행사 프로그램)
  - **세부 작업 지시**:
    1. **어댑터 보완 (`src/lib/ingestion/adapters/gg-events.mjs`)**:
       - 2개 API를 순회하며 `Type=json`, `pIndex`, `pSize=1000`, `KEY=process.env.GG_DATA_API_KEY` 기반 JSON 파싱.
       - 시군명 및 주소 파싱 (`SIGUN_NM`, `ADDR` ➔ `sigungu_name`: '성남시 분당구' / '성남시').
       - 행사 기간(`BEGIN_DE`, `END_DE`), 행사명(`TITLE`), 장소(`INST_NAME`/`ADDR`), 이미지/URL 및 위경도 좌표 매핑.
    2. **수집 실행 및 DB 백필**:
       - 스크립트 실행으로 성남시 및 경기도 지역 이벤트 수집 및 `events` 테이블 적재.
    3. **피드 매칭 검증**:
       - DB 내 성남시/경기도 `events` 카운트 실측.
       - `get-home-feed.ts` 실행 시 성남시 분당구 설정 상태에서 메인 및 당일 이벤트 피드 정상 피딩 검증.
