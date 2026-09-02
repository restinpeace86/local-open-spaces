# [개발요청] 맘스픽(Mom's Pick) 등급/게이미피케이션 & 커뮤니티 체계 구현

## 구현 일시
2026-09-02

## 배경
사용자가 전달한 맘스픽 기획 원문을 `spec/community/mom-pick-grades.md` Spec 초안으로
구조화하고, 채팅으로 확정 답변(채택 정의/VAPID 발급 주체/등급 산정 주기/리뷰·체크리스트
입력 형태/파워맘 선발 방식/강등 정책)을 받아 확정한 뒤 `project/decision-log.md`
**Decision 019**로 승인 기록을 남기고 "바로 구현해줘" 지시에 따라 구현했다.

## 구현 내용

### 1. DB 스키마 (`scripts/migrations/2026-09-02-mom-pick-*.sql`, 5개 파일)
- `profiles`에 `grade`(signed_up/sprout/active/excellent/power) + `grade_updated_at` +
  `ai_chat_free_uses_used` 컬럼 추가.
- 신규 테이블: `mom_pick_posts`(후기/체크리스트), `mom_pick_likes`(좋아요),
  `user_bookmarks`(찜), `push_subscriptions`(Web Push 구독).
- `mom_pick_posts.is_adopted`/`adopted_at`/`adopted_by`는 트리거(`protect_mom_pick_post_
  adoption_fields`)로 일반 사용자 세션이 절대 못 바꾸게 강제 — service_role(어드민 API)만
  갱신 가능.
- `mom_pick_likes` INSERT/DELETE 트리거로 `mom_pick_posts.like_count` 비정규화 컬럼 자동
  동기화.
- `promote_to_sprout_on_first_post` 트리거: 첫 글 작성 즉시 signed_up → sprout 승급(배치를
  기다리지 않음 — 새싹맘 조건은 평생 1회성 이벤트이기 때문).
- RPC 2종: `get_monthly_mom_pick_activity()`(등급 배치용 당월 집계), `count_new_nearby_
  items()`(푸시 배치용 반경 내 신규 스팟/행사 카운트).
- 전부 `profiles`(2026-09-02 도입)와 동일하게 `auth.uid()` 기반 RLS 적용.

### 2. 등급 로직 (`src/lib/community/grades.ts` + `scripts/ingest/lib/mom-pick-grade-calc.mjs`)
- `calculateGrade()`: 달력월 기준, 즉시 강등(유예 없음). TS/mjs 두 벌 구현(이 프로젝트의
  배치 스크립트는 `@/` 별칭으로 src/ TS 코드를 가져올 수 없어 기존 관례대로 독립
  구현 — 양쪽 다 단위 테스트로 회귀를 잡는다).
- 등급별 권한 게이트 함수(`canAccessCommunityFeed`/`canBookmark`/`canSeeLikeReactions`/
  `canReceivePushNotifications`/`hasFeedPriorityBadge`/`hasSpotlightBadge`) — Spec 1절
  표 그대로.

### 3. AI 챗봇 1회 제한 (`src/app/api/ai-chat/search/route.ts`, `ai-chat-sheet.tsx`)
- 로그인했지만 signed_up(새싹맘 미달성) 사용자는 `profiles.ai_chat_free_uses_used`로
  서버에서 확정적으로 1회만 허용.
- 비로그인 사용자는 서버가 식별할 수 없어 `localStorage`(`src/lib/ai-chat/free-trial.ts`)로
  소프트 제한(기기 변경으로 우회 가능함을 인지한 의도적 설계).
- 한도 도달 시 챗봇이 로그인/후기 작성 유도 CTA를 보여준다.

### 4. 커뮤니티 화면 (`src/components/community/`, `src/app/mom-pick/page.tsx`)
- `PostComposer`: 마이크로 리뷰(별점 1~5 + 선택적 한줄) / 체크리스트(공통 5항목) 작성.
- `MomPickFeed`: 커뮤니티 피드 — 좋아요 버튼/카운트는 열심맘(active) 이상에게만 노출.
- `MomPickView`: 로그인 게이팅(비로그인 → 로그인 유도, signed_up → 글쓰기만 가능하고
  피드는 잠금, sprout 이상 → 피드 열람).
