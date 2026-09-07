# 맘스픽 실시간 피드 events.name 버그 수정 + 스팟픽 주변 조회 타임아웃 조사

## 구현 대상
사용자 지시: "맘스픽 제대로 된거 맞아? 지금 실시간 피드 조회 실패: column
events_1.name does not exist 이 에러나는데? 스팟픽도 처음 들어가면 주변
공간/행사 조회 실패: canceling statement due to statement timeout 이거
에러나 ..."

## 구현 일시
2026-09-07

## 1. 맘스픽 실시간 피드 — events.name 버그 (확정, 수정 완료)

### 원인
`events` 테이블에는 `name` 컬럼이 없고 `title` 컬럼만 있다(실측 확인,
information_schema 직접 조회). 그런데 다음 3개 파일이 처음 작성될 때부터
PostgREST 임베디드 조회에 `events(name)`을 쓰고 있었다:
- `src/lib/community/mom-pick-dashboard.ts`(`POST_COLUMNS`, `실시간 피드`/
  `인기글`/`파워맘 추천` 3개 섹션이 공유)
- `src/lib/community/posts.ts`(`POST_SELECT`, 게시글 CRUD 전체가 공유)
- `src/components/my/my-reviews-section.tsx`(`spotOrEventName`)

`mom_pick_posts.event_id`가 `events.id`를 가리키는 FK라 PostgREST가 자동으로
`events` 테이블을 임베드하는데, 없는 컬럼(`name`)을 요청해 "column
events_1.name does not exist"(PostgREST가 여러 관계를 처리할 때 붙이는
별칭)로 실패했다. **survey_review 타입 게시글이 실제로 이벤트(open_spaces가
아니라 events)를 가리키는 경우에만** 이 코드 경로가 실행되는데, 지금까지는
그런 게시글이 실제로 없었거나 우연히 생기지 않아 드러나지 않았던 잠재
버그였다 — 이번 세션의 admin/카테고리 작업과는 무관한, 원래부터 있던 버그다
(같은 파일의 `open_spaces(name)`는 정상 — open_spaces는 실제로 `name`
컬럼을 갖고 있음). 실제로 `src/components/favorites/favorites-view.tsx`는
이미 올바르게 `events?.title`을 쓰고 있어, 이 3개 파일만 예외적으로 잘못돼
있었다.

### 변경 사항
- `mom-pick-dashboard.ts`: `POST_COLUMNS`의 `events(name)` → `events(title)`,
  `RawPostRow.events` 타입 `{ name }` → `{ title }`, `spotName` 계산식의
  `row.events?.name` → `row.events?.title`.
- `posts.ts`: `POST_SELECT`의 `events(name)` → `events(title)`,
  `MomPickPost.events` 타입도 동일하게 수정.
- `my-reviews-section.tsx`: `spotOrEventName`의 `post.events?.name` →
  `post.events?.title`.

### 검증
- `src/components/my/my-reviews-section.test.tsx`에 신규 1건 —
  `open_spaces`가 아니라 `events`를 가리키는 게시글도 `events.title`을
  이름으로 정상 표시하는지 확인(기존 테스트는 `events: null`만 쓰고 있어
  이 코드 경로 자체를 검증한 적이 없었다 — 프로덕션과 동일한 커버리지
  공백이었다).
- `npx tsc --noEmit` / `npm run test`(115개 파일, 1287개 테스트) /
  `npm run build` 전체 통과.

## 2. 스팟픽(/nearby) 주변 조회 타임아웃 — 조사 결과(수정 보류)

### 실측 조사
`get_nearby_spaces_and_events` RPC를 실제 프로덕션 DB에 서울시청 좌표
(126.9780, 37.5665)·반경 5km(스팟픽 기본값)로 직접 재현했다:
- 카테고리 필터 없는(map-explorer.tsx가 실제로 쓰는) 기본 KNN 경로:
  **1.3~1.4초**. 8초 타임아웃 자체를 넘기진 않지만 여유가 크지 않다.
- 이 값을 줄이려고 "반경(st_dwithin) 먼저 필터 후 정렬"(2026-09-03에
  카테고리 필터 경로에서 실제로 효과가 있었던 방식)로 바꿔 실측했더니
  **오히려 4.5초로 더 느려졌다** — 서울시청처럼 밀집된 지역은 반경 5km
  안에 이미 1,001건보다 훨씬 많은 스팟이 있어, "반경으로 먼저 좁힌 뒤
  전체 정렬"이 "가까운 순서대로 1,001개 찾고 그중 반경 안만 거르기"보다
  더 비싸진다 — 그래서 **이 변경은 적용하지 않았다**(추측성 수정으로
  성능을 오히려 악화시킬 뻔한 것을 실측으로 미리 확인).

### 결론 — 이번엔 수정하지 않고 조사 결과만 기록
- map-explorer.tsx는 카테고리 필터를 아예 안 쓰므로(`itemType`만 넘김),
  오늘 세션에서 진행한 category_min 대규모 재분류 작업과는 무관하다 —
  회귀가 아니라 원래부터 있던 밀집 지역 특성으로 보인다.
- 1.3~1.4초 자체는 타임아웃 문턱을 넘지 않아, 실제 프로덕션에서 관측된
  타임아웃은 콜드 캐시(디스크 읽기)·동시 부하·또는 서울시청보다 더 밀집된
  다른 좌표 등 이번 조사로 재현한 것보다 더 나쁜 조건에서 발생했을 가능성이
  있다 — 정확한 재현 조건(예: 실패 당시의 좌표, 서버 로그)이 있으면 더
  정밀하게 진단할 수 있다.
- 시도해본 "명백해 보이는" 수정이 실측상 역효과였던 것을 확인했으므로,
  근거 없는 추측성 수정을 적용하지 않았다(제3장 제5조 추측 금지) —
  구체적인 재현 정보를 받거나 별도로 더 깊이 파볼 시간을 투자해 확실한
  근거가 생기면 그때 수정한다.
