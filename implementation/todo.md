# 📋 [TODO] TourAPI 4.0 수집 파이프라인(증분 수집) 검토 및 요금 뱃지 Spec 개정 반영

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.
# 📋 [TODO] TourAPI 4.0 수집 파이프라인 개정 및 후속 작업 지시서

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 하단 **[조사 결과]**를 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

## 🎯 [신규] 차기 진행 Task 목록 (우선 구현 대상)

- [ ] **[Task 1] `contentTypeId=14, 28` 지연 상세 수집 어댑터 구현**
  - 문화시설(`14`), 레포츠(`28`) 카테고리의 `is_free: null` 데이터 보완을 위한 2단계 지연 연동 어댑터 로직 작성.
  - 전체 목록 수집 시에는 N+1 방지를 위해 목록 API만 호출하고, 해당 카테고리 필터 선택 시 선별적으로 `/detailIntro2` 상세 API를 호출하여 요금(`usefee` 등) 및 상세 정보 반영.

- [ ] **[Task 2] 일일 1회(한국시간 새벽 4시), Full Ingest 자동화 배치 스케줄러 구축**
  - 4개 공공 API 소스(KorService2, KorWithService2, KorPetTourService2, GoCamping)의 일일 전량 수집(Full Ingest) ➔ DB UPSERT (`ON CONFLICT DO UPDATE`) 실행 배치 스크립트 정립.

- [ ] **[Task 3] 프론트엔드 공간 카드 UI 및 재태깅 뱃지 연동 검증**
  - DB 재태깅 마이그레이션으로 반영된 1,162건의 뱃지(`주차가능`, `유모차접근`, `아이동반추천`)가 프론트엔드 검색 필터 및 카드 UI에 정상 표출되는지 모니터링 및 테스트 코드 점검.

---

## 📊 [선행 조사 결과] 4대 공공 API 실측 분석 데이터 (작업 참고용)

> 개발계정 `.env.local` 키로 실제 최소 호출을 실행하여 `totalCount` 및 파라미터 반응을 실증 검증한 데이터임 (`_type=json` 응답 규격 적용).

- [ ] **하기 내용 확인하고 이에 맞게 파이프라인 변경 및 확인
   | API 소스명 | 일일 Quota | 전체 건수(실측) | 동기화 엔드포인트 | 날짜/증분 파라미터 실측 동작 | 최종 수집 & 증분 처리 전략 |
   | :--- | :--- | :--- | :--- | :--- | :--- |
   | **KorService2** (국문관광) | 1,000회/일 | 20,075건 | `areaBasedSyncList2` | `modifiedtime`은 **Exact Match(=)** 조건으로 동작 (YYYYMMDD 지정 시 당일 수정분만 반환, Range 검색 불가) | 하루 1회 `areaBasedList2` 전량 수집(약 20회 호출, Quota 소진율 2%) 후 DB UPSERT 유지 |
   | **KorWithService2** (무장애) | 1,000회/일 | 5,045건 | `areaBasedSyncList2` | `modifiedtime` **Exact Match(=)** 동작 (KorService2와 동일) | 하루 1회 `areaBasedList2` 전량 수집(약 5회 호출) 후 DB UPSERT 유지 |
   | **KorPetTourService2** (반려동물) | 1,000회/일 | 857건 | **`petTourSyncList2`** | `areaBasedSyncList2` 대신 전용 동기화 엔드포인트 존재 확인 | 전체 857건으로 소량이므로 단 1회 호출로 전량 재수집(`areaBasedList2`) 후 UPSERT 처리 |
   | **GoCamping** (고캠핑) | 1,000회/일 | 3,096건 | `basedSyncList` | **날짜 기반 필터링 파라미터 미지원** (`basedSyncList`에 `syncStatus`(A/U/D) 이력만 제공) | 건수가 적어(3~4회 호출로 완료) `basedList` 전량 수집 후 DB UPSERT 유지가 최선 |
   
   * **`contentTypeId` 수집 대상 확정:** `12`(관광지), `14`(문화시설), `15`(축제행사), `28`(레포츠) 4개 타입만 한정 수집 (`25` 코스, `32` 숙박, `38` 쇼핑, `39` 음식점 제외).

---

## 📋 [완료] 완료된 Task 히스토리

- [x] **`parental-badges.ts` UI 보완**: `is_free === null` 시 유료 오표기 방지 및 '뱃지 미노출(null)' 삼항 연산자 예외 처리 반영 완료.
- [x] **DB `raw_data` 기반 뱃지 재태깅 마이그레이션**: API 추가 호출 0건으로 `open_spaces` DB 내 `raw_data` 텍스트만 파싱하여 1,162건의 parental badge (`has_parking`, `stroller_accessible`, `is_kids_friendly`) 태깅 완료 (`retag-parental-badges.mjs`).
  - *PostgreSQL UPSERT 제약 회피*: Partial Payload 사용 시 `NOT NULL` 제약 위반을 방지하기 위해 `UPDATE ... WHERE external_id = ?` 구문 적용.
