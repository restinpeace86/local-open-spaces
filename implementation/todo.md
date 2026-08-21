# 📋 [TODO] TourAPI 4.0 수집 파이프라인(증분 수집) 검토 및 요금 뱃지 Spec 개정 반영

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

---

## 🎯 실행 및 검토 Task 목록

### 1. [Code] `parental-badges.ts` 및 UI 뱃지 표출 로직 개정
- [ ] `src/lib/spaces/parental-badges.ts` (및 `quick-filters.ts` 등 `is_free` 참조 코드) 수정
- [ ] `is_free === null`일 때 "유료"로 표시되던 기존 삼항 연산자를 개정된 Spec(`is_free === null` 시 미노출)에 맞추어 **'뱃지 미노출(null)'**로 분기 보완

### 2. [ETL/Ingest] API 호출 한도 분석 및 증분 수집(Incremental Sync) 구조 검토
- [ ] **API별 일일 호출 한도(Quota) 및 `totalCount` 확인**:
  - `KorService2`, `KorWithService2`, `KorPetTourService2`, `GoCamping` 4개 API의 일일 트래픽 제한 및 전체 데이터 건수 파악
- [ ] **증분 수집 파라미터(`modifiedtime` 등) 지원 여부 검증**:
  - TourAPI 4.0 `areaBasedList2` 등에 `modifiedtime` 파라미터가 실제 지원되는지 파라미터 인자 및 응답 스키마 분석
  - 파라미터 미지원 소스(고캠핑 등)의 경우 `updated_at` / `external_id` diff 기반 증분 수집 방안 검토
- [ ] **카테고리 선별 상세 호출 및 2단계 파이프라인 설계**:
  - 전체 목록 수집 시 N+1 방지(목록 API만 사용) ➔ `contentTypeId=14, 28` 등 요금 정보가 필수인 카테고리 필터 선택 시 선별 호출하는 구조 검토
  - 초기 전체 수집(Full Ingest) ➔ 평시 변경분 수집(Incremental) 배치 업데이트 전략 수립

### 3. [ETL Script] `raw_data` 기반 뱃지 재태깅 마이그레이션 스크립트 구현
- [ ] `open_spaces` DB에 적재된 22,235건의 `raw_data` (개요 `overview`, 상세 설명 등) 텍스트 파싱
- [ ] `scripts/ingest/lib/ai-tagging.mjs`의 `deriveParentalTags()` 정규식을 활용하여 `has_parking`, `stroller_accessible`, `is_kids_friendly` 뱃지를 일괄 업데이트하는 독립 ETL 스크립트(`scripts/migrations/retag-parental-badges.mjs`) 작성 및 실행 (※ 추가 API 호출 없이 DB 내부 텍스트 파싱으로 전량 태깅)

---

## 📝 [Claude 작업 진행 및 검토 결과 보고서]
*(클로드는 작업 완료 또는 스킵 후 결과를 아래에 상세히 작성하세요)*

### 🚨 [기존 기능명세서 충돌 및 스킵 로그]
*(충돌 또는 스펙 미비로 스킵한 작업이 있다면 여기에 상세 사유 기재)*
- 

### 1. `git pull` 및 `parental-badges.ts` UI 수정 결과
- 

### 2. API별 호출 한도 & `modifiedtime` 증분 수집 파라미터 검토 결과
| API 소스명 | 일일 Quota | 전체 건수 | `modifiedtime` 지원 여부 | 증분 수집 처리 전략 |
| :--- | :--- | :--- | :--- | :--- |
| KorService2 (국문관광) | | | | |
| KorWithService2 (무장애) | | | | |
| KorPetTourService2 (반려동물) | | | | |
| GoCamping (고캠핑) | | | | |

* **카테고리별 상세 API 선별 연동 & 증분 수집 파이프라인 설계안**:
  - 

### 3. `retag-parental-badges.mjs` ETL 실행 결과
-
