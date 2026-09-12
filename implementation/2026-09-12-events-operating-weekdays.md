# 관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가

## 구현 대상
- Step 130 (todo.md 개선사항10 후속4)

## 구현 일시
2026-09-12

## 사용자 지시(원문 취지)
> 관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가.
> 상세팝업에서 표준 중분류 선택 ➡️ 타겟 연령 선택 ➡️ 블로그 검증 ➡️ 스팟 연결 이런
> 식인데 여기에 일자는 기본적으로 원천데이터꺼로 하긴하는데 예외 규칙을 여기서
> 집어넣으면 해당 예외 규칙도 적용되도록..
>
> 관리자 입력 항목(간편한 토글/체크 방식): 기본값 매일 운영(Start~End 기간 내 상시).
> 예외 규칙 선택(택 1 또는 조합): ☑️ 주말만 운영(토·일) / ☑️ 특정 요일 지정(예: 화,목)
> / ☑️ 정기 휴무일 제외(예: 매주 월요일 휴무).
>
> 여기에 대하여 관리자가 체크하고 저장하면.. 해당 규칙이 컬럼에 들어있다면 해당
> 규칙도 한번 훑어보고 이에 맞춰서 이벤트 기간중에 있더라도 이에 부합하지 않으면
> 안나오도록해야돼. 정기 휴무일이 매주 월요일이라고 했을 때 오늘이 월요일이면
> 해당 이벤트 팝업은 안나와야겠지?

## 변경 사항

### 1. DB 스키마 (`scripts/migrations/2026-09-12-events-operating-weekdays.sql`, 적용 완료)
`events` 테이블에 `operating_weekdays text[]`, `excluded_weekdays text[]` 두 컬럼을 추가했다.

**데이터 모델링 판단**: 사용자가 제시한 "주말만 운영"/"특정 요일 지정"/"정기 휴무일
제외" 3개 예외 규칙을 그대로 3개의 독립 플래그로 만들지 않았다. 앞의 두 개("주말만
운영", "특정 요일 지정")는 사실 같은 개념("허용 요일 목록")을 고르는 두 가지 입력
방식(프리셋 vs 커스텀)일 뿐이고, 세 번째("정기 휴무일 제외")는 이와 독립적으로 조합
가능한 별개 개념("제외 요일 목록")이다. 그래서:
- `operating_weekdays`: 허용 요일 목록(null/빈 배열 = 제약 없음 = 매일 운영, 기존
  이벤트 전체와 하위 호환). UI에서는 "매일 운영"/"주말만 운영(토·일)"/"특정 요일
  지정" 3개 프리셋 버튼으로 이 컬럼 하나에만 쓴다.
- `excluded_weekdays`: 정기 휴무 요일 목록(null/빈 배열 = 휴무 없음). 별도의 체크박스로
  독립적으로 켜고 끈다.

이렇게 하면 사용자가 예로 든 "매일 운영 + 월요일만 휴무" 조합(허용목록은 비워두고
제외목록만 채움)도, "화·목만 운영하되 그중 목요일은 휴무"처럼 두 목록이 동시에
쓰이는 조합도 스키마 변경 없이 표현된다.

`npm run gen:types`로 `src/types/database.types.ts`를 재생성해 Supabase 타입에
새 컬럼을 반영했다(수동으로 타입 파일을 고치지 않음 — 기존 관례).