- Decision 010이 하단 5대 탭을 고정했고 맘스픽을 6번째 탭으로 추가하는 별도 승인이 없어
  (추측 금지), 새 탭을 만들지 않고 "마이" 페이지에서 링크로 진입하는 독립 라우트로 뒀다.

### 5. 찜(북마크) (`src/components/favorites/`, `src/lib/community/bookmarks.ts`)
- Decision 003이 비노출로 지정했던 `/favorites` 탭(`NEXT_PUBLIC_ENABLE_USER_BOOKMARK`)의
  실제 데이터/화면을 이번에 구현하며 플래그를 켰다.
- 열심맘(active) 미만은 탭 진입은 가능하되 화면 내부에서 안내 문구로 막는다.
- 상세 모달(`detail-modal.tsx`)에 자기완결적 `BookmarkButton` 추가 — 등급 미달/비로그인
  시 조용히 렌더링하지 않는다.

### 6. 어드민 "채택" 관리 (`src/components/admin/mom-pick-posts-panel.tsx`,
   `src/app/api/admin/mom-pick-posts/route.ts`)
- 기존 `spot-curations-panel`/`curated-items-panel`과 동일한 자기완결적 탭 패턴으로
  `/admin/data-grid`에 추가.
- "채택하기" 토글은 service_role(`createAdminClient`)로만 동작해 DB 트리거의 보호를
  우회할 수 있는 유일한 경로.

### 7. 등급 산정 배치 (`scripts/ingest/mom-pick-grade-batch.mjs`,
   `.github/workflows/mom-pick-grade-batch.yml`)
- 매일 KST 04:23 실행(기존 daily/monthly/weather 배치와 겹치지 않게 분산).
- sprout 이상 프로필만 대상으로 당월 실적을 재계산 — signed_up은 트리거가 이미 처리.
- 파워맘은 우수맘 조건(당월 5건 이상) 충족자 중 채택 수 상위 N명(기본 10명,
  `MOM_PICK_POWER_MOM_QUOTA` 환경변수로 조정 가능한 정원제).

### 8. Web Push 알림 인프라 (`public/sw.js`, `src/lib/push/subscribe.ts`,
   `src/components/push/push-notification-toggle.tsx`,
   `scripts/ingest/mom-pick-push-send-batch.mjs`,
   `.github/workflows/mom-pick-push-send-batch.yml`)
- 기존 `spec/notification/notification-settings.md`의 알림은 로컬스토리지 기반 인앱
  벨(앱을 열어야 갱신)이라 "앱을 안 열어도 오는 푸시" 요구사항을 충족 못 해 — 브라우저
  Web Push API로 별도 인프라를 새로 구축했다.
- VAPID 키는 `web-push` 패키지로 구현 중 직접 생성해 `.env.local`에 등록(Vercel/GitHub
  Actions 시크릿에도 동일하게 수동 등록 필요 — 아래 특이 사항 참고).
- 구독 시점에 기존 `use-user-location.ts`(로컬스토리지 기반 사용자 위치)를 스냅샷해
  `push_subscriptions.lat/lng`에 저장(실시간 위치 추적 아님, 1회성 스냅샷).
- 발송 배치: 매일 KST 07:30(등급 배치 이후), 우수맘 이상 구독자의 저장된 위치 반경
  10km(기존 알림 설정 기본값과 동일) 내에 최근 24시간 신규 스팟/행사가 있으면 발송.
  410/404 응답(구독 만료)은 표준 관례대로 정리한다.
- **비목표 한계 정직하게 기록**: "아이 연령/선호 성향" 조건은 기존
  `generate-notifications.ts`도 동일한 이유(신뢰할 수 있는 연령 태그 데이터 부재)로
  구현하지 못한 상태라, 이 배치도 "거주 지역(위치)"만 확정 반영하고 연령/성향 매칭은
  추측으로 지어내지 않았다.

