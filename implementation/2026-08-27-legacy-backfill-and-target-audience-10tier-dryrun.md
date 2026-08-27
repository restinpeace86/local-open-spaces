# 레거시 SEOUL_RESERVATION_* raw_data 백필(실제 DB 반영) + target_audience 10대 분류 체계 Dry-run

## 구현 대상
- `implementation/todo.md`의 "[레거시 백필 실행 및 Target Audience 10대 분류 체계 시뮬레이션]" 항목.

## 구현 일시
2026-08-27

## 작업 성격
지시문의 두 절대주의 원칙을 그대로 준수했다:
1. **레거시 백필은 실제 DB 적용** — `events.external_id LIKE 'SEOUL_RESERVATION_%'`이고
   `source IS NULL`인 2,544건 중 서울 예약 통합 API(`tvYeyakCOllect`) 전수 재수집으로
   SVCID가 정확히 일치하는 2,322건(91.3%)의 `source`/`raw_data` 두 컬럼을 실제 UPDATE했다.
   스크립트는 `scripts/migrations/2026-08-27-backfill-legacy-seoul-reservation-raw-data.mjs`로
   보존했다(재실행해도 안전한 멱등 스크립트).
2. **10대 체계 시뮬레이션은 Read-Only** — `events.target_audience` 컬럼을 추가하지 않았고
   분류 결과로 어떤 행도 UPDATE하지 않았다. 조사·시뮬레이션에 사용한 임시 스크립트는
   실행 후 즉시 삭제했다.

## 핵심 발견
1. **백필 성공률 91.3%(2,322/2,544)**: 나머지 222건은 라이브 API 피드에서 이미 사라진
   (서비스 종료/만료) 항목이라 추측 없이 그대로 `NULL` 유지했다.
2. **10대 체계 최종 NULL 잔여 16.35%(582/3,560)**: 8대 체계(2026-08-27 오전, 50.48%) 대비
   대폭 개선됐다. 개선 요인은 (a) 레거시 백필로 원천 필드 커버리지 확대, (b) `FACILITY`
   태그 신설로 시설 대관류 명확화, (c) `ADULT` 태그 신설로 "성인" 단독 값 436건 해소.
3. **FACILITY 태그 설계는 8대 체계의 미승인 제안(스포츠 시설 → ALL)을 재배정한 것**:
   추측이 아니라 같은 근거("공간 대관이라 나이 개념 없음")의 논리적 귀결임을
   `docs/target-audience-10tier-dryrun-report.md` 2.2절에 투명하게 기록했다.
4. **스코프 외 발견 2건을 임의 확장하지 않음**: (a) `TOUR_API_`/`SEOUL_YEYAK_` 소스=null
   45건은 지시문이 `SEOUL_RESERVATION_*`만 명시해 백필 대상에서 제외, (b) 숫자 나이
   임계값 표현(`8세 이상` 등)은 새 키워드 체계 밖이라 매핑하지 않고 제안으로만 기록.

상세 퍼널 수치, 잠정 규칙 전문, 미결 사항은 `docs/target-audience-10tier-dryrun-report.md`에
기록했다.

## 대표 확인이 필요한 미결 사항 (임의 결정하지 않고 그대로 보고)
1. 1단계 FACILITY 재배정(스포츠 시설 16종) 및 ADULT 키워드 등 잠정 규칙 채택 여부.
2. 숫자 나이 임계값 파싱 규칙 신설 여부.
3. "여성/장애인/국가유공자" 등 비-연령 인구 속성 처리 방침.
4. 스코프 외 발견(`TOUR_API_`/`SEOUL_YEYAK_` 소스=null 45건) 백필 필요 여부.
5. `events.target_audience`/`target_audience_source` 컬럼 신설 및 실제 UPDATE 실행 여부.

## 검증
- 레거시 백필: 실제 Supabase REST(UPDATE) 호출로 2,322건 반영 확인, 이후 SELECT로
  `source='seoul_public_reservation'` 건수/`source IS NULL` 잔여 건수를 재조회해 검산했다
  (2,322 + 222 = 2,544 일치).
- 10대 분류 시뮬레이션: 코드/스키마 변경이 없어 별도 tsc/test/build 대상 자체가 없다
  (이전 target_audience/category_maj 분석 세션과 동일). 모든 수치는 Supabase에 대한
  실제 SELECT 쿼리로 직접 실측했다.
- 백필 스크립트가 참조하는 기존 코드(`scripts/ingest/adapters/seoul-yeyak-adapter.mjs`,
  `scripts/ingest/lib/supabase-admin.mjs`)는 수정하지 않았다 — `npx tsc --noEmit`/
  `npm run build`는 이번 변경(신규 `.mjs` 스크립트 1개, 문서 추가)과 무관하게 기존
  상태 그대로 통과함을 확인했다.