### 2. 판정 로직 (`src/lib/spaces/event-operating-schedule.ts`, 신규)
```ts
export function isEventOperatingOn(schedule: OperatingSchedule, date: Date): boolean {
  const code = WEEKDAY_CODES[date.getDay()];
  if (schedule.excluded_weekdays && schedule.excluded_weekdays.includes(code)) return false;
  if (schedule.operating_weekdays && schedule.operating_weekdays.length > 0) {
    return schedule.operating_weekdays.includes(code);
  }
  return true;
}
```
휴무 목록을 먼저 검사(우선순위 최상위 — 허용 목록에 포함돼 있어도 휴무면 무조건
쉼)하고, 그다음 허용 목록이 있으면 그 안에 있는지만 확인한다. 테스트
(`event-operating-schedule.test.ts`, 8건 — 기본값/빈배열/월요일 휴무 예시/주말만
운영/특정 요일 지정/허용+제외 조합)로 사용자가 제시한 예시("정기 휴무일이 매주
월요일.. 오늘이 월요일이면.. 안나와야겠지?")를 정확히 검증했다.

### 3. 관리자 API (`src/app/api/admin/events/operating-schedule/route.ts`, 신규)
`PATCH { id, operating_weekdays, excluded_weekdays }` — 두 필드 모두
`WEEKDAY_CODES`(SUN~SAT 3글자 코드) 배열이거나 null만 허용, 빈 배열은 null로
정규화해 저장한다. `CategoryMinEditor`/`TargetAudienceEditor`가 쓰는 기존
PATCH 라우트들과 동일 관례(단일 id, `createAdminClient`, 저장 후 갱신된 컬럼만
`select`로 되돌림).

### 4. 관리자 UI (`src/components/admin/raw-data-modal.tsx`)
`OperatingScheduleEditor` 컴포넌트를 추가하고, events 탭 상세 팝업에서
`TargetAudienceEditor` 다음(`LocationEditor`/`SpaceLinkEditor` 앞)에 배치했다 —
사용자가 설명한 흐름("표준중분류→타겟연령→..") 순서에 맞춘 위치다.

- 프리셋 버튼 3개(매일 운영/주말만 운영(토·일)/특정 요일 지정) — "특정 요일 지정"을
  고르면 7일 체크박스 그리드가 나타나 `operating_weekdays`를 직접 고른다.
- "정기 휴무일 지정" 체크박스 — 켜면 별도의 7일 체크박스 그리드가 나타나
  `excluded_weekdays`를 고른다. 위 프리셋과 완전히 독립적으로 함께 켤 수 있다.
- 저장 시 `/api/admin/events/operating-schedule`로 PATCH하고, 응답을 그대로
  `onOperatingScheduleUpdated` 콜백으로 부모(`data-grid-client.tsx`)에 전달해
  로컬 grid/상세 팝업 state를 즉시 갱신한다(`onCategoryMinUpdated` 등과 동일
  패턴).
- 다시 열었을 때 저장된 값에서 프리셋을 되짚어(`detectOperatingPreset`) 이전에
  고른 옵션이 그대로 보이도록 했다(예: `operating_weekdays=['SAT','SUN']`이면
  "주말만 운영" 버튼이 선택된 채로 열림).

`data-grid-client.tsx`의 `AdminEventRow` 타입에 `operating_weekdays`/
`excluded_weekdays`를 추가했고, `EVENTS_COLUMNS`(`/api/admin/data-grid/route.ts`)에도
두 컬럼을 포함시켜 상세 팝업이 별도 GET 없이 그리드 행에서 바로 현재 값을 읽는다
(`CategoryMinEditor` 등과 동일 관례).

### 5. 필터링 적용 범위 — `/api/spots/linked-events`에만 우선 적용
사용자의 확인 문구("정기 휴무일이 매주 월요일.. 오늘이 월요일이면.. 이벤트 팝업은
안나와야겠지?")가 구체적으로 가리키는 화면이 스팟 상세의 "연결된 이벤트" 섹션과
가장 직접적으로 연결돼 있고, 오늘 이 대화에서 이미 타겟연령 필터를 추가로 손댄
라우트이기도 해(Step 127) 이 라우트에 우선 적용했다.

```ts
const operatingToday = data.filter((row) => isEventOperatingOn(row, now));
```
`start_date~end_date` 기간 필터(`gte('end_date', today)`)는 그대로 두고, 조회 후
JS에서 요일 규칙을 추가로 걸러낸다(스팟 하나당 최대 10건 한도라 성능 영향 없음 —
DB 레벨에서 "배열 포함 + 오늘 날짜" 조합을 표현하기보다 애플리케이션에서 계산하는
편이 명확함).

## 후속(같은 날, 사용자 확인 답변 반영) — 적용 범위 확대
위 "확인 필요" 질문에 사용자가 답했다: "스팟픽에 연결된 이벤트가 스팟픽 화면의
스팟에서 어떤형태로든 뜨게 했을때 적용되어야하고 이벤트픽화면에서도 뜨는 이벤트들에
대하여 해당 규칙대로 적용되게 해야돼."

**스팟픽 쪽**: `linked-events`/`linkedEvents`를 참조하는 모든 파일을 실측 확인한
결과, 연결된 이벤트가 노출되는 화면은 `detail-modal.tsx`(스팟 상세의 "🎪 진행 중인
이벤트" 섹션, `/api/spots/linked-events` 기반) 하나뿐이었다 — 이미 위에서 적용을
마쳤으므로 추가 조치 없음.

**이벤트픽 쪽**: `get-home-feed.ts`의 `EVENT_COLUMNS`/`EventRow`에
`operating_weekdays`/`excluded_weekdays`를 추가하고, 공용 헬퍼를 만들었다.
```ts
export function filterEventsOperatingToday<T extends { operating_weekdays: string[] | null; excluded_weekdays: string[] | null }>(
  rows: T[]
): T[] {
  const now = new Date();
  return rows.filter((row) => isEventOperatingOn(row, now));
}
```
`EVENT_COLUMNS`를 사용하는 이벤트픽 조회 함수 전부(총 10개 지점 — fetch 직후,
`toEventItem` 매핑 직전에 적용)에 공통으로 걸었다:
`getTodayEvents`, `getReservationOpenEvents`, `getCurrentlyOngoingEvents`,
`getTodayEventsPage`, `getCurrentlyOngoingEventsPage`, `getReservationOpenEventsPage`,
`searchEvents`, `getFreeFeed`(events 분기), `getThemeSpotFeed`(events 분기),
`getCategoryMinFeed`(events 분기). `/api/spots/linked-events`도 자체 필터 로직 대신
이 공용 헬퍼로 통합해 중복을 없앴다(제5장 제4조 기존 구조 우선).

**의도적으로 제외한 지점**: `getCategoryMinCounts()`는 특정 중분류가 바텀시트에
표시할 만큼 실제 행이 있는지 판단하는 `count(*)`(head: true) 전용 쿼리다. 요일
배열 포함 여부는 SQL 집계로 표현할 수 없어(행을 실제로 읽어야 판별 가능)
이 함수만은 그대로 두었다 — 실제 카드가 이 카운트만으로 노출되는 게 아니라
위 개별 조회 함수들이 다시 걸러내므로, 여기서 요일 규칙을 안 걸어도 화면에
"쉬는 이벤트"가 실제로 보이는 일은 없다(단지 그 중분류 버튼이 근소하게 더
자주 보일 수 있는 정도의 부수 효과 — 카운트가 오늘 쉬는 이벤트 하나뿐이라
실제로는 0건인 특수한 경우에 한함).

## 검증
- `npx tsc --noEmit`: 통과(신규 컬럼 반영을 위해 `npm run gen:types`로
  `database.types.ts` 재생성 필요했음 — 재생성 후 통과).
- `npm run test -- --run`: 136 파일 / 1604건 전체 통과. 신규 테스트: 8건
  (`event-operating-schedule.test.ts`), 7건(`raw-data-modal.test.tsx`
  OperatingScheduleEditor 스위트), 2건(`get-home-feed.test.ts` —
  `getCurrentlyOngoingEvents`에 정기 휴무일/허용 요일 규칙 검증 추가, 실행 시점의
  실제 요일을 동적으로 계산해 하드코딩된 날짜로 우연히 통과하지 않도록 함).
- `npm run build`: 성공(`/api/admin/events/operating-schedule` 라우트 포함 확인).
