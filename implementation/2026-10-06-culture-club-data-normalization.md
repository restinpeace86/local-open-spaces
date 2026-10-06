# 컬처클럽 데이터 정규화 — 연령/일정/상태/강사명 (개선사항 2, 3, 5)

## 구현 대상
`todo.md` 개선사항 2·3·5(2026-10-06): 이마트 컬처클럽/롯데마트 문화센터의
제각각인 원문 텍스트(연령 표기, 일정 표기, 상태/강사명)를 정형화된 DB
컬럼으로 파싱해 적재. 세 항목을 같은 두 ingest 스크립트에 함께 반영해
하나의 커밋으로 묶었다.

## 실측으로 확인한 전제(구현 범위를 좁힌 근거)
- **url(개선사항5)**: 두 마트 다 이미 프론트엔드에 URL 빌더가 있다
  (`culture-club-tab-view.tsx`의 이마트용 `https://www.cultureclub.emart.com/
  class/{classId}`, `culture-club-options.ts`의 롯데마트용
  `courseview.do` 링크 빌더) — 중복 구현하지 않는다.
- **fee/materialFee(개선사항5)**: 두 마트 다 이미 깨끗한 정수 컬럼
  (`class_fee`/`class_material_fee`)이다 — 손대지 않는다.
- **status(개선사항5)**: 롯데마트는 이미 깨끗한 6상태 ENUM
  (`registration_status`)이 있지만, 이마트는 `filter_status`(수집 시
  사용한 필터 버킷의 echo일 뿐, 실제 "현재 상태"를 보장하지 않음)뿐이라
  둘을 가로지르는 공통 조회가 불가능하다 — 공통 3단계 ENUM
  (OPEN/CLOSED/WAITING)을 추가했다.
- **instructor(개선사항5)**: 롯데마트는 이미 `instructor_name`이 깨끗한
  컬럼이다. 이마트는 전용 필드가 전혀 없다(GraphQL 쿼리 자체가 강사
  필드를 안 가져옴, `culture-club-tab-view.tsx`의 기존 주석도 이를 인정) —
  다만 `class_title`에 "~선생님" 식으로 직접 섞여 있는 경우가 실제로
  있어(실측: "은하수 선생님", "호야 선생님") 제목에서 파싱한다(없으면
  null — 지어내지 않음).
- **일정(개선사항3)**: 두 마트 다 이미 `class_start_date`(YYYYMMDD 텍스트)/
  `class_day`(한글 요일 배열)/`start_time`/`end_time`을 구조화된 컬럼으로
  갖고 있다 — 제목에 적힌 날짜("10/6개강-11/24종강")는 이 컬럼과 중복되는
  장식용 텍스트라 제목을 다시 정규식으로 파싱하지 않고, 이미 있는 구조화
  컬럼을 Date/표준 코드로 재포맷한다. 롯데마트는 종료일/차수 개념 자체가
  없다(스펙 본문도 인정) — 항상 null. 총 회차는 롯데마트는 기존
  `session_count`를 그대로 복사하고, 이마트는 전용 컬럼이 없어
  `class_title`에서 파싱한다("[8주]", "4회" 등).
- **연령(개선사항2)**: 롯데마트는 전용 `age_range_text` 컬럼이 있다.
  이마트는 전용 필드가 없지만 `class_title`에 직접 박혀 있다(실측:
  "(8~15개월)", "(21~22년생)") — 제목에서 파싱한다.

## 변경 사항

### 신규 유틸리티(순수 함수, 전부 단위 테스트)
- `scripts/ingest/lib/age-range-parser.mjs` — `parseAgeRangeToMonths(text,
  { referenceYear })`. 스펙의 2단계(①세/년생→출생연도 ②→개월 수)를
  "각 변을 독립적으로 자신의 단위로 개월 수 환산 후 min/max" 한 단계로
  구현(수학적으로 동일 결과, 실데이터에서 발견한 혼합 단위 사례
  "(40개월~21년생)"까지 특별 분기 없이 처리됨). "이상/이하/미만/초과"
  열린 범위도 처리(실측: 기존 emart 테스트 샘플 "(36개월 이상)").
