# [개발요청] 맘스픽(Mom's Pick) 메인 화면 기획 구현

## 구현 일시
2026-09-02

## 배경
Decision 019로 구현했던 `/mom-pick`의 기존 화면(최신순 전체 나열 피드)을, "철저히 검증된
3가지 핵심 영역(Preview + 전체보기 구조)"으로 재구성하는 사용자 상세 기획 요구사항.

## 구현 내용

### 상단 개인화 배너
- "유저의 프로필 데이터(region, birth_years)를 반영한 맞춤형 환영 문구"를 요구했으나
  `profiles`에는 region 컬럼이 없다 — 이 앱이 이미 `useUserLocation()`(LocalStorage
  기반, sigungu_name 포함)을 "현재 활동 지역"의 단일 출처로 스팟픽/AI 챗봇 지역 선택에
  써왔으므로, 별도 `profiles.region` 컬럼을 새로 만들어 이중 관리하지 않고 그 값을
  재사용했다(`personalized-banner.tsx`, 제5장 제4조 기존 구조 우선). birth_years →
  나이 환산은 AI 챗봇 초개인화 작업에서 이미 검증한 `personalization.ts`를 그대로
  재사용.

### 섹션 ①/②/③ (파워맘·우수맘 추천 / 인기·우수글 / 실시간 라이브)
- `src/lib/community/mom-pick-dashboard.ts`: 3개 섹션 전용 서버 전용 쿼리 함수
  (`getExpertPosts`/`getTrendingPosts`/`getLivePosts`), 각각 `LIMIT`+`page` 지원.
- **실측으로 발견한 아키텍처 문제**: 3개 섹션 전부 "다른 사용자의" 닉네임/등급 배지
  표시가 필수인데, `profiles` RLS(Decision 018)는 "본인 행만 SELECT 가능"이라 일반
  로그인 세션으로는 다른 사용자의 nickname/grade를 절대 조회할 수 없다(의도된 프라이버시
  설계 — birth_years 등 민감 정보 보호가 목적). RLS를 완화하는 대신, 기존
  curated_items/spot_curations 어드민 데이터 조회와 동일한 관례대로 **service_role
  (createAdminClient)로 서버 전용 라우트에서만** 조회하고, 응답에는 안전한 필드
  (id/nickname/grade)만 골라 담아 birth_years 등 민감 정보가 새어나가지 않게 했다.
  로그인/등급 검증(새싹맘 이상)은 RLS 대신 라우트 레벨에서 `requireCommunityAccess()`로
  직접 수행.
- `mom_pick_posts.author_id`와 `profiles.id`가 둘 다 `auth.users(id)`를 가리키는
  형제 FK라 PostgREST 임베디드 조회가 안 되는 문제(오늘 이미 두 번 겪은 문제 —
  push_subscriptions 배치와 동일)를 동일한 "2단계 조회 + JS 병합" 패턴으로 해결.
- **정직한 데이터 한계**: 요구사항 원문 "찜(북마크)이나 좋아요"에서 "찜"은 스팟/이벤트
  전용 기능(user_bookmarks)이고 게시글 자체에는 찜 기능이 없어(Decision 019 스펙에
  없는 개념을 추측으로 만들지 않음) 인기글 순위는 `like_count`만으로 판단했다.
- API: `/api/mom-pick/dashboard`(미리보기 3개 섹션 한 번에, 각 3/5/5건),
  `/api/mom-pick/{expert,trending,live}`(각 섹션 전체보기, 페이지네이션 20건/페이지).

### 닉네임 신규 도입
- 파워맘/우수맘 카드에 "작성자의 닉네임... 필수 표시" 요구사항을 충족할 표시 이름이
  `profiles`에 전혀 없었다(실명/이메일 노출은 부적절) — `profiles.nickname`(nullable)
  컬럼을 신규 추가하고, `/my` 페이지에 `NicknameEditor`(BirthYearsEditor와 동일한
  최소 폼 패턴)를 추가했다. 미설정 시 "이름 없는 맘"으로 안전하게 대체 표시.

### 성능 최적화
- 요구사항 "각 영역별로 필요한 소량의 데이터만(LIMIT 3 또는 5) 가볍게 쿼리"를 그대로
  구현 — 미리보기는 DB 레벨에서 각 섹션 독립적으로 3/5/5건만 조회하고(전체 데이터를
  긁어와 클라이언트에서 자르지 않음), 왕복 횟수만 하나의 `/api/mom-pick/dashboard`
  요청으로 묶었다(요청 수와 쿼리 경량화는 서로 다른 축의 최적화라 둘 다 반영).

## 명시적 비목표 / 구현 판단
- 전체보기 페이지의 카드는 읽기 전용이다(좋아요 토글 등 인터랙션 없음) — 요구사항이
  "노출"만 명시했고 인터랙션 요구가 없어 추측으로 추가하지 않았다. 기존 `MomPickFeed`
  (좋아요 토글 포함 최신순 피드)는 메인 화면에서 더 이상 렌더링하지 않지만 **삭제하지
  않고 그대로 남겨뒀다**(임의 기능 제거 금지 원칙 — 추후 재사용 가능성 보존).
- "파워맘"과 "우수맘"을 요구사항이 하나의 섹션으로 병기했으므로 둘을 분리하지 않고
  `grade in ('excellent','power')`로 함께 조회한다(원문 그대로).

## 검증
### 코드 검증
`npx tsc --noEmit`/`npm run test`(95파일 953건, 회귀 없음)/`npm run build` 통과.
신규 라우트(`/mom-pick`, `/mom-pick/expert`, `/mom-pick/trending`, `/mom-pick/live`,
`/api/mom-pick/*` 4개) 전부 정상 빌드.

### 실측 검증
- 라이브 DB에 `profiles.nickname` 컬럼 마이그레이션 적용 확인.
- dev 서버 curl로 4개 페이지 200 응답 확인, 4개 API 라우트가 미로그인 요청을
  401("로그인이 필요합니다.")로 정확히 차단함을 확인(`requireCommunityAccess` 가드
  동작 검증).
- 라이브 DB에 현재 우수맘/파워맘 등급 사용자가 0명(아직 실사용 데이터 없음)임을 직접
  확인 — 빈 상태 UI(emptyText)가 실제로 노출될 상황임을 인지하고 있음(버그 아님).

## 특이 사항
- 실제 파워맘/우수맘 사용자와 좋아요가 몰린 인기글이 생기기 전까지는 3개 섹션 모두
  "아직 ... 없어요" 빈 상태만 보인다 — 정상이며, 맘스픽 등급 배치(매일 KST 04:23)와
  실사용자 활동이 누적되면 자연히 채워진다.
- 로그인한 실제 계정으로 `/mom-pick`에 접속해 개인화 배너 문구(지역+나이)와 3개 섹션이
  실제로 올바르게 렌더링되는지 눈으로 한 번 확인해보길 권장한다(비로그인 curl로는
  그 이상 검증 불가).
