
# 📋 [TODO] 데이터 수집·표준화 ETL 구축 및 작업 지시서

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 **[선행 조사 결과]** 및 **[데이터 표준화 원칙]**을 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

- [x] **[Task 7-3] 전국 수영장(공공+민간 인허가) 통합 수집 어댑터 구현**
  - **목적**: 체육진흥공단(공공/구립) + 행안부(인허가/민간·키즈풀) 2개 API를 통합 수집하여 전국 수영장 전수 확보 및 `is_kids_friendly` / `facility_type = '수영장'` 뱃지 자동화.
  - **인증키**: `PUBLIC_DATA_API_KEY`(디코딩 키)를 `encodeURIComponent`로 재인코딩하는 방식으로 두 API 모두 실제 호출 성공(재인코딩/웹 인코딩 그대로 전달 두 방식 다 실측 결과 최종 바이트가 동일해 같은 결과 — 별도 폴백 분기 불필요).
  - **API 1 (체육진흥공단 B551014)**: `resultCode==='00'` 성공, 실제 663건, WGS84 직좌표(`faci_lat`/`faci_lot`, 변환 불필요), `faci_stat_nm==='정상운영'` 필터.
  - **API 2 (행안부 1741000)**: `resultCode==='0'`(API1과 다른 한 자리 코드 — 실측으로 확인) 성공, 실제 1,892건, `CRD_INFO_X/Y`는 EPSG:5174(기존 `epsg5174.mjs` 재사용해 WGS84 변환), `SALS_STTS_NM==='영업/정상'` 필터.
  - **작업 지시 이행**: 시설명+주소(공백 정규화) 기준 중복 식별 → 겹치면 API1(공공) 우선, API2 제외. `is_free`는 `deriveIsFreeFallback`(API1: `faci_gb_nm==='공공'`, API2: `PBP_SE_NM==='공립'`)로 레코드별 판별, 요금 정보 자체가 없어 null 오탐 방지.
  - **Spec 상 지시 문구와의 불일치 처리(임의 변경 아님, 기존 스키마 준수)**: 지시서의 `facility_type = '수영장'`은 `spec/space/space-card.md`/`schema-mapper.mjs`가 정의하는 실제 도메인(`실내`/`야외`/`복합`)과 달라 그대로 대입해도 `normalizeFacilityType`이 조용히 `복합`으로 치환할 뿐 반영되지 않음 — 대신 API1의 실측 필드 `inout_gbn_nm`(실내/실외/실내외/없음)을 `playground-adapter`와 동일한 패턴으로 정직하게 매핑(API2는 해당 필드 없어 기본값 `복합` 유지).
  - **`is_kids_friendly` 키워드 매핑 정밀화 (2026-08-21 추가 지시 반영)**: 사용자가 지정한 키워드 목록(어린이/유아/키즈/영유아/유아풀/어린이풀/키즈풀)을 시설명(API1 `faci_nm`)/사업장명(API2 `BPLC_NM`)에 매칭해 `true`로 지정, 미매칭 시 기존대로 `false` 유지. "상세설명" 필드는 두 API 어디에도 존재하지 않음을 실측으로 확인해(API1/API2 모두 이름 외 텍스트 필드 없음) 실제 존재하는 이름 필드에만 매칭 적용. 실제 데이터 매칭 결과: 1,537건 중 215건 매칭("덕업관어린이수영장", "오션키즈 성북점" 등).
  - **실제 발견한 데이터 이슈(자체 수정)**: API2의 `MNG_NO`가 전국 유일 키가 아니라 발급 지자체별 자체 채번임을 실제 upsert 실패(`ON CONFLICT DO UPDATE command cannot affect row a second time`)로 발견 — 동일 `MNG_NO`("CDFH3301012026000001")가 인천 계양구 "스윔박스"부터 강원 정선군 "블루스카이풀"까지 37건의 전혀 다른 시설에 중복됨을 실측 확인. `LocalDataKidsAdapter`/`NationalParkEcotourAdapter`와 동일한 해법(이름|주소 SHA1 해시)으로 external_id를 결정적으로 재구성해 해결.
  - **검증**: `swimming-pool-adapter.test.mjs` 26/26 통과(키워드 매핑 정밀화 포함), `npx tsc --noEmit`/`npm run test`(전체 72/72)/`npm run build` 모두 통과, 실제 API 호출로 dry-run 후 실제 upsert 완료(1,537건, 중복 0건, is_kids_friendly 매칭 215건 확인).
  - **산출물**: `scripts/ingest/adapters/swimming-pool-adapter.mjs`, `scripts/ingest/adapters/swimming-pool-adapter.test.mjs`, `scripts/ingest/swimming-pool.mjs`, `package.json`의 `ingest:swimming-pool` 스크립트, `implementation/2026-08-21-swimming-pool-adapter.md`
