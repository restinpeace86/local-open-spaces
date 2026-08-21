
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

## 🎯 [신규] 차기 진행 Task 목록

- [x] **[Task 1] `rgnCltrFcltExmnv1` (전국문화기반시설총람) 8개 시설 수집 & 데이터 표준화 어댑터 구현 (선작업)**
  - **Base URL**: `https://apis.data.go.kr/B553457/rgnCltrFcltExmnv1`
  - **수집 대상 (8개 엔드포인트)**: 박물관(`/clifMsmv1`), 미술관(`/clifArglv1`), 공공도서관(`/clifLbrryv1`), 생활문화센터(`/clifLvclCntrv1`), 문화의집(`/clifClhsv1`), 문학관(`/clifLtrm1`), 문예회관(`/clifClcnv1`), 국립도서관(`/clifNtnLbrryv1`)
  - **핵심 구현 요구사항**:
    - **파라미터 규격화**: `resultType=JSON`, `pageNo`, `numOfRows` 설정 및 게이트웨이 파라미터 필수 요구사항 적용.
    - **연도 Fallback(차감) 로직**: `pblshYr` 필수 파라미터에 최근 연도(`2024` ➔ `2023` ➔ `2022`) 순차 차감 조회 적용.
    - **Vworld 지오코딩 연동 선작업**: `process.env.VWORLD_API_KEY` 기반 Geocoder 모듈 작성 (`api.vworld.kr/req/address`). 키 부재 시 명시적 안내 출력 후 스킵 처리.
    - **스키마 정규화**: `open_spaces` 공통 스키마 매핑 및 `deriveParentalTags()` 기반 3대 육아 뱃지(`has_parking`, `stroller_accessible`, `is_kids_friendly`) 태깅.
  - **산출물**: `scripts/ingest/adapters/cultural-facility-summary-adapter.mjs` 신규 구현.
  - **완료 (2026-08-21)**: 착수 전 재실측 결과 `PUBLIC_DATA_API_KEY`로 8개 엔드포인트 전부 `resultCode 00 SUCCESS` 실 데이터 수신 확인 — 이전 세션들을 반복 차단하던 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` 블로커가 관리자 활용신청 승인으로 해소됨. `scripts/ingest/adapters/lib/vworld-geocoder.mjs`(Vworld 주소→좌표 지오코더), `scripts/ingest/adapters/cultural-facility-summary-adapter.mjs`(8개 엔드포인트 + pblshYr 연도 Fallback + `buildOpenSpaceRow`/`UI_CATEGORY.EXHIBITION_MUSEUM` 표준화 + `deriveParentalTags()` 태깅), CLI 진입점 `scripts/ingest/cultural-facility-summary.mjs`, `npm run ingest:cultural-facility-summary` 스크립트, 단위 테스트 6건(`cultural-facility-summary-adapter.test.mjs`) 구현 완료. `VWORLD_API_KEY`는 `.env.local`에 여전히 미존재하여 spec 지시대로 `transform()`이 실행 시점에 명시적 경고를 출력하고 빈 배열을 반환(전체 스킵)한다 — 코드는 완전 구현되었으나 실 데이터 upsert는 `VWORLD_API_KEY` 발급 후 가능함. UI 카테고리는 `spec/data/ai-rule.md` 3.1(`CULTURE`: 도서관/미술관/박물관/문화회관 등)/3.3(`CULTURE`→🏛️ 전시·박물관) 매핑 근거로 8개 시설유형 전체를 `EXHIBITION_MUSEUM`으로 통일 매핑함(문서에 더 세분화된 기준이 없어 임의 세분화하지 않음).

- [ ] **[Task 2] 전국도시공원정보표준데이터 수집 & `open_spaces` 표준화 어댑터 구현**
  - **수집 대상**: 전국 도시공원 (어린이공원, 근린공원 등 100% 무료 나들이 공간)
  - **주요 작업**:
    - `open_spaces` 테이블 표준 스키마 매핑 (`source_type='CITY_PARK_STANDARD'`).
    - `is_free = true` 고정 반영 및 편의시설 텍스트 기반 뱃지 태깅.
  - **스킵 (2026-08-21)**: 착수 전 사전 준수 확인(제0단계) 중 기존 코드베이스와의 정면 충돌을 발견함 — "전국도시공원정보표준데이터"는 `data.go.kr`의 `tn_pubr_public_cty_park_info_api` 데이터셋의 공식 명칭 그대로이며, 이는 이미 `scripts/ingest/city-parks.mjs`(`npm run ingest:city-parks`)가 동일 API(`api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api`)를 대상으로 매달 `.github/workflows/ingest-monthly.yml`에서 자동 수집 중인 데이터셋과 완전히 동일함(`source_type='PARK_API'`, `external_id='CITY_PARK_{manageNo}'`, `is_free=true` 고정, `deriveParentalTags()` 태깅까지 이미 구현·운영 중). Task 2 지시대로 `source_type='CITY_PARK_STANDARD'`로 별도 어댑터를 신규 구현하면 동일한 전국 공원 데이터가 서로 다른 `external_id`/`source_type`로 이중 적재되어 지도/목록에 같은 공원이 중복 마커로 노출되는 데이터 무결성 문제가 발생함. 이는 `CLAUDE.md` 제5장 제4조(기존 구조 우선, 불필요한 중복 방지) 및 제6장 제3조(데이터 무결성)와 정면 충돌하는 사안이며, `project/decision-log.md`에 이 재구현을 승인한 Decision도 없어 임의로 강행하지 않고 스킵함(제3장 제4조 추측 금지). **필요 조치 (기획 담당)**: (a) `city-parks.mjs`를 신규 어댑터 프레임워크(`BaseCollectorAdapter`/`buildOpenSpaceRow`)로 마이그레이션하며 `source_type`을 유지할지 갱신할지 결정하거나, (b) Task 2가 실제로는 다른 데이터셋(예: 도시공원이 아닌 다른 유형)을 의도한 것이었는지 확인 후 `todo.md`를 정정해줄 것.

- [x] **[Task 3] 코드 검증 및 테스트 코드 수립**
  - 신규 어댑터 단위 테스트 및 `npx tsc --noEmit`, `npm run build` 검증 수행.
  - **완료 (2026-08-21)**: Task 1 어댑터 단위 테스트 6건 작성 및 통과(`vitest run scripts/ingest/adapters/cultural-facility-summary-adapter.test.mjs`). `npx tsc --noEmit`, `npm run test`, `npm run build` 전체 검증 결과는 본 세션 커밋 메시지 및 디스코드 알림 참고.

---

## 📐 [데이터 표준화 원칙 (ETL Pipeline)]

1. **식별자 고유화**: `source_type` + `원천_PK` 조합으로 `external_id` 생성.
2. **좌표 표준화**: 원천 좌표 검증 및 좌표 누락 시 Vworld 지오코더를 통해 `latitude`, `longitude` 변환 후 적재.
3. **도메인 메타데이터 추출**: 원문 텍스트에서 `is_free`(무료여부) 및 `deriveParentalTags()`를 적용하여 3대 육아 뱃지 표준 컬럼 추출.
4. **원문 보존**: API 응답 원문은 `raw_data` 필드에 JSON으로 보존하여 사후 재파싱 보장.

---

## 📋 [완료 및 히스토리 Log]

### 1. 완료된 작업
- [x] **`parental-badges.ts` UI 보완**: `is_free === null` 예외 처리 완료.
- [x] **DB `raw_data` 기반 뱃지 재태깅 마이그레이션**: 1,162건 parental badge 태깅 완료.
- [x] **`contentTypeId=14, 28` 지연 상세 수집 어댑터 구현**: `--with-detail` CLI 옵션 적용 완료.
- [x] **일일 Full Ingest 자동화 배치 스케줄러 구축**: `.github/workflows/ingest-tourapi-daily.yml` 작성 완료.
- [x] **프론트엔드 UI 연동 및 테스트 작성**: `parental-badges.test.ts` (9/9) 통과.
