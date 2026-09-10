# 맘스픽: 비로그인/가입맘은 미리보기만 — 전체보기·클릭 차단 — Step 107

## 구현 대상 (사용자 지시, 2026-09-11)
"로그인 안 했거나 아직 가입맘이면 맘스픽을 볼 수는 있지만 '전체보기' 같은 건 못
눌러야 한다. 뭔가 눌러서 보려고 하면 첫 글 남기기 / 로그인하고 후기 남기기로
가야 한다. 지금은 (PC에서) 그냥 들어가진다."

## 원인
- Step 96(개선사항4)의 투명 인터셉트 레이어가 `not_sprout_yet`에만 적용되고
  **`guest`엔 없었다** → 비로그인 상태로 PC에서 "전체보기 ➔" 링크를 그냥 클릭해
  전체 목록 페이지로 진입했다.
- 서버 가드 `requireCommunityAccess`도 비로그인(`!user`)이면 `ok:true`로
  통과시켜(2026-09-03 개선사항10) 전체보기 API(`/api/mom-pick/{expert,trending,
  live}`)가 200을 내려줬다.

## 구현 일시
2026-09-11

## 변경 사항
### `src/components/community/mom-pick-view.tsx`
- 투명 인터셉트 레이어를 `guest || not_sprout_yet` 둘 다에 적용.
- 레이어 클릭 분기: `guest` → `LoginPromptModal`(로그인 유도),
  `not_sprout_yet` → `SaessakMomGuideModal`(첫 글 작성 유도).
- aria-label도 상태별로 분리.

### `src/lib/community/require-community-access.ts`
- 비로그인(`!user`) → 이제 `401`(전체보기 불가). 가입맘(`signed_up`) → 기존대로
  `403`. 안내 문구를 "로그인하고 후기를 남기면…" / "첫 후기를 남겨 새싹맘이
  되면…"으로 친절하게.
- **역할 재정의**: 이 가드는 이제 **전체보기 목록**(expert/trending/live) 전용.
  메인 미리보기는 게이팅하지 않는다.

### `src/app/api/mom-pick/dashboard/route.ts`
- `requireCommunityAccess` 호출 제거 — 메인 미리보기(3~5건)는 비로그인·가입맘도
  볼 수 있어야 한다(개선사항4 투명 오버레이 온보딩의 전제). 클릭·전체보기·글쓰기는
  클라이언트 레이어 + 전체보기 라우트가 막는다.
  · 부수 효과(개선): 예전엔 `signed_up`이 이 라우트에서 403이라 메인 미리보기
    자체가 에러였는데, 이제 정상적으로 프리뷰가 뜬다.

### `src/components/community/full-list-view.tsx`
- 401/403 등 에러 시 raw 텍스트 대신 안내 박스 + "맘스픽 메인으로 돌아가기"
  링크(직접 URL 접근 대비).

### `spec/community/mom-pick-grades.md` 1절
- 등급표에 "비로그인/가입맘 = 미리보기만, 새싹맘부터 전체 열람" 명시.

### 테스트
- `mom-pick-view.test.tsx` +2: guest 레이어 클릭 → LoginPromptModal(새싹맘
  안내 모달 아님). LoginPromptModal은 소셜 로그인 버튼(supabase OAuth) 렌더를
  피하려 가볍게 스텁.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 128 파일 1467건 통과.
- `npm run build`: Compiled successfully.

## 특이 사항
- Decision 019.2("맘스픽 커뮤니티 피드는 로그인 사용자만")·spec 등급표와의 관계:
  "전체보기(full list)"가 이제 새싹맘+ 전용이 되어 오히려 그 취지에 더 부합한다.
  메인 "미리보기"는 개선사항4가 명시적으로 요구한 read-only 배경 노출이라 별도
  취급(spec 등급표에 반영).