- `scripts/ingest/lib/schedule-normalizer.mjs` — `koreanDayToCode`/
  `normalizeDaysToCodes`(한글 요일→MON~SUN), `yyyymmddToIso`(YYYYMMDD
  텍스트→Date), `parseRoundFromTitle`/`parseTotalSessionsFromTitle`
  (이마트 전용, 제목에서 "N차"/"N회"/"N주" 추출).
- `scripts/ingest/lib/culture-club-common.mjs` — `normalizeEmartStatus`/
  `normalizeLottemartStatus`(공통 3단계 ENUM 매핑 — 이마트 '정원마감'은
  "취소 시 등록 가능"이라 롯데마트 '대기자신청'과 동급으로 WAITING,
  '접수대기'는 아직 오픈 전이라 CLOSED로 구분), `parseInstructorFromTitle`
  (이마트 전용).

### DB 마이그레이션(적용 완료)
- `2026-10-06-culture-club-age-range-months.sql`: 양쪽 테이블에
  `min_age_months`/`max_age_months` integer + CHECK(max>=min).
- `2026-10-06-culture-club-schedule-normalized.sql`: 양쪽 테이블에
  `schedule_start_date`/`schedule_end_date` date, `schedule_days_code`
  text[], `round`/`total_sessions` integer(기존 컬럼은 그대로 두는
  비파괴적 확장).
- `2026-10-06-culture-club-status-instructor-normalized.sql`: 양쪽
  테이블에 `normalized_status`(CHECK), 이마트에만 `instructor_name`.

### Ingest 연결
- `emart-culture-club.mjs`의 `transform()`, `lottemart-culture-club.mjs`의
  `parseRow()`에 위 유틸리티를 연결해 upsert 시점에 함께 적재.
- 찜 상태감시 2종(`emart-culture-club-status-watch.mjs`,
  `lottemart-culture-club-status-watch.mjs`)과 `markFallenOutRowsAsUnavailable`
  (`lottemart-culture-club.mjs`)도 상태를 갱신할 때 `normalized_status`를
  함께 갱신하도록 수정 — 원본 상태 컬럼만 바뀌고 공통 ENUM이 뒤처지는
  불일치를 방지.

### 기존 데이터 백필
- `scripts/ingest/backfill-culture-club-age-range-months.mjs`,
  `backfill-culture-club-schedule-normalized.mjs`,
  `backfill-culture-club-status-instructor-normalized.mjs`(신규 3종,
  동일한 id 커서 페이지네이션 + dry-run + Safe Merge 패턴).
- 연령 백필은 실행 시작(대상: 이마트 6,532건 / 롯데마트 15,129건) — 행당
  순차 UPDATE라 완료까지 시간이 걸려 이 문서 작성 시점엔 백그라운드에서
  계속 진행 중이다. 일정/상태 백필은 아직 미실행(연령 백필 완료 후 순차
  실행 예정) — 완료되는 대로 결과를 후속 커밋/기록으로 남긴다.

## 검증
- `npx tsc --noEmit` / `npm run test`(274개 파일 2,858개, 신규 37개 포함:
  age-range-parser 13 + schedule-normalizer 12 + culture-club-common 14 −
  기존 테스트 toEqual 갱신 2건) / `npm run build` 전부 통과.
- 신규 유틸리티는 스펙의 worked example과 실제 수집된 제목 30여 건을
  그대로 테스트 케이스로 사용해 검증했다(추측이 아니라 실측 샘플 기반).

## 특이 사항
- 기존 `class_day`/`class_start_date` 등 원본 컬럼은 전혀 수정하지
  않았다(비파괴적 확장) — 기존 프론트엔드/관리자 패널 코드는 영향 없음.
- 이번 변경은 DB 적재까지만 수행했다 — 관리자 패널/프론트엔드에 새 컬럼을
  노출하는 UI 작업은 todo.md에 명시된 요구사항이 아니라 포함하지 않았다
  (제5장 제2조 Spec 우선 구현).
