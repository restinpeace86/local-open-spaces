# 찜/알람 메커니즘을 이마트 문화센터 클래스까지 확장

## 구현 대상
사용자 지시(2026-10-03): "별도 테이블로 데이터는 따로 관리하고.. 문화센터는..
그리고 찜/알람은 같은 기능이니깐 두 테이블 데이터 전부 참조할수있도록 확장" —
`emart_culture_club_classes`는 독립 테이블로 그대로 두고, `user_bookmarks`
(찜)와 예약-알람 배치만 세 번째 데이터 소스를 참조하도록 확장했다. 설계
방향은 직전 대화에서 내가 제안("테이블은 분리 유지 + 찜 매커니즘만 공유")
했고 사용자가 동의, 이번에 구현했다.

## 변경 사항
### 1. DB — `scripts/migrations/2026-10-03-user-bookmarks-emart-class.sql`
- `user_bookmarks.emart_class_id text references emart_culture_club_classes
  (class_id)` 추가(spot_id/event_id와 동일한 nullable FK 패턴 — class_id를
  참조한 이유: 이 테이블의 다른 모든 참조·upsert가 전부 class_id를 안정적
  자연키로 쓰고 있어 동일하게 맞춤).
- `user_bookmarks_exactly_one_target` CHECK를 2-way OR에서 `num_nonnulls
  (spot_id, event_id, emart_class_id) = 1`(3-way)로 교체.
- `uniq_user_bookmarks_emart_class(user_id, emart_class_id)` partial unique
  인덱스 추가(spot/event와 동일한 중복 찜 방지 패턴).
- `emart_culture_club_classes.reservation_open_reminder_sent_at` 추가
  (events와 동일한 중복 발송 방지 컬럼 — register_start_at과 비교해 "이미
  이 회차를 처리했는지" 판단).
- 적용 완료, `node scripts/gen-types.mjs`로 타입 재생성(동시에 이전에
  누락됐던 `register_start_at` 타입도 함께 갱신됨).

### 2. `src/lib/community/bookmarks.ts`
- `BookmarkTarget`에 `{ kind: 'emart_class'; emartClassId: string }` 추가.
- `addBookmark`: 20개 캡 체크를 `event_id is not null OR emart_class_id is
  not null`(합산 카운트, PostgREST `.or('event_id.not.is.null,emart_class_id.
  not.is.null')`)로 확장 — "찜/알람은 같은 기능"이므로 이벤트 찜과 문화센터
  클래스 찜이 같은 20개 슬롯을 나눠 쓴다.
- `removeBookmark`: emart_class 분기 추가.
- `listMyBookmarks()`: select에 `emart_class_id`, 임베디드
  `emart_culture_club_classes(class_id, class_title, store_name)` 추가,
  `MyBookmark` 타입 갱신.
- `getMyBookmarkedIds()`: `emartClassIds` 추가 반환.

### 3. `src/components/community/bookmark-button.tsx`
- 3-way 판별 로직을 `isBookmarkedFor()` 헬퍼로 정리(기존 2항 삼항식이
  3항이 되면서 가독성이 떨어져 분리).

### 4. `src/components/favorites/favorites-view.tsx`(마이페이지)
- 탭 2개(스팟/이벤트) → 3개(스팟/이벤트/문화센터). `BookmarkCard`가
  `emart_culture_club_classes.class_title`/`store_name`도 표시 대상에
  추가. 삭제 시 `emart_class` 타입으로 `removeBookmark` 호출.

### 5. `src/components/home/culture-club-tab-view.tsx`
- 카드의 비활성 하트 아이콘(🤍, 레이아웃만)을 실제
  `<BookmarkButton target={{kind:'emart_class', emartClassId: item.class_id}} />`
  로 교체 — 이제 실제로 찜/해제가 동작한다.

### 6. `scripts/ingest/event-reservation-reminder-push-batch.mjs`
- `events` 전용 로직을 `processSource()` 공용 헬퍼로 리팩터링(대상 조회
  → 찜한 유저 조회 → 우수맘 이상 등급 필터 → 구독 조회 → 발송 → 발송완료
  표시, 테이블/컬럼명만 파라미터화)하고, `emart_culture_club_classes`
  (`register_start_at` 기준)를 두 번째 소스로 추가해 `run()`이 두 소스를
  순서대로 처리 후 합산 로그를 남긴다.

## 검증
- `src/lib/community/bookmarks.test.ts`(3개 추가 — 문화센터 클래스 찜 캡
  체크, 열심맘 패스스루, event_id/emart_class_id 합산 카운트 확인), 기존
  캡 테스트 mock도 `.not()` → `.or()`로 수정.
- `src/components/favorites/favorites-view.test.tsx`(2개 추가 — 문화센터
  탭 필터링/표시, 삭제 시 올바른 target kind).
- `src/components/home/culture-club-tab-view.test.tsx`: `BookmarkButton`이
  실제 `useUser()`를 쓰게 되면서 Supabase 클라이언트 생성 크래시가 났던 것을
  `@/hooks/use-user` 모킹 추가로 수정.
- `npx tsc --noEmit` / `npm run test`(263개 파일 2,742개) / `npm run build`
  전부 통과.
- **실측 — 프로덕션 스키마 직접 검증**: 테스트 유저로 `emart_class_id`만
  채운 실제 insert 성공, `emart_class_id`+`spot_id` 동시 채움 시 CHECK
  제약이 실제로 거부하는지 확인, `listMyBookmarks()`와 동일한 임베디드
  select 쿼리로 실제 강좌 제목/지점명이 정확히 돌아오는지 확인, 테스트
  행 정리(cleanup) 완료.
- **실측 — 배치 스크립트 실제 실행**: `node scripts/ingest/event-
  reservation-reminder-push-batch.mjs`를 프로덕션 대상으로 직접 실행,
  두 소스(이벤트/문화센터 클래스) 모두 에러 없이 완료(현재 두 소스 다
  5~15분 창 안에 대상 0건 — 실측으로 `register_start_at` 분포를 확인해보니
  현재 수집된 데이터가 전부 이미 접수 시작된 상태라 당연한 결과, 쿼리
  자체는 기존 events 경로와 동일한 구조로 정상 동작 확인).

## 특이 사항
- 문화센터 탭(스팟픽 쪽 drill-down)에서도 향후 같은 `BookmarkButton`을
  재사용할 수 있다 — 이번 변경으로 어느 화면에서 노출하든 동일한 target
  kind(`emart_class`)로 찜할 수 있다.
- 알람 발송 메시지 바디는 이벤트/문화센터 클래스 모두 동일한 포맷
  (`"{title}" 예약이 곧 열려요!`)을 쓴다 — 문화센터 전용 문구(지점명 포함
  등)가 필요하면 추후 별도 지시로 조정.
