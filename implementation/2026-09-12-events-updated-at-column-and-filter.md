# events.updated_at 컬럼 + 자동 갱신 트리거 + 관리자 필터 (Step 123)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문)
직전 대화에서 "오늘 등록건" 필터(created_at 기준)로는 서울형 키즈카페처럼
external_id가 안정적인 소스가 오늘 실제로 UPDATE(예약 회차 갱신)됐어도 절대
잡히지 않는다는 구조적 사각지대를 확인했다(created_at은 최초 생성 시각이라
UPDATE로 바뀌지 않음). 그 자리에서 "updated_at 컬럼 + 자동 갱신 트리거를
추가해줄까요?"라고 제안했고, 사용자가 확인:

> "updated_at 어 이거 추가해.. 자동 갱신 트리거도 하고.."

## 변경 사항

### 1. DB: 컬럼 + 트리거 (프로덕션 적용 완료)
- `scripts/migrations/2026-09-12-events-updated-at-trigger.sql`:
  - `events.updated_at timestamptz not null default now()` 컬럼 추가.
  - 범용 트리거 함수 `public.set_updated_at()` 신규(이 DB에 아직 이런 범용
    "updated_at 자동 갱신" 함수가 없었음 — 실측 확인, 다른 테이블에도 재사용 가능).
  - **실제로 값이 바뀔 때만 갱신**: 단순히 "UPDATE 문이 실행됐는지"만 보면, 매일
    배치의 upsert가 내용이 하나도 안 바뀐 행에도 매번 UPDATE를 실행해 사실상
    모든 행이 영원히 "오늘 갱신됨"으로 보이는 문제가 생긴다(애초에 이 기능을
    만드는 목적 자체가 무의미해짐). `to_jsonb(new) - 'updated_at' - 'raw_data'`와
    `to_jsonb(old) - ...`를 비교해, 그 외 컬럼 중 하나라도 실제로 다르면만 갱신한다
    — `raw_data`는 원본 API가 내용은 그대로인데 부가 메타데이터만 매번 살짝
    다르게 내려줄 잡음 위험이 있어 제외(어차피 실제 변경은 start_date 등 노출
    컬럼에도 함께 반영됨). 컬럼이 늘어나도 하드코딩된 목록을 고칠 필요가 없다.
  - 기존 행은 컬럼 추가 시점 기본값(now())을 그대로 두지 않고 `updated_at =
    created_at`으로 되돌렸다 — 이 컬럼이 없던 동안의 실제 마지막 수정 시각은
    알 방법이 없어(추측 금지), "방금 갱신됨"이라는 잘못된 인상을 주는 대신
    "이 컬럼이 생기기 전엔 알 수 없다"는 정직한 근사치(생성 시각)를 택했다.
  - **트리거 동작 실측 검증**(프로덕션에서 임시 테스트 행으로 직접 확인, 테스트
    후 삭제): 값이 그대로인 UPDATE는 `updated_at` 불변, 실제로 값이 바뀐 UPDATE는
    `updated_at`이 갱신됨을 확인.

### 2. 관리자 API (`src/app/api/admin/data-grid/`)
- `route.ts`: 기존 `applyCreatedAtRange(query, from, to)`(created_at 전용)를
  컬럼명을 받는 범용 `applyDateRange(query, column, from, to)`로 확장해
  `updated_at` 범위 필터에도 재사용(제5장 제4조). `queryEvents`에 `updated_from`/
  `updated_to` 쿼리 파라미터 추가, `EVENTS_COLUMNS`에 `updated_at` 포함.
- `summary/route.ts`: `events_updated_today` 지표 추가(`updated_at >= 오늘 00:00
  UTC` 카운트). open_spaces는 여전히 트리거가 없어(수동 수정 시에만 JS가 채움)
  대상에서 제외.

### 3. 관리자 UI (`src/components/admin/data-grid-client.tsx`)
- 요약 카드에 "✏️ events 오늘 갱신(내용 변경): N건"을 추가로 보여준다(기존
  "내용 변경 건수는 집계할 수 없습니다" 안내 문구를 실제 값으로 교체).
- events 탭 전용 신규 필터 섹션 "수정일(updated_at)" — "오늘 갱신건 보기"/
  "최근 3일 갱신건 보기" 단축 버튼 + 달력 범위 + 날짜 초기화, 기존 "등록일
  (created_at)" 섹션과 동일한 UI 패턴.
- **상호 배제 안전장치**: 등록일 필터(기본값이 항상 "오늘"로 고정돼 있음)와
  수정일 필터가 동시에 켜지면 "오늘 생성 AND 오늘 갱신"으로 좁아져, 정작
  찾으려는(옛날에 생성되고 오늘 갱신만 된) 행이 다시 안 잡히는 것과 똑같은
  함정에 빠진다 — 그래서 한쪽 단축 버튼을 누르면 다른 쪽 범위를 항상 비운다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 134 files / 1566 tests 전체 통과. 신규 4개 테스트
  (`data-grid-client.test.tsx`): open_spaces 탭에는 수정일 필터 없음 / "오늘
  갱신건 보기" 클릭 시 등록일 필터를 비우고 updated_from·to로 조회 / 반대
  방향(등록일 클릭 시 수정일 비움)도 동일 / 요약 카드가 events_updated_today를
  표시.
- `npm run build`: 성공(라우트 목록 변화 없음).
- 트리거 자체는 프로덕션에서 임시 테스트 행으로 직접 실측 검증(위 1번 참고).

## 특이 사항 — 즉시 확인 시 주의할 점
- 이 트리거는 **적용된 시점(오늘, 2026-09-12) 이후의 UPDATE부터** 정확하게
  추적한다. 오늘 이미 있었던 이전 갱신(예: 직전 대화의 SafeMerge 최신화 수동
  재실행, Event↔Spot 자동 매칭 수동 실행 등, 트리거가 생기기 *전*에 일어난
  변경)은 컬럼 백필 정책상 `created_at`으로 되돌려져 있어 "오늘 갱신건" 필터에
  잡히지 않는다 — DB가 트리거 없이 일어난 과거 변경 시각을 알 방법이 없기
  때문에 정직하게 그렇게 처리했다. **내일 이후의 정기 배치부터는** 실제로
  값이 바뀐 이벤트가 정상적으로 "오늘 갱신건"에 잡힌다.
