# 예약/운영 상태 필드는 SafeMerge에서 항상 최신값으로 갱신 (Step 119)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문 + 실측 근거)
직전 대화에서 "서울형 키즈카페 한성백제박물관점" 외 다른 지점들의 9월 예약 현황을
조사하다가 실제 버그를 발견했다: "관악구 난곡동점" 등 대부분의 서울형 키즈카페가
`events.start_date/end_date`가 2026-08-25~09-07(이미 끝난 회차)에 고정된 채였는데,
같은 시점(2026-09-10)에 수집된 `raw_ingest_data`에는 이미 다음 회차(09-10~09-21,
"접수중")가 들어와 있었다. 원인은 `upsertRowsSafeMerge`(scripts/ingest/lib/
supabase-admin.mjs)의 "기존 값이 있으면 새 값으로 절대 덮어쓰지 않는다" 규칙이
시간에 따라 실제로 달라져야 하는 필드에도 그대로 적용된 것.

사용자 지시:
> "어 ... 내가 구조를 못따라가겠네 일단 시간관련 필드.. 저거 말고도 예약 일자들도
> 항상 최신값으로 갱신에 포함하는게 맞을거같은데... 주기적으로 바뀌어야 하는
> 필드에 대하여 좀더 확인하고.. 최신값으로 갱신해.."

## 조사
- `upsertRowsSafeMerge`는 base-collector-adapter.mjs(→ SEOUL_YEYAK 등 Decision 017
  다중 테이블 어댑터)뿐 아니라 seoul-culture-events.mjs, tour-api-festival.mjs,
  cultural-spaces.mjs 등 여러 소스가 공유하는 함수라 사실 이 버그는 SEOUL_YEYAK
  하나만의 문제가 아니라 **`events`를 이 함수로 적재하는 모든 소스에 잠재적으로
  영향**을 준다.
- `events` 테이블 전체 컬럼을 실측(information_schema) 조회해, "원본에서 주기적으로
  실제로 달라지는" 필드를 다음으로 확정했다:
  `start_date`, `end_date`, `reservation_start_date`, `reservation_end_date`,
  `is_active`, `booking_status`.
- 제외한 필드와 이유:
  - `category_min`/`category_min_source`, `target_audience`/`target_audience_source`:
    `_source` 컬럼이 따로 있다는 것 자체가 "관리자가 수동으로 덮어쓸 수 있는 필드"라는
    뜻(MANUAL 값 존재) — 항상 최신화 대상에 넣으면 관리자가 큐레이션 모달/데이터그리드에서
    직접 분류한 값이 재수집 때마다 원본 재분류로 되돌아간다. 절대 포함하지 않았다.
  - `is_free`, `venue_name`, `title`, `description` 등: 시간에 따라 "만료"되는 개념이
    아니라 프로그램 자체의 속성이라 기존 SafeMerge(보존) 규칙이 맞다.
  - `open_spaces`: 컬럼을 전수 조회한 결과 start/end/reservation 날짜, booking_status
    같은 "회차성" 시간 필드 자체가 없다(상시 시설 전제) — 애초에 대상이 아니다.

## 변경 사항
- `scripts/ingest/lib/supabase-admin.mjs`: `ALWAYS_REFRESH_FIELDS = { events: [...] }`
  신규 상수(테이블별 확장 가능한 구조). `upsertRowsSafeMerge`의 병합 루프에서 이
  목록에 속한 필드는 규칙을 뒤집는다 — **incoming(이번에 새로 수집한) 값이 null/
  undefined가 아니면 무조건 incoming이 이긴다.** 다만 이번 재가공이 그 필드를
  일시적으로 못 채워 null/undefined로 들어온 경우에만(파서 결함 등 방어 차원) 예외적으로
  기존 값을 보존한다 — "항상 최신화"의 목적이 원본의 실제 변경 반영이지, 일시적
  파싱 실패로 멀쩡한 값을 지우는 게 아니기 때문. location/location_precision 쌍
  정합성 보호 로직은 그대로 유지(순서상 이 필드들 다음에 별도 처리).

## 검증
- `npx tsc --noEmit`: 통과(.mjs 파일이라 타입 영향 없음, 앱 전체 기준 통과).
- `npm run test -- --run`: 134 files / 1556 tests 전체 통과. `supabase-admin.test.mjs`에
  신규 4개 테스트 추가:
  1. 6개 시간 필드 모두 기존 값이 있어도 incoming으로 갱신되는지(실제 버그 재현 시나리오와
     동일한 값으로 검증 — 08-25~09-07 → 09-10~09-21, is_active false→true).
  2. incoming이 해당 필드를 null/undefined로 보내면 예외적으로 기존 값을 보존하는지.
  3. `open_spaces`는 대상 필드가 없어 기존 SafeMerge(보존) 규칙이 그대로 적용되는지.
  4. `category_min`/`target_audience`(관리자 수동 분류 가능 필드)는 절대 항상-최신화
     대상이 아니라 기존 값을 보존하는지(회귀 방지 — 이게 제일 중요한 안전장치).
- `npm run build`: 성공(스크립트는 Next.js 빌드 대상이 아니지만 앱 전체 영향 없음 확인).

## 특이 사항 / 후속 조치
- 이 수정은 **다음 정기 배치(daily ingestion)부터** 새로 수집되는 데이터에 적용된다.
  이미 DB에 고여 있는 기존 행(예: "관악구 난곡동점" 등 서울형 키즈카페 대부분)은
  다음 배치가 그 소스를 다시 수집해야 실제로 갱신된다 — 코드만 고친다고 과거 데이터가
  즉시 바뀌지는 않는다. 이어서 SEOUL_YEYAK 수집을 1회 수동 실행해 즉시 반영을
  시도한다(별도 기록 없이 운영 액션으로 처리, 결과는 대화창에 보고).
