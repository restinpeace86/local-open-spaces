# 예약 오픈 알림 대상 확인 + 운영 요일/반복 규칙 독립 모달 분리 및 특정 날짜 지정
# 모드 추가 + open_spaces "이벤트픽으로 이동" 기능 제거

## 구현 대상
사용자 지시(2026-09-22), 한 메시지에 담긴 4개 요청:
1. "어쨌든 찜한 사람한테만 예약 오픈 알림 푸시가는거 맞지?" — 확인 요청.
2. "블로그로 큐레이션인가 이벤트쪽에 거기에.. 운영 요일 반복 규칙.. 그거 한단계
   밖으로 빼.. 상세 팝업에서 블로그로 큐레이션 진입하는 버튼이랑 같은곳으로
   빼줘" — 운영 요일/반복 규칙 편집기를 블로그 큐레이션 모달 밖으로 재분리.
3. "그거 사용자가 일자 선택으로도 지정할 수 있게 해줘.. 17일 20일 이런식으로
   운영하는경우가 있어서" — 특정 날짜 지정 모드 추가.
4. "open_spaces 쪽의 상세페이지에서 [이 데이터가 사실은.. 이벤트픽으로 이동]
   이건 이제 events쪽이랑 open_spaces쪽이랑 사실상 분리했으니깐.. 빼줘" —
   이관 기능 제거.

## 1) 예약 오픈 알림 대상 확인
`scripts/ingest/event-reservation-reminder-push-batch.mjs` 재확인 결과,
`user_bookmarks`로 해당 이벤트를 찜한 유저만 대상으로 하고, 그중에서도
등급이 `active`/`excellent`/`power`인 유저에게만 발송하는 로직이 이미
그대로였다(코드 변경 없음 — 사실 확인 답변).

## 2) 운영 요일/반복 규칙을 블로그 큐레이션 모달 밖으로 재분리
2026-09-12에 "블로그 보고 파악하는데"라는 이유로 `EventBlogCurationModal`
안으로 옮겼던 `OperatingScheduleEditor`/`OperatingExceptionsEditor`를, 다시
블로그 큐레이션 버튼과 같은 레벨의 독립 버튼("📅 운영 요일/반복 규칙")으로
분리했다.
- 신규: `src/components/admin/event-operating-schedule-modal.tsx`
  (`EventOperatingScheduleModal`) — 두 편집기를 그대로 감싸는 얇은 모달
  셸. 편집기 컴포넌트 자체는 손대지 않고 재사용(제5장 제4조).
- `src/components/admin/event-blog-curation-modal.tsx`: 두 편집기 렌더링과
  `onOperatingScheduleUpdated`/`start_date`/`end_date`/`operating_*` 관련
  props를 모두 제거해 2026-09-11 원래 범위(블로그 검색/가격/타겟 연령)로
  되돌렸다.
- `src/components/admin/raw-data-modal.tsx`: events 탭에 "📅 운영 요일/반복
  규칙" 버튼을 블로그 큐레이션 버튼 바로 아래(같은 레벨)에 추가하고, 새
  모달을 그 버튼에 연결했다.

## 3) 특정 날짜 지정 모드 추가
"17일 20일 이런식으로 운영하는경우가 있어서"는 기존 요일 기반 규칙
(operating_weekdays/excluded_weekdays/operating_nth_weekdays) 어느
것으로도 표현할 수 없었다(전부 매주/매월 반복 전제). 새 컬럼
`events.operating_specific_dates text[]`(YYYY-MM-DD 배열)를 추가했다.
- `scripts/migrations/2026-09-22-events-operating-specific-dates.sql`
  (운영 DB 적용 완료, 사용자 승인).
- `src/lib/spaces/event-operating-schedule.ts`: `OperatingSchedule`에
  `operating_specific_dates` 추가. `isEventOperatingOn`이 이 값을 최우선으로
  검사 — 채워져 있으면 다른 요일 기반 규칙(excluded_weekdays 포함)을 전부
  무시하고 이 날짜 목록만 절대적으로 따른다("17일만 운영"인데 정기 휴무
  요일에 다시 걸려 막히는 혼란스러운 이중 부정을 피하기 위함).
