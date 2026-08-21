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
