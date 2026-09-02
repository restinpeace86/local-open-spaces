# Spec(승인됨): 맘스픽(Mom's Pick) 등급/게이미피케이션 & 커뮤니티

> **상태: 승인됨 — Decision 019(2026-09-02).** 이 문서는 사용자가 채팅으로 전달한
> 기획 원문을 구조화하고, 2026-09-02 사용자 답변으로 모든 쟁점(채택 정의/VAPID
> 발급 주체/등급 산정 주기/리뷰·체크리스트 입력 형태/파워맘 선발 방식/강등 정책)을
> 확정한 뒤 `project/decision-log.md`의 Decision 019로 승인 기록을 남긴 버전이다.
> 이 버전을 기준으로 구현을 진행한다.

## 0. 확정된 범위 (사용자 지시 원문)
- **포함(MVP)**: 5단계 등급 체계 전체, 등급별 권한 게이팅, 찜(북마크), 좋아요/채택
  카운트, **푸시 알림**(우수맘 이상).
- **제외(이번 범위 밖)**:
  - 커피 쿠폰(기프티콘) 실물 리워드 — "직접 줄 것"이므로 자동 발급/연동 로직 없음.
    파워맘 달성 시 관리자에게 알 수 있는 표시만 남기면 충분(자동 지급 API 불필요).
  - 네이버 블로그 검색 API 기반 "블로그 아웃링크 프리뷰" — 추후 별도 Spec.

## 1. 등급 체계 및 권한 매트릭스

| 등급 | 달성 조건 | 부여 권한 |
| :--- | :--- | :--- |
| 비로그인(Visitor) | 앱 접속 시 기본 상태 | 스팟픽/이벤트픽 지도·리스트 탐색, AI 챗봇 **1회** 체험 |
| 🌱 새싹맘 | 소셜 로그인 + 첫 스팟 방문 후기(마이크로 리뷰) 또는 체크리스트 1회 작성 | 맘스픽 커뮤니티 피드 열람, AI 챗봇 **무제한** |
| 🌿 열심맘 | 월 2회 이상 후기/글쓰기 | 찜(북마크) 기능, 내 리뷰에 대한 좋아요 반응 확인 |
| 🌳 우수맘 | 월 5회 이상 후기/글쓰기 (또는 채택·좋아요 누적 기여도) | 맞춤형 조건(연령/성향/지역) 기반 **일일 푸시 알림**, 피드 상단 우선 노출 + 뱃지 |
| ✨ 파워맘 | 우수맘 중 월간 채택 수 상위 N명(정원제, 기본 10명 — 3-6 참고) | 메인/주간 베스트 스포트라이트 카드 노출, 레전드 뱃지. **리워드(커피 쿠폰)는 수동 지급 — 시스템 범위 밖** |

## 2. 데이터 모델 (신규 테이블 제안)

기존에 커뮤니티/리뷰/찜 관련 테이블이 전혀 없어(이 프로젝트는 지금까지 공간·행사
카탈로그 + 방금 도입한 인증만 있었음) 아래를 신규로 제안한다. `profiles`(2026-09-02
도입)와 마찬가지로 전부 `auth.uid()` 기반 RLS를 적용한다.

### 2.1 `public.mom_pick_posts` (후기/체크리스트 — "글쓰기 활동"의 실체)
- `id uuid pk`, `author_id uuid references auth.users(id)`,
  `spot_id uuid references open_spaces(id) null` (연결된 스팟, 체크리스트만 쓰고
  특정 스팟과 무관할 수도 있어 nullable),
  `post_type text check (post_type in ('micro_review','checklist'))`,
  `content text`, `like_count int default 0`,
  `is_adopted boolean default false`, `adopted_at timestamptz null`,
  `adopted_by uuid references auth.users(id) null` (**확정**: "채택"은 좋아요 수와
  무관한 별도 개념 — 어드민이 우수 후기를 수동으로 "채택" 지정하는 관리자 전용
  액션이다. 어드민 화면에 후기 목록 + "채택" 토글 버튼이 필요하다. 우수맘/파워맘
  산정 시 "채택 수"는 이 컬럼의 카운트를 쓴다),
  `created_at timestamptz default now()`.
- RLS: 누구나 SELECT(커뮤니티 피드는 로그인 사용자에게 공개, 단 API 라우트 레벨에서
  "새싹맘 이상"만 호출 가능하도록 게이팅 — RLS 자체는 "본인 작성 글만 수정/삭제"만
  강제), INSERT/UPDATE/DELETE는 `auth.uid() = author_id`만. `is_adopted`/
  `adopted_at`/`adopted_by` 갱신은 일반 사용자 정책에서 제외하고 서비스 역할(어드민
  API 라우트)에서만 갱신한다(기존 어드민 화면들과 동일한 "서비스 역할 전용 쓰기"
  패턴 — 제5장 제4조 기존 구조 우선).

### 2.2 `public.mom_pick_likes` (좋아요 — 우수맘/파워맘 산정 근거)
- `post_id uuid references mom_pick_posts(id)`, `user_id uuid references
  auth.users(id)`, `created_at timestamptz`. PK(post_id, user_id) — 중복 좋아요 방지.
- 트리거 또는 정기 배치로 `mom_pick_posts.like_count` 갱신(둘 중 어느 쪽인지는
  구현 시 기존 관례(`analyze`/배치 로그 패턴)에 맞춰 결정).

### 2.3 `public.user_bookmarks` (찜 — 열심맘 이상)
- `user_id uuid references auth.users(id)`, `spot_id uuid references
  open_spaces(id) null`, `event_id uuid references events(id) null`
  (스팟/이벤트 중 정확히 하나만 채워짐), `created_at timestamptz`.
