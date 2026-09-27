# open_spaces 정기휴무 — 기존 38건 자동 채우기 + 스팟픽 소비자 화면(지도/리스트) 표시

## 구현 대상
사용자 지시(2026-09-27): "이거 아까 38건인가 있다고 했지? 이거 이미 있는건
자동으로 채워넣을수 있나? 그리고 이거 스팟픽에서 보여줄때.. 정기휴무일은
마커도.. 회색으로 칠해주고.. 예를들어 노출중분류 어린이 도서관 눌렀을때...
오늘이 정기휴무하는 일자면 회색으로 띄우고.. 나중에 마커눌렀을때도 오늘은
정기휴무입니다 띄워주고.. 아래 모달팝업에 리스트 나올때도 오늘 휴무인 항목은
좀 연한 회색으로 리스트 색칠하던가해서 사용자가 직관적으로 알수 있도록.."

## 1) 기존 38건 자동 채우기(텍스트 파싱)
`scripts/migrations/2026-09-27-backfill-childrens-library-excluded-weekdays.mjs`
(신규, 1회성): 백필된 `operating_hours`의 "휴관일 {텍스트}" 부분을 파싱해
`excluded_weekdays`/`excluded_nth_weekdays`를 채운다.

**파싱 규칙(추측 금지 — 확실한 패턴만 인정)**:
- "매주 {요일}요일", "{요일}+", bare 한 글자 요일("토+일"), "주말"(토+일로 확장) → `excluded_weekdays`.
- "{요일}요일을 제외한"/"{요일}요일 제외" → 그 요일은 **제외**(정기휴무 아님, 반대 의미).
- "매월 {순번} 주 {요일}요일"(예: "둘째 주 월요일"), "매월 {순번}·{순번} {요일}요일"(예:
  "매월 둘째·넷째 월요일", 공백 없는 "매월두번째월요일"도 포함) → `excluded_nth_weekdays`
  (토큰 형식 "N-요일코드", events와 동일 유틸 재사용).
- "연중무휴" → 확정된 무휴(둘 다 null, 파싱 실패와 구분해서 집계).
- "...겹칠 경우 휴관"처럼 조건부 설명 안의 요일은 확정 휴무로 넣지 않음(실측: 서울특별시
  교육청 어린이도서관 "일요일과 공휴일이 겹칠 경우 휴관").
- 실제 38건 문자열 전부를 고정 표본 테스트로 검증(10개 대표 패턴 테스트 + 실제 DB
  드라이런으로 38건 전수 확인) — 0건 파싱 실패, 전부 성공.
- 실제 DB 반영 완료(38/38 성공, 예: 판교어린이도서관 시청각실/미디어창작소는 원본에
  "토+일+공휴일+휴관일(매주 월요일)"이 중첩돼 있어 MON+SAT+SUN 세 요일 모두 인식).

## 2) DB — RPC에 신규 컬럼 반영
`scripts/migrations/2026-09-27-nearby-rpc-add-excluded-weekdays.sql`(적용 완료):
소비자 화면이 읽는 두 RPC(`get_nearby_spaces_and_events` 5-arg,
`get_spots_by_service_category`)의 `RETURNS TABLE`/select 목록에
`excluded_weekdays`/`excluded_nth_weekdays`를 추가했다. 이 두 RPC는 TS
`.select()`가 아니라 SQL 함수 안에 컬럼 목록이 하드코딩돼 있어(`pg_get_functiondef`로
실제 배포된 정의 직접 확인) CREATE OR REPLACE만으로는 반환 타입을 못 바꿔서
(Postgres 42P13) DROP 후 재생성했다. EVENT 쪽(UNION ALL) 브랜치는
`null::text[]`로 맞췄다(이 개념이 events에는 별도 필드로 이미 있음).
`get_spot_group_members`(다른 옵션 더보기)와 3-arg 구버전 오버로드는 사용 빈도가
낮아 이번 범위에서 제외했다(알려진 한계로 기록).