- `src/components/admin/operating-schedule-editor.tsx`: "특정 날짜 지정"
  5번째 프리셋 추가 — 날짜 입력(`<input type="date">`, start_date~end_date로
  범위 제한) + "추가" 버튼으로 날짜를 하나씩 쌓고 개별 삭제 가능한 칩 UI.
  이 프리셋 선택 시 "정기 휴무일 지정" 섹션은 숨긴다(어차피 무시되므로
  혼란 방지). `detectOperatingPreset`도 저장된 `operating_specific_dates`가
  있으면 이 프리셋으로 복원하도록 갱신. `OperatingScheduleUpdatedHandler`
  콜백에 5번째 인자(`nextOperatingSpecificDates`)를 추가.
- `src/app/api/admin/events/operating-schedule/route.ts`: `operating_specific_dates`
  입력 검증(YYYY-MM-DD 형식 배열) 및 저장 추가.
- 새 컬럼을 사용하는 모든 조회 지점에 select 목록 추가: `EVENT_COLUMNS`
  (`src/lib/home/get-home-feed.ts`, 홈 피드/이벤트픽 전체 노출 판정에 쓰임 —
  `filterEventsOperatingToday`가 자동으로 새 필드를 반영), 어드민
  `EVENTS_COLUMNS`(`src/app/api/admin/data-grid/route.ts`), 유저 상세
  캘린더(`src/app/api/events/operating-calendar/route.ts`). `AdminEventRow`
  타입(`data-grid-client.tsx`)과 `database.types.ts`도 함께 갱신.

## 4) open_spaces "이벤트픽으로 이동" 기능 제거
"events쪽이랑 open_spaces쪽이랑 사실상 분리했으니깐"이라는 사용자 판단에
따라 2026-09-03에 추가했던 스팟픽→이벤트픽 수동 이관 기능을 버튼뿐 아니라
구현 전체를 제거했다(재사용하는 곳이 없어 죽은 코드로 남기지 않음).
- 삭제: `src/components/admin/migrate-to-event-modal.tsx`,
  `src/app/api/admin/data-grid/migrate-to-event/route.ts`.
- `src/components/admin/raw-data-modal.tsx`: "🚚 이벤트픽으로 이동" 버튼/
  안내 문구 블록, `MigrateToEventModal` import/렌더링, `isMigrateModalOpen`
  state, `onMigratedToEvent` prop을 모두 제거.
- `src/components/admin/data-grid-client.tsx`: `RawDataModal`에 전달하던
  `onMigratedToEvent` 콜백 제거.
- `EVENT_PICK_TARGET_AUDIENCES`(`get-home-feed.ts`)는 다른 곳(블로그
  큐레이션 등)에서 여전히 쓰이므로 export는 유지하고, 이관 기능을 언급하던
  주석만 정리했다.

## 검증
- `npx tsc --noEmit` / `npm run test`(199개 파일 2,295개 — 신규: 특정 날짜
  지정 유닛/컴포넌트 테스트, EventOperatingScheduleModal 통합 테스트, 기존
  operating-schedule-editor/event-blog-curation-modal 테스트 갱신) /
  `npm run build` 모두 통과.
- 실측(운영 DB): 마이그레이션 적용 후 `information_schema.columns`로
  `events.operating_specific_dates`(ARRAY 타입) 컬럼 생성 확인.

## 특이 사항
- "예외 날짜"(`event_operating_exceptions`, 단발성 휴무)와 이번에 추가한
  "특정 날짜 지정"(`operating_specific_dates`, 이 날짜만 운영)은 반대
  극성의 서로 다른 개념이라 별도 컬럼/UI로 유지했다 — 하나로 합치면 "이
  날짜에 쉬는지 여는지"를 값 하나로 표현해야 해서 오히려 헷갈린다.
