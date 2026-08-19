# local-open-spaces 구현 Todo

## Phase 1 (MVP) — 데이터 파이프라인

- [x] 기술 스택 설치 (Next.js/TS/Tailwind/Supabase)
- [x] Supabase PostGIS Core 스키마 적용 (`open_spaces`, `events`, `get_nearby_spaces_and_events` RPC)
- [x] API 키 연결 상태 점검 스크립트 (`scripts/check-api-keys.mjs`)
- [x] Source #05 서울시 문화행사 정보 수집 스크립트 (`scripts/ingest/seoul-culture-events.mjs`) — 실제 호출 및 DB upsert 검증 완료
- [ ] Source #06 한국관광공사 TourAPI 축제 정보 (`scripts/ingest/tour-api-festival.mjs`) — **보류: 코드 아님, 계정 이슈**
      - 엔드포인트(`KorService2/searchFestival2`)는 정상이나 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` (returnReasonCode 30) 발생
      - data.go.kr 마이페이지 > 활용신청 현황에서 "한국관광공사_국문 관광정보 서비스_GW(TourAPI 4.0)" 상품 승인 여부 확인 필요
      - 승인 확인되면 `node scripts/ingest/tour-api-festival.mjs --dry-run`으로 재검증
- [ ] Source #01 전국 도시공원 정보 표준데이터 — **보류: 추측 금지 (제3장 제5조)**
      - data.go.kr dataset 15012890 추정되나 정확한 오퍼레이션/파라미터명 미확인 (JS 렌더링 페이지라 자동 조사 실패)
      - data.go.kr "전국도시공원정보표준데이터" OpenAPI 명세 탭에서 정확한 요청 URL/파라미터 확인 후 구현
- [ ] Source #02 전국 공공체육시설 현황 — **보류: 후보 데이터셋 2개 중 스펙과 일치하는 것 미확정**
      - "전국체육시설표준데이터"(15096288) vs "국민체육진흥공단 전국체육시설정보"(B551014/SRVC_API_SFMS_FACI) 중 어느 쪽인지 확인 필요
- [ ] Source #03 LocalData 전국 문화기반시설 현황 — **보류: 데이터셋명 불일치 발견**
      - "LocalData"(지방행정 인허가 API)는 opnSvcId 기준 체계로 박물관/미술관/공연장의 정확한 opnSvcId 미확인
      - 더 적합해 보이는 대안: 한국문화정보원_전국문화기반시설총람(dataset 15125097) — 스펙 작성 의도가 LocalData인지 15125097인지 기획 확인 필요
- [ ] Source #04 서울시 공공서비스예약 — **보류: 정확한 오퍼레이션명 미확인**
      - `openapi.seoul.go.kr:8088/{key}/{type}/{서비스명}/...` 구조는 확인했으나 정확한 서비스명 문자열 미확인 (OA-20497 또는 OA-2266 등 후보 존재)
- [ ] Source #07 서울시 야외 행사 & 팝업 정보 — **보류: 데이터셋 존재 여부 자체가 불확실**
      - data.seoul.go.kr에서 "야외행사"/"팝업" 키워드로 매칭되는 독립 데이터셋을 찾지 못함
      - #04 또는 #05에 통합된 것인지, 스펙 작성 시점 오류인지 기획 확인 필요
- [ ] AI 데이터 정제/태깅 파이프라인 (Gemini) — Source #05/#06은 현재 규칙 기반(rule-based) 카테고리 매핑만 적용 (`scripts/ingest/lib/category-map.mjs`). `spec/data/ai-rule.md`가 요구하는 비정형 텍스트 정제·요약 및 애매한 케이스의 AI 분류는 미구현
- [ ] GitHub Actions 스케줄링 (월 1회 공간형 3종 / 매일 1회 행사형 4종) — 개별 수집 스크립트 확정 후 구성
- [ ] `supabase link` + DB 비밀번호 등록 — 현재는 Management API(`scripts/apply-sql.mjs`)로 마이그레이션 적용 중. DB 비밀번호 등록 시 CLI 표준 `supabase db push`로 전환 검토

## 참고
- 보류 항목은 `implementation/2026-08-19-tech-stack-and-core-schema.md`와 `implementation/2026-08-19-data-ingestion-pipeline.md`에 상세 근거 기록됨
- 위 보류 항목들은 임의로 구현 가능 상태로 바꾸지 말 것 — 엔드포인트/데이터셋 확정 후 진행