- RLS: 본인 것만 CRUD(profiles와 동일 패턴).

### 2.4 등급 산정 — 테이블이 아니라 "계산값"으로 제안
`profiles`에 `grade` 컬럼을 두고 값을 캐싱하되, 실제 산정은 `mom_pick_posts`/
`mom_pick_likes`를 매일 배치(기존 `scripts/ingest/run-daily.mjs`류 오케스트레이터에
새 스텝 추가하는 방식 — 제5장 제4조 기존 구조 우선)로 집계해 갱신하는 것을 제안한다.
매 요청마다 실시간 집계하면 비용이 커지고, "월 2회/5회"라는 기준 자체가 실시간성을
요구하지 않기 때문이다.

**확정: 산정 주기는 달력월 기준(매월 1일 00시 리셋), 강등은 즉시 적용(당월 실적만
반영, 유예 없음)이다.** 즉 "이번 달 1일~오늘" 사이 `mom_pick_posts` 작성 건수로
열심맘(2건)/우수맘(5건) 조건을 매일 재계산하며, 월초 리셋 시점에는 조건을 다시
채울 때까지 새싹맘으로 즉시 내려간다(3-7 참고).

### 2.5 푸시 알림 인프라(우수맘 이상, MVP 포함)
기존 `spec/notification/notification-settings.md`의 알림은 **로컬스토리지 기반
인앱 벨 알림**(앱을 열어야 갱신)이라 "매일 아침/주말에 앱을 안 열어도 오는 푸시"
요구사항을 충족하지 못한다 — 이번 요구사항은 브라우저 Web Push API가 필요한
별개의 인프라다:
- `public.push_subscriptions`: `user_id`, `endpoint`, `p256dh`, `auth_key`,
  `created_at` — 브라우저의 `PushSubscription` 객체를 그대로 저장.
- 신규 서비스 워커(`public/sw.js`) + 클라이언트 구독 플로우(알림 권한 요청 →
  `pushManager.subscribe()` → 서버에 구독 정보 저장).
- 서버: VAPID 키 쌍 발급(`web-push` 패키지) 필요 — **확정**: 구현 단계에서 직접
  생성해 `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`로 `.env.local`에 등록하고, Vercel
  프로덕션에도 동일하게 수동 등록이 필요함을 구현 기록에 남긴다(외부 계정 가입이
  필요 없는 순수 키 생성이므로 코드 내에서 직접 처리 가능).
- 발송 스케줄: "매일 아침/주말" — 기존 배치 오케스트레이터(`run-daily.mjs`) 직후
  또는 별도 GitHub Actions 워크플로(기존 3시간 주기 날씨 배치와 동일한 패턴)로
  우수맘 이상 사용자의 저장된 필터와 신규 스팟/이벤트를 매칭해 발송.

## 3. 확정된 결정 (사용자 답변, 2026-09-02)

1. **"채택"의 정의**: 좋아요 수와 무관한 별도 개념. **관리자가 어드민 화면에서
   수동으로 "채택" 지정**한다(`mom_pick_posts.is_adopted`/`adopted_at`/
   `adopted_by`). 우수맘/파워맘 산정의 "채택 수"는 이 컬럼 기준.
2. **VAPID 키 발급**: 구현 단계에서 직접 생성해 환경변수로 등록한다(외부 계정
   가입 불필요, 순수 키 생성).
3. **등급 재산정 주기**: 달력월 기준(매월 1일 리셋). 월간 누적 작성 건수로 판단.
4. **마이크로 리뷰 입력 형태**: 별점(1~5) + 선택적 짧은 한줄 텍스트.
   `mom_pick_posts.content`에 한줄 텍스트를, 별점은 `rating smallint check
   (rating between 1 and 5)` 컬럼을 추가로 둔다(post_type = 'micro_review'일 때만
   사용, checklist에는 null).
5. **체크리스트 고정 항목**: 전 스팟 공통 4~5개 항목 — 주차 편의/수유실 유무/유아
   의자 유무/키즈메뉴 유무/기저귀교환대 유무. `mom_pick_posts.checklist_answers
   jsonb`에 `{ parking: boolean, nursing_room: boolean, kids_chair: boolean,
   kids_menu: boolean, diaper_table: boolean }` 형태로 저장한다(post_type =
   'checklist'일 때만 사용).
6. **파워맘 선발**: "상위 1%" 대신 **월간 정원제(기본 10명, 관리자 설정 가능)**.
   `profiles.grade`와 별개로, 매월 배치에서 우수맘 중 당월 채택 수 상위 N명을
   선정한다. N은 하드코딩하지 않고 관리 가능한 설정값(예: 기존 feature-flag류
   패턴 또는 간단한 설정 테이블/환경변수)으로 둔다(제5장 제6조 하드코딩 최소화).
7. **강등 정책**: 즉시 강등 — 당월 실적만 반영한다(유예 기간 없음). 매월 1일 배치
   시점에 지난달 실적이 아니라 "이번 달 누적 실적"으로 등급을 재계산하므로,
   월초에는 조건을 다시 채울 때까지 새싹맘(로그인 완료 이력은 유지)으로 표시된다.

## 4. 이번 초안이 다루지 않는 것(명시적 비목표)
- 커피 쿠폰(기프티콘) 자동 발급/지급 연동 — 수동 처리.
- 네이버 블로그 검색 API 연동("블로그 아웃링크 프리뷰") — 추후 별도 Spec.
- 어드민 화면에서의 등급/신고/제재 관리 UI(콘텐츠 모더레이션) — 이번 초안엔 없음,
  필요 시 별도 확인.
