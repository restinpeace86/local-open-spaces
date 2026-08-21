# 📋 [TODO] 전국문화기반시설총람 수집·표준화 ETL 구축 및 차기 Task 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

## 🎯 [신규] 차기 진행 Task 목록 (우선 구현 대상)

- [ ] **[Task 1] `rgnCltrFcltExmnv1` (전국문화기반시설총람) 8개 시설 수집 & 데이터 표준화 어댑터 구현**
  - **Base URL**: `https://apis.data.go.kr/B553457/rgnCltrFcltExmnv1`
  - **수집 대상 엔드포인트 (8개)**:
    - 박물관(`/clifMsmv1`), 미술관(`/clifArglv1`), 공공도서관(`/clifLbrryv1`), 생활문화센터(`/clifLvclCntrv1`), 문화의집(`/clifClhsv1`), 문학관(`/clifLtrm1`), 문예회관(`/clifClcnv1`), 국립도서관(`/clifNtnLbrryv1`)
  - **제외 엔드포인트 (2개)**: 지방문화원(`/clifLclcv1`), 지역문화재단(`/clifLcclFndtv1`) (행정/법인 사무소 성격으로 일반 방문 공간 부적합)
  - **데이터 표준화 & Vworld 지오코딩 연동**:
    - 원천 응답 구조를 `open_spaces` 공통 스키마(`name`, `address`, `category`, `is_free`, `external_id` 등)로 표준화.
    - 원천 데이터 좌표 누락 대응: 수집 시 주소(도로명/지번) 데이터를 활용해 Vworld Geocoder API(`api.vworld.kr/req/address`)를 호출, `latitude`/`longitude` 좌표를 변환하여 `open_spaces` DB에 함께 적재.
    - 텍스트 파싱 기반 `deriveParentalTags()`를 적용하되, 문학관/문예회관 등은 텍스트 조건 충족 시에만 뱃지 부여.
    - 원문 전체는 `raw_data` 컬럼에 보존 (`source_type='CULTURAL_FACILITY_SUMMARY'`).
  - **수집 어댑터 작성**: `scripts/ingest/adapters/cultural-facility-summary-adapter.mjs` 신규 작성 및 CLI 스크립트 정립.

- [ ] **[Task 2] 추가 데이터 소스 전량 수집(Full Ingest) 배치 스케줄러 점검 및 연동**
  - Task 1에서 구축한 전국문화기반시설총람 어댑터를 일일 1회 자동 수집 배치 스케줄러에 추가 통합.

---

## 📐 [데이터 표준화 원칙 (ETL Pipeline)]

1. **식별자 고유화**: `source_type` + `원천_PK` (또는 엔드포인트 구분자) 조합으로 `external_id` 생성 (예: `SUMMARY_MSM_1002`).
2. **좌표 표준화**: 원천 데이터에 경도/위도가 없더라도 Vworld 지오코더를 통해 `latitude`, `longitude` 변환 후 적재.
3. **도메인 메타데이터 추출**: 원문 텍스트에서 `is_free`(무료여부) 및 `deriveParentalTags()`를 적용하여 3대 육아 뱃지(`has_parking`, `stroller_accessible`, `is_kids_friendly`) 표준 컬럼 추출.
4. **원문 보존**: API 응답 원문은 `raw_data` 필드에 JSON으로 보존하여 사후 재파싱 보장.

---

## 📊 [선행 조사 결과] API 분석 및 수집 전략 데이터

### 1. 전국문화기반시설총람 API (`B553457/rgnCltrFcltExmnv1`)
- **수집 엔드포인트 (8개)**: 박물관, 미술관, 공공도서관, 생활문화센터, 문화의집, 문학관, 문예회관, 국립도서관
- **제외 엔드포인트 (2개)**: 지방문화원, 지역문화재단
- **좌표 변환 전략**: 원천 데이터 좌표 누락으로 인해 Vworld 지오코딩 API를 연동하여 표준 좌표 변환 후 DB 적재.

### 2. TourAPI 4.0 & GoCamping 실측 및 수집 범위 확정 데이터
- **수집 대상 카테고리 확정**: `12`(관광지), `14`(문화시설), `28`(레포츠) 3개 타입만 한정 수집.
  - *참고*: `15`(축제행사)는 `public.events`(시한성 이벤트) 테이블 대상 데이터이므로 `open_spaces` 파이프라인 수집 대상에서 제외 유지.

