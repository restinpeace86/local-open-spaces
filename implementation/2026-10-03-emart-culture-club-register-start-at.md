# 이마트 컬처클럽 접수 시작 시각(register_start_at) 컬럼 추가

## 구현 대상
사용자 지시(2026-10-03): "지금 접수기간은 연/월일뿐만아니라 시간까지 되어있어
1000은 10:00 (kst)를 의미하는걸텐데.. 관련하여 해당 시간 중요해 예약
시작시간이니 이 부분 파싱해서 따로 컬럼으로 가지고 있든 해야할거같은데?" —
향후 문화센터 강좌 찜(찜을 누르면 접수 시작 전에 알람을 주는 기능) 구현을
위한 선행 데이터 정비.

## 배경
`emart_culture_club_classes.register_start_date`는 원본 그대로 "YYYYMMDDHHmm"
텍스트(예: "202607231000")로 저장돼 있어 문자열 비교/정렬/시각 연산이
불가능했다. 실측 확인(기존 6,520건 샘플) 결과 이 필드는 예외 없이 항상 12자,
KST 10:00 같은 실제 접수 시작 시각을 포함하고 있었다(반면 class_start_date/
class_end_date/register_end_date는 항상 8자 — 날짜만, 시각 없음).

## 변경 사항
### 1. `scripts/migrations/2026-10-03-emart-culture-club-register-start-at.sql`
- `register_start_at timestamptz` 컬럼 추가(인덱스 포함).
- 기존 6,520건에 대한 1회 백필 UPDATE 포함(`register_start_date`를
  `substring`으로 분해해 KST(+09:00) timestamptz로 변환) — `register_start_at
  is null` 조건으로 멱등, 재실행해도 안전.
- 원본 `register_start_date` 텍스트 컬럼은 그대로 보존(표시용/원본 보전).

### 2. `scripts/ingest/emart-culture-club.mjs`
- `parseRegisterStartAt(raw)` 함수 추가(export) — "YYYYMMDDHHmm" → KST
  ISO 문자열(`"2026-08-10T10:00:00+09:00"`) 변환, 길이가 12자가 아니거나
  빈 값이면 null.
- `transform()`에서 매 행마다 `register_start_at`을 채우도록 수정 — 이후
  신규/갱신 수집분은 매일 배치가 자동으로 채운다.

### 3. `scripts/ingest/emart-culture-club.test.mjs`
- `parseRegisterStartAt` 전용 테스트 3개(정상 변환/null·빈 문자열/길이 불일치
  방어) 추가.
- 기존 `transform()` 샘플 테스트에 `register_start_at` 필드 단정 추가.

## 검증
- `npx vitest run scripts/ingest/emart-culture-club.test.mjs` 10개 통과.
- `npx tsc --noEmit` / `npm run test`(256개 파일 2,699개) / `npm run build`
  전부 통과.
- 마이그레이션 적용(`node scripts/apply-sql.mjs
  scripts/migrations/2026-10-03-emart-culture-club-register-start-at.sql`)
  후 실제 DB 재조회: 전체 6,520건 중 `register_start_at` null 0건, 샘플
  `register_start_date: '202608101000'` → `register_start_at:
  '2026-08-10T01:00:00+00:00'`(= KST 10:00, UTC 환산 정확히 일치) 확인.

## 특이 사항
- 이번 변경은 데이터 컬럼 정비까지만 수행한다. "찜 누르면 접수 시작 전 알람"
  기능 자체(알람 스케줄링, 발송 채널 등)는 사용자가 "만들꺼야"(향후 계획)로
  언급했을 뿐 아직 구현 지시가 없어 범위에 포함하지 않았다(제3장 제5조 추측
  금지) — 관련 설계 맥락은 project 메모리에 별도 기록.