## 3) 공용 판정 함수
`src/lib/spaces/open-space-closure.ts`(신규): `isOpenSpaceClosedOn(excludedWeekdays,
excludedNthWeekdays, date)`. events의 `isEventOperatingOn`과 토큰 형식은
재사용하지만, 반대 극성(events의 `operating_nth_weekdays`="이 날에만 연다" vs
open_spaces의 `excluded_nth_weekdays`="이 날에 추가로 닫는다")이라 그 함수를
직접 호출하지 않고 별도로 뒀다.

## 4) 소비자 화면 3곳
- **마커 회색 표시**: `src/components/map/kakao-map-view.tsx` — 오늘 휴무인 SPACE는
  카테고리 색 대신 밝은 회색(#d1d5db, "기타" 카테고리 기본 회색 #6b7280과 구분)으로
  칠한다. EVENT는 RPC가 excluded_weekdays를 항상 null로 줘서 자연히 영향 없음
  (item_type 분기 불필요).
- **마커 클릭 안내**: `src/components/map/marker-preview-card.tsx`(첫 탭 프리뷰),
  `src/components/map/detail-modal.tsx`(상세 — **주의**: 이 파일은 `isEvent`
  여부로 완전히 다른 두 JSX 분기를 타는 구조라, 처음에 EVENT 전용 분기에 잘못
  추가했다가 SPACE에서 전혀 안 보이는 걸 실제 렌더링 확인 중 발견해 SPACE 분기
  (990번째 줄 근방, `item.is_free` 뱃지 옆)로 옮겼다) 둘 다에 "오늘은 정기휴무입니다"
  회색 뱃지 추가.
- **리스트 회색 표시**: `src/components/map/item-list-panel.tsx` — 오늘 휴무인
  행은 배경을 연한 회색(`bg-gray-100`)으로, 이름 텍스트를 `text-gray-400`으로
  옅게 하고, "오늘 휴무" 칩을 뱃지 줄 맨 앞에 추가한다.
- `src/lib/spaces/get-nearby.ts`의 `NearbyItem` 타입에 두 필드 추가(다른 optional
  필드와 동일한 "이 RPC 경로만 채움" 문서화 관례).

## 검증
- `scripts/migrations/2026-09-27-backfill-childrens-library-excluded-weekdays.test.mjs`
  (10개): 실제 38건에서 뽑은 대표 패턴 전부.
- `src/lib/spaces/open-space-closure.test.ts`(6개): 요일/N번째요일/둘다없음/둘다있음.
- `src/components/map/item-list-panel.test.tsx`(신규 3개), `marker-preview-card.test.tsx`
  (신규 2개), `detail-modal.test.tsx`(신규 3개, EVENT는 뱃지 안 보임 케이스 포함).
- `npx tsc --noEmit` / `npm run test`(213개 파일 2,462개) / `npm run build` 모두 통과.
- `node scripts/gen-types.mjs`로 스키마+RPC 변경 후 타입 재생성 완료.
- 실제 DB: 38건 백필 완료, RPC로 직접 재조회해 두 신규 컬럼이 정상 반환되는지 확인.

## 특이 사항
- `kakao-map-view.tsx`/`marker-preview-card.tsx`/`item-list-panel.tsx`는 이
  코드베이스 관례상(Kakao SDK 의존/이미 유사 컴포넌트가 테스트 있음) 각각 테스트
  유무가 다르다 — kakao-map-view.tsx는 원래도 테스트 파일이 없어(SDK 딥 통합) 이번에도
  추가하지 않았다.
- `get_spot_group_members`/3-arg 레거시 오버로드는 이번에 안 건드렸다 — "다른 옵션
  더보기"로 펼친 그룹 멤버 목록에는 아직 회색 표시가 적용되지 않는다(알려진 gap).
- 나머지 118건(cultural_facility_summary/tourapi_4.0/localdata_playground)은
  원본 자체에 휴관일 텍스트가 없어 이번 자동 채우기 대상이 아니다(이전 실측 확인).
