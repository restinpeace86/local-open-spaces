# open_spaces 정기휴무 설정(정기 휴무 요일 + 매월 N번째 요일 휴무)

## 구현 대상
사용자 지시(2026-09-27): "이거 이벤트쪽에 있나 휴관일이나 정기휴무 설정하는거...
이거 open_spaces쪽에도 놓고.. 정기휴무 설정할수있게해야하는거 아니야 ? 정기휴관이나
정기휴무나" — 범위 확인 질문("events의 4개 필드 다 가져올지, 정기휴무 요일+매월
N번째 요일만 가져올지")에 대해 "정기휴무 요일 + 매월 N번째 요일만" 확정.

## 배경
events에는 이미 `operating_weekdays`/`excluded_weekdays`/`operating_nth_weekdays`/
`operating_specific_dates` 4개 필드 + `OperatingScheduleEditor`가 있다. open_spaces는
`operating_hours`(자유 텍스트) 하나뿐이라, 방금 백필한 도서관 휴관일 텍스트("매월
첫째, 셋째 월요일" 등)를 구조화된 형태로 다시 설정할 방법이 없었다. open_spaces는
상설 장소라 "요일 반복 운영"(operating_weekdays)/"특정 날짜"(operating_specific_dates,
이벤트성 단발 오픈)는 상대적으로 덜 쓰인다고 판단해 범위를 좁혔다.

## 변경 사항
### DB 스키마
`scripts/migrations/2026-09-27-open-spaces-excluded-weekdays.sql`(적용 완료):
`open_spaces`에 `excluded_weekdays text[]`, `excluded_nth_weekdays text[]` 추가.
**컬럼명 설계**: events의 `operating_nth_weekdays`는 "이 날에만 연다"(운영 패턴)
인데, open_spaces에서 필요한 건 반대 극성("이 날에 추가로 쉰다")이라 같은 이름에
반대 의미를 주면 혼란스러워 `excluded_nth_weekdays`로 분리했다. 토큰 형식
("N-요일코드", 예: "1-MON")은 `src/lib/spaces/event-operating-schedule.ts`의
`buildNthWeekdayToken`/`parseNthWeekdayToken`(범용 유틸, events 전용 로직 아님)을
그대로 재사용한다.

### API
`src/app/api/admin/open-spaces/operating-schedule/route.ts`(신규): 단일 id PATCH,
`events/operating-schedule/route.ts`와 동일한 검증 관례(요일 코드 배열/N-요일코드
토큰 배열 유효성 검사, 빈 배열→null 정규화).

### 관리자 UI
- `src/components/admin/open-space-excluded-days-editor.tsx`(신규):
  `OperatingScheduleEditor`에서 이번 범위에 필요한 두 섹션만 가져왔다 — "매주
  정기휴무 요일" 토글+요일 체크박스, "매월 특정 주차 요일 휴무" 토글+요일
  체크박스+주차(1~5) 체크박스. 두 규칙은 상호 배타적이지 않고 독립적으로 조합
  가능하다(예: 매주 월요일 휴무 + 매월 셋째 화요일도 추가 휴무).
- `src/components/admin/raw-data-modal.tsx`: open_spaces 탭에 `SpotDisplayNameEditor`
  바로 다음에 이 편집기를 인라인으로 노출(events처럼 별도 모달로 분리하지 않음 —
  open_spaces 상세 팝업은 아직 그렇게 붐비지 않아 인라인이 더 간단).
- `src/components/admin/data-grid-client.tsx`: `AdminOpenSpaceRow`에 두 필드 추가,
  `onExcludedDaysUpdated` 콜백으로 저장 성공 시 목록/상세 모달 즉시 갱신.
- `src/app/api/admin/data-grid/route.ts`의 `OPEN_SPACES_COLUMNS`에 두 컬럼 추가.

## 검증
- `src/app/api/admin/open-spaces/operating-schedule/route.test.ts`(신규 5개):
  정상 저장, 빈 배열→null 정규화, id 없음/요일 코드 오류/토큰 형식 오류 각각 400.
- `src/components/admin/open-space-excluded-days-editor.test.tsx`(신규 5개): 기본
  상태, 매주 규칙 저장, 매월 규칙 저장, 기존 값 복원(두 규칙 동시), 저장 실패 안내.
- `npx tsc --noEmit` / `npm run test`(211개 파일 2,438개) / `npm run build`
  모두 통과. `node scripts/gen-types.mjs`로 타입 재생성 완료.

## 특이 사항
- 이번 범위는 "관리자가 값을 설정할 수 있게"까지만이다 — 저장된 값을 실제로
  "오늘 이 스팟이 문을 열었는지" 판정에 반영하는 소비자 화면 로직(예:
  `isEventOperatingOn`과 동일한 open_spaces 버전)은 이번에 만들지 않았다. 필요하면
  별도로 요청해야 한다.