| API 소스명 | 일일 Quota | 전체 건수(실측) | 동기화 엔드포인트 | 날짜/증분 파라미터 실측 동작 | 수집 & 증분 처리 전략 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **KorService2** (국문관광) | 1,000회/일 | 20,075건 | `areaBasedSyncList2` | `modifiedtime`은 Exact Match(=) 동작 | KST 04:00 일일 1회 전량 수집 후 DB UPSERT |
| **KorWithService2** (무장애) | 1,000회/일 | 5,045건 | `areaBasedSyncList2` | `modifiedtime` Exact Match(=) 동작 | KST 04:00 일일 1회 전량 수집 후 DB UPSERT |
| **KorPetTourService2** (반려동물) | 1,000회/일 | 857건 | `petTourSyncList2` | 전용 동기화 엔드포인트 존재 확인 | KST 04:00 일일 1회 전량 수집 후 DB UPSERT |
| **GoCamping** (고캠핑) | 1,000회/일 | 3,096건 | `basedSyncList` | 날짜 기반 필터링 파라미터 미지원 | KST 04:00 일일 1회 전량 수집 후 DB UPSERT |

---

## 🚫 [Claude 작업 진행 및 검토 결과 보고서] — 기존 기능명세서 충돌 및 스킵 로그 (2026-08-21 세션)