## 명시적 비목표 (Decision 019 그대로)
- 커피 쿠폰(기프티콘) 실물 리워드 자동 발급/지급 — 사용자가 직접 수동 지급.
- 네이버 블로그 검색 API 연동("블로그 아웃링크 프리뷰") — 추후 별도 Spec.
- 어드민 등급/신고/제재 관리 UI(콘텐츠 모더레이션) — 이번 범위 밖.

## 검증
### 코드 검증
`npx tsc --noEmit`/`npm run test`(94파일 933건 — 신규 12건 포함)/`npm run build` 5개
커밋 단위 모두 통과(마지막 커밋 기준 라우트: `/mom-pick`, `/favorites`,
`/api/admin/mom-pick-posts` 정상 빌드).

### 실측 검증
- 라이브 Supabase 프로젝트에 8개 마이그레이션 순차 적용, `pg_class`/`pg_policies`/
  `pg_trigger`로 RLS/트리거 존재 직접 확인.
- `database.types.ts` 재생성 후 diff로 의도한 스키마 변경만 반영됐는지 확인(매 마이그레이션마다).
- `scripts/ingest/mom-pick-grade-batch.mjs`/`mom-pick-push-send-batch.mjs` 둘 다 라이브
  DB에 대해 실제로 실행해 에러 없이 완료됨을 확인(현재 데이터가 없어 0건 처리 — 로직
  자체의 쿼리 문법/FK 관계 오류를 이 실행으로 잡아냈다: `push_subscriptions`↔`profiles`가
  형제 FK라 PostgREST 임베디드 조회가 안 되는 문제를 실측으로 발견해 2단계 조회로 수정).
- dev 서버 기동 후 `/mom-pick`, `/favorites`, `/my`, `/admin/data-grid` 전부 200 확인,
  어드민 화면에 "맘스픽 채택 관리" 탭 라벨이 실제로 렌더링됨을 curl로 확인.
- 기존 화면 회귀 없음 확인: `useUser()` 훅을 새로 쓰게 된 `AiChatSheet`/`BookmarkButton`
  때문에 기존 `detail-modal.test.tsx`/`home-view.test.tsx`/`map-explorer.test.tsx`가
  일제히 실패하는 것을 발견해(supabase 클라이언트 미모킹) 세 파일에 `@/lib/supabase/
  client` 목을 추가해 해결.

## 특이 사항 (수동 후속 조치 — 전부 완료 확인됨, 2026-09-02)
- **환경변수 등록** 전부 완료:
  - Vercel 프로덕션: ~~`NEXT_PUBLIC_ENABLE_USER_BOOKMARK=true`~~,
    ~~`NEXT_PUBLIC_VAPID_PUBLIC_KEY`~~, ~~`VAPID_PRIVATE_KEY`~~ — 사용자가 3개 전부
    직접 등록 완료 확인.
  - GitHub Actions 시크릿: ~~`NEXT_PUBLIC_VAPID_PUBLIC_KEY`~~, ~~`VAPID_PRIVATE_KEY`~~ —
    사용자가 등록 완료 확인 요청 → GitHub API(`GET /repos/.../actions/secrets`)로 직접
    조회해 두 시크릿이 실제로 존재함을(값이 아니라 존재 여부만 확인 가능한 API) 실측
    확인했다(생성 시각 2026-09-02T12:02 UTC). 이제 `mom-pick-push-send-batch.yml`(매일
    KST 07:30 발송 배치)이 정상 동작한다. `MOM_PICK_POWER_MOM_QUOTA`(선택, 미등록 시
    기본 10명)는 필수는 아니라 등록하지 않아도 무방하다.
- 브랜드 앱 아이콘 자산이 아직 없어 `public/sw.js`의 푸시 알림에 icon/badge를 지정하지
  않았다(브라우저 기본 아이콘 사용) — 아이콘 자산이 준비되면 추가 권장.
- 실제 브라우저 알림 권한 요청 → 구독 → 실제 푸시 수신까지의 end-to-end는 HTTPS
  환경(localhost 또는 배포)에서 실제 사용자 상호작용이 필요해 이번 자동화 검증 범위
  밖이다 — 코드/DB 스키마/발송 로직은 라이브로 검증했으나, 실제 첫 구독 1건은 배포 후
  사람이 한 번 시도해보길 권장한다.
