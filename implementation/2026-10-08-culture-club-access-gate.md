# 문화센터 열람 권한 — 새싹맘 이상 + 로그인 필요

## 구현 대상
사용자 지시(2026-10-08): "문화센터 볼수 있는 권한에 대하여 로그인 유저?
새싹맘부터... 그래서 아이 연 월 생 관련 입력된 사람들만 볼수 있게해줘" —
지금까지 비로그인 유저도 완전히 쓸 수 있던 "🏫 문화센터" 탭에 로그인 +
새싹맘 등급 게이트를 건다.

## 구현 일시
2026-10-08

## 사전 조사로 확인한 것
- "아이 연월생 입력된 사람만"은 **별도 체크를 새로 만들 필요가 없었다** —
  `ProfileCompletionGuard`(src/components/auth/profile-completion-guard.tsx,
  root layout 전역 마운트)가 이미 로그인한 모든 유저에게 `birth_years`
  입력을 강제한다(입력 전엔 `/auth/complete-profile` 외 어떤 화면도 못
  봄). sprout(새싹맘) 승급도 "첫 글 작성"이 전제인데, 글쓰기 화면 역시
  이 가드를 거쳐야만 도달 가능하므로, sprout 등급에 도달한 시점엔 구조적
  으로 이미 자녀 생년월이 입력돼 있다. 그래서 이번 작업은 "로그인 + 새싹맘
  등급"만 새로 게이팅하면 사용자가 말한 조건을 전부 만족한다.
- 기존에 동일한 3분기(비로그인/새싹맘 미달성/허용) 패턴이 맘스픽
  (`useMomPickAccess` + `LoginPromptModal` + `SaessakMomGuideModal`,
  2026-09-02)에 이미 있어 그대로 재사용했다(제5장 제4조).

## 변경 사항
- `src/lib/community/grades.ts`: `canViewCultureClub(grade)` 추가
  (`hasReachedGrade(grade, 'sprout')`).
- `src/hooks/use-culture-club-access.ts`(신규): `useMomPickAccess`를
  그대로 본뜬 `useCultureClubAccess()` — 상태 `'loading'|'guest'|
  'not_sprout_yet'|'allowed'`.
- `src/components/community/login-prompt-modal.tsx` /
  `saessak-mom-guide-modal.tsx`: `title`/`description`을 선택적 override
  prop으로 받도록 확장(생략 시 기존 맘스픽 문구 그대로 — 기존 호출부
  동작 변화 없음). 문화센터 전용 문구로 재사용.
- `src/components/home/home-view.tsx`: "🏫 문화센터" 탭 렌더링을
  `cultureClubAccessState`로 분기 — `guest`→`LoginPromptModal`,
  `not_sprout_yet`→`SaessakMomGuideModal`(CTA는 `/mom-pick`으로 이동, 글
  쓰기는 거기서), `allowed`→기존 `CultureClubTabView` 그대로. 안내 모달을
  닫으면 "이벤트" 탭으로 되돌린다.

## 범위에서 제외한 것(의도적)
- **서버 측 API 가드는 이번에 포함하지 않았다.** `/api/culture-club/
  {search,stores,lottemart-stores}` 3개 라우트는 맘스픽의 `require
  CommunityAccess`처럼 서버에서도 등급을 검증하는 방어선이 이미 있는
  전례가 있지만, 그걸 추가하면 기존 3개 라우트의 테스트 파일(이미 존재,
  인증 모킹 없이 작성됨)이 전부 깨져 다시 작성해야 하는 등 범위가 커진다.
  사용자 지시는 "볼 수 있는 권한"(화면 단)에 명확히 초점이 맞춰져 있어
  이번엔 클라이언트 게이트만 구현한다(제5장 제3조 — 지시 범위를 임의로
  넘기지 않음). 필요하면 별도 지시로 서버 측 방어선도 추가할 수 있다.

## 검증
- `npx tsc --noEmit` / `npm run test`(286개 파일 2,948개, 신규 테스트
  포함) / `npm run build` 전부 통과.
- `npm run dev`로 실제 기동 확인(홈 200 정상 응답).
- 기존 `home-view.test.tsx`의 문화센터 탭 테스트 2개는 "새싹맘 이상
  유저" 모킹을 추가해 그대로 유지(동작 보존 확인), 비로그인/새싹맘
  미달성 분기는 신규 테스트로 추가.