- **스킵 대상**: `[Task 1] rgnCltrFcltExmnv1(전국문화기반시설총람) 8개 시설 수집 & 데이터 표준화 어댑터 구현`, `[Task 2] 추가 데이터 소스 전량 수집(Full Ingest) 배치 스케줄러 점검 및 연동`(Task 1 산출물에 종속되어 동시 스킵)
- **스킵 사유**: CLAUDE.md 제3장 제4조(추측 금지) — "Spec이 명확하지 않은 경우 임의로 판단하여 구현하지 않는다" — 및 본 프로젝트 기존 어댑터 전원이 지켜온 "실 API 호출로 필드 스키마를 실측 확인한 뒤에만 `transform()` 매핑을 작성한다"는 확립된 관행과 정면 충돌하는 사안을 착수 전 발견함:
  1. **실측 시도 결과**: `.env.local`의 `PUBLIC_DATA_API_KEY`로 `B553457/rgnCltrFcltExmnv1/clifMsmv1`(박물관) 엔드포인트를 실제 호출 → `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30, "등록되지 않은 서비스키") 응답 수신. 즉 현재 보유 서비스키가 이 API 상품에 대해 data.go.kr에서 별도 활용신청/승인이 되어 있지 않음 — 코드 구현으로는 해결 불가한 계정 승인 이슈.
  2. **대체 조사 결과**: data.go.kr 공식 API 상세 페이지(`data.go.kr/data/15125097/openapi.do` 등)를 웹 조회했으나 요청/응답 필드 명세가 Swagger(JS 렌더링) 화면 안에 있어 정적으로 노출되지 않음 — 시설명/주소/좌표 등 실제 영문 필드명을 확인할 수 없음.
  3. 위 두 경로가 모두 막혀, 8개 엔드포인트(`clifMsmv1`/`clifArglv1`/`clifLbrryv1`/`clifLvclCntrv1`/`clifClhsv1`/`clifLtrm1`/`clifClcnv1`/`clifNtnLbrryv1`) 응답 필드 구조를 임의로 추측해 매핑 코드를 작성할 수밖에 없는 상황이므로 착수하지 않고 즉시 스킵함.
  4. 참고로 Vworld Geocoder(`api.vworld.kr/req/address`) 연동에 필요한 `VWORLD_API_KEY`도 `.env.local`에 없어 좌표 변환 단계 역시 현재는 실제 호출 검증이 불가함(코드 자체는 Kakao 지오코더 선례처럼 키 부재 시 명시적 에러를 던지는 형태로 작성 가능하나, 상위 블로커인 필드 스키마 미확인으로 Task 1 전체를 보류함).
- **필요 조치 (관리자/기획 담당)**: data.go.kr에서 "한국문화정보원_전국문화기반시설총람 정보 조회서비스"(`publicDataPk=15125097`) 활용신청을 승인받은 뒤, (a) 승인된 서비스키를 `.env.local`의 `PUBLIC_DATA_API_KEY`(또는 신규 키)에 반영하거나 (b) 8개 엔드포인트 각 1건의 실 호출 응답(JSON 원문)을 제공해줄 것. `VWORLD_API_KEY` 발급 및 `.env.local` 반영도 함께 필요. 위 조치 완료 후 다음 세션에서 실측 스키마 기반으로 즉시 재개 가능.
- **재확인 (2026-08-21 후속 세션)**: 신규 세션 착수 전 사전 준수 확인(제0단계) 절차에 따라 `clifMsmv1` 엔드포인트를 동일 서비스키로 재호출 → 동일하게 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30) 수신, `.env.local`에 `VWORLD_API_KEY` 여전히 미설정 확인. 관리자 조치 전까지 상태 변화 없음을 재확인하고 Task 1/2 스킵 유지.
- **재확인 (2026-08-21 3차 세션)**: "todo.md 전체 미완료 작업 실행" 요청에 따라 착수 전 사전 준수 확인(제0단계)을 재수행 → `clifMsmv1` 엔드포인트 재호출 결과 동일하게 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30) 수신, `.env.local`에 `VWORLD_API_KEY` 항목 여전히 미존재 확인. 두 블로커 모두 관리자 조치 없이는 코드로 해결 불가능하므로 Task 1/2 착수하지 않고 스킵 유지.
- **재확인 (2026-08-21 4차 세션)**: "todo.md 미완료 작업 전체 실행 + typecheck/lint/build 검증 + git push + 디스코드 알림" 요청에 따라 착수 전 사전 준수 확인(제0단계)을 재수행 → `PUBLIC_DATA_API_KEY`로 `clifMsmv1` 엔드포인트 재호출 결과 동일하게 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30, "등록되지 않은 서비스키") 수신, `.env.local`에 `VWORLD_API_KEY` 항목 여전히 미존재(grep 0건) 확인. 두 블로커 모두 관리자 조치(활용신청 승인 및 Vworld 키 발급) 없이는 코드로 해결 불가능하므로 Task 1/2 착수하지 않고 스킵 유지. 실행할 신규 코드 변경 사항이 없어 typecheck/test/build 검증 대상도 없음.
- **재확인 (2026-08-21 5차 세션)**: "CLAUDE.md/todo.md 확인 후 미완료 작업 전체 실행 + typecheck/lint/build 검증 + git push + 디스코드 알림" 요청에 따라 착수 전 사전 준수 확인(제0단계)을 재수행 → `.env.local`의 `PUBLIC_DATA_API_KEY`로 `clifMsmv1` 엔드포인트를 직접 fetch 재호출한 결과 동일하게 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30, "등록되지 않은 서비스키") 수신, `.env.local`에 `VWORLD_API_KEY` 항목 여전히 미존재 확인. 두 블로커 모두 관리자 조치(활용신청 승인 및 Vworld 키 발급) 없이는 코드로 해결 불가능하므로 Task 1/2 착수하지 않고 스킵 유지. 실행할 신규 코드 변경 사항이 없어 typecheck/test/build 검증 대상도 없음.

---

## 📋 [완료] 완료된 Task 히스토리 & 실행 결과 보고 요약 (2026-08-21 세션)

- [x] **`parental-badges.ts` UI 보완**: `is_free === null` 시 유료 오표기 방지 및 '뱃지 미노출(null)' 삼항 연산자 예외 처리 반영 완료.
- [x] **DB `raw_data` 기반 뱃지 재태깅 마이그레이션**: API 추가 호출 0건으로 `open_spaces` DB 내 `raw_data` 텍스트만 파싱하여 1,162건의 parental badge (`has_parking`, `stroller_accessible`, `is_kids_friendly`) 태깅 완료 (`retag-parental-badges.mjs`).
- [x] **`contentTypeId=14, 28` 지연 상세 수집 어댑터 구현**: 
  - `fetchDetailIntro()` 및 CLI `--with-detail` 플래그 구현 완료 (목록 N+1 방지).
  - DB 내 `is_free IS NULL` 대상 6,515건 중 budget(1일 900회) 기반 점진적 보완 배치 구조 작성.
  - `deriveIsFreeFromFeeText()` 정규식 기반 요금 판별 로직 추가 및 3개 상세 호출 실측 통과.
- [x] **일일 Full Ingest 자동화 배치 스케줄러 구축**:
  - `.github/workflows/ingest-tourapi-daily.yml` 작성 (KST 04:00 순차 Full Ingest 구동 및 `upsertRows` 재사용).
- [x] **프론트엔드 공간 카드 UI & 뱃지 연동 검증 및 단위 테스트 작성**:
  - 카드 UI 및 지도 목록 패널 연동 상태 확인 완료.
  - `src/lib/spaces/parental-badges.test.ts` (7개 케이스) 작성, `npm run test` 통과 (9/9), `tsc` / `build` 검증 통과.
