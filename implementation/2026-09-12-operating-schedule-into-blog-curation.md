# 운영 요일/반복 규칙 편집기를 블로그 큐레이션 모달 안으로 이동

## 구현 대상
- Step 132 (todo.md 개선사항10 후속8)

## 구현 일시
2026-09-12

## 사용자 지시(원문 취지)
> 운영 요일 / 반복 규칙으로 예외일자 설정하는거..
> 이거 관련 블로그 큐레이션 안으로 집어넣어줄수 있어? 보통 RAW_DATA는 기간으로만
> 나와있어서... 블로그 보고 파악하는데...

## 배경
Step 130에서 만든 "운영 요일 / 반복 규칙" 편집기는 상세 팝업의 독립 섹션(표준
중분류 → 타겟 연령 다음)에 있었다. 그런데 원천 데이터(raw_data)는 대부분
start_date~end_date 기간만 줄 뿐 "정기 휴무일이 며칠인지", "특정 요일에만
운영하는지" 같은 실제 반복 패턴은 알려주지 않는다 — 관리자는 이 패턴을 알아내려면
결국 블로그를 검색해서 읽어야 한다. 즉 "운영 요일/반복 규칙을 확인하는 시점"과
"블로그를 읽는 시점"이 실제로는 같은 순간인데, 편집기가 블로그 큐레이션 모달과
별개 화면에 있어 관리자가 두 화면을 오가야 했다.

## 변경 사항

### 1. `src/components/admin/operating-schedule-editor.tsx` (신규, 공유 컴포넌트로 분리)
기존에 `raw-data-modal.tsx` 안에 비공개로 있던 `OperatingScheduleEditor`와 그
보조 함수/컴포넌트(`WeekdayCheckboxGrid`, `OccurrenceCheckboxGrid`,
`detectOperatingPreset` 등)를 통째로 이 파일로 옮기고 export했다.

`row` prop 타입을 `AdminEventRow`(데이터그리드 전용, 30여 개 필드) 대신 이
편집기가 실제로 쓰는 필드만 요구하는 좁은 타입으로 바꿨다:
```ts
export type OperatingScheduleRow = {
  id: string;
  start_date: string;
  end_date: string;
  operating_weekdays?: string[] | null;
  excluded_weekdays?: string[] | null;
  operating_nth_weekdays?: string[] | null;
};
```
이렇게 해야 `data-grid-client.tsx`(관리자 데이터그리드 전용)에 의존하지 않는
`event-blog-curation-modal.tsx`에서도 그대로 재사용할 수 있다(제5장 제4조 —
같은 편집기를 두 파일에 복붙하지 않음).

### 2. `src/components/admin/raw-data-modal.tsx`
- 위 컴포넌트/타입 정의를 전부 제거하고 `operating-schedule-editor.tsx`에서
  import하도록 변경.
- 상세 팝업 안에서 `OperatingScheduleEditor`를 직접 렌더링하던 독립 섹션을
  제거했다(더 이상 이 화면에서 단독으로 뜨지 않음).
- `EventBlogCurationModal` 호출부에 편집기가 필요로 하는 필드
  (`start_date`/`end_date`/`operating_weekdays`/`excluded_weekdays`/
  `operating_nth_weekdays`)와 `onOperatingScheduleUpdated` 콜백을 그대로
  전달하도록 확장 — 저장 결과가 이 콜백을 통해 여전히
  `data-grid-client.tsx`의 grid/상세 팝업 행 state에 반영된다(동작은 그대로,
  위치만 이동).

### 3. `src/components/admin/event-blog-curation-modal.tsx`
`event` prop 타입에 위 5개 필드를 추가하고, `onOperatingScheduleUpdated` 콜백
prop을 새로 받는다. 타겟 연령 선택 섹션 바로 다음(저장 버튼 앞)에
`OperatingScheduleEditor`를 렌더링한다 — 블로그를 확인하며 가격/타겟연령을
채우는 흐름 그대로, 마지막에 실제 반복 패턴까지 한 화면에서 정리할 수 있다.
`onOperatingScheduleUpdated`가 없으면(호출부가 안 넘기면) 편집기 자체가
렌더링되지 않는다 — 기존 관례(옵셔널 콜백으로 섹션 노출 여부를 제어)를 그대로
따른다.

이 편집기는 모달의 "저장 및 완료" 버튼과 무관하게 **자체 저장 버튼으로 즉시
PATCH**한다(기존 동작 그대로 — 블로그 후보 선택/가격/타겟연령은 "저장 및 완료"를
눌러야 반영되지만, 운영 요일 규칙은 Step 130부터 계속 그 자리에서 바로 저장되는
독립 위젯이었다. 이번 이동으로 그 동작 방식 자체는 바뀌지 않았다).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 137 파일 / 1617건 전체 통과.
  - `raw-data-modal.test.tsx`의 기존 "운영 요일/반복 규칙 편집기" 스위트(8건)는
    제거(더 이상 이 화면에 없으므로).
  - `operating-schedule-editor.test.tsx`(신규, 7건) — 편집기 자체를
    `RawDataModal` 없이 단위 테스트(프리셋 선택/저장/복원/매월 N번째 요일 포함,
    기존 8건 중 라우팅 로직과 무관한 내용을 그대로 포팅).
  - `event-blog-curation-modal.test.tsx`에 3건 추가 — 콜백을 넘기면 편집기가
    렌더링되는지, 안 넘기면 렌더링되지 않는지, 실제로 저장하면 PATCH +
    `onOperatingScheduleUpdated` 호출까지 이어지는지.
- `npm run build`: 성공.

## 특이 사항
DB 스키마/판정 로직(`isEventOperatingOn`, `operating_weekdays`/
`excluded_weekdays`/`operating_nth_weekdays` 컬럼, 필터링 적용 지점)은 이번
작업에서 전혀 바뀌지 않았다 — 관리자 UI에서 이 값을 "어느 화면에서 입력하는가"만
바뀌었다.
