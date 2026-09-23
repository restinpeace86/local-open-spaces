# /partner 프론트엔드 성능 — ProfileCompletionGuard의 불필요한 클라이언트 인증 호출 제거

## 구현 대상
사용자 지시(2026-09-23), 이전 백엔드(미들웨어/쿼리 병렬화) 성능 개선 이후
이어진 요청: "이게 원인 아닌거 같아. 그럼 프론트엔드 구조에서 원인이 있나
확인해봐.. 느린 원인을 프론트엔드쪽의 랜더링이라던가에서 찾아봐봐"

## 실측으로 확인한 원인
Playwright로 실제 세션을 붙여 `/partner/today`를 로드한 뒤 브라우저가 만드는
네트워크 요청을 관찰했다. 서버가 이미 인증을 마치고 HTML을 다 내려준 뒤인데도,
**페이지 로드 후 브라우저에서 `https://.../auth/v1/user`로 추가 요청이 1건
더 나가는 것**을 확인했다(수정 전 상태로 직접 재현·캡처).

원인은 `src/components/auth/profile-completion-guard.tsx` — 루트 레이아웃
(`src/app/layout.tsx`)에 전역 마운트돼 **모든** 페이지에서 항상 렌더링되는
컴포넌트다. `/partner`, `/hq` 경로는 이 가드의 대상이 아니라는 예외 처리가
있었지만(2026-09-20), 그 예외 판정이 `useEffect` **안에서만** 이뤄지고
있었다 — 즉 `useUser()` 훅(내부적으로 `supabase.auth.getUser()` 네트워크
호출 + `onAuthStateChange` 구독을 무조건 생성)은 예외 판정과 무관하게 이미
호출된 뒤였다. 그래서 /partner, /hq 페이지에서 이 가드는 어차피 아무 것도
안 하면서도, 매번 불필요한 Supabase 인증 왕복 하나를 만들고 있었다.

이건 서버 응답 시간(TTFB)에는 안 잡히는 문제라(curl 기반 측정으로는 안
보임 — 페이지가 이미 로드된 "이후"에 브라우저에서 발생하는 요청이라서)
이전 백엔드 조치의 실측에서는 드러나지 않았고, 이번에 프론트엔드 렌더링/
브라우저 요청을 직접 관찰하고서야 발견했다.

## 조치
`src/components/auth/profile-completion-guard.tsx`: React Hooks는 조건부로
호출할 수 없어(Rules of Hooks) 기존 컴포넌트 안에서 `useUser()` 호출 자체를
건너뛸 수 없었다. 컴포넌트를 둘로 분리했다:
- `ProfileCompletionGuard`(외부, 항상 마운트): `usePathname()`만으로 exempt
  경로(`/auth/complete-profile`, `/auth/callback`, `/partner`, `/hq`)인지
  먼저 판정하고, exempt면 그냥 `null`을 반환한다.
- `ProfileCompletionGuardActive`(내부, exempt가 아닐 때만 마운트): 기존
  로직(`useUser()`, 프로필 완성 여부 확인, 미완성 시 리다이렉트)을 그대로
  옮겼다.

exempt 경로에서는 내부 컴포넌트 자체가 마운트되지 않으므로 `useUser()`가
호출되지 않고, 그 안의 `getUser()` 네트워크 호출/`onAuthStateChange`
구독도 아예 생성되지 않는다.

## 검증
- `npx tsc --noEmit` / `npm run test`(199개 파일 2,295개 — 기존
  `profile-completion-guard.test.tsx`에 "exempt 경로에서는 getUser()/
  onAuthStateChange 자체가 호출되지 않는다" 테스트 추가. 이 과정에서
  `onAuthStateChangeMock`이 기존 `afterEach`에서 리셋되지 않고 있던 걸
  발견해 함께 고쳤다 — 이전 테스트들의 누적 호출 수가 새 assertion에
  간섭하고 있었음) / `npm run build` 모두 통과.
- 실측: 수정 전 프로덕션에서 Playwright로 `/partner/today` 로드 후 브라우저
  네트워크 요청을 직접 캡처해 `auth/v1/user` 추가 호출 1건이 실제로 발생함을
  먼저 확인했다(재현). 배포 후 동일 방식으로 이 호출이 0건이 되는지 재확인
  예정(이 기록 갱신).

## 특이 사항
- 이 수정은 서버 응답 시간(TTFB)이 아니라 **페이지 로드 후 브라우저가
  추가로 만드는 네트워크 요청**을 없애는 것이라, 이전 커밋(미들웨어 캐싱 +
  쿼리 병렬화)이 다루던 지표와는 다른 종류의 개선이다 — 둘 다 필요했다.
- `useUser()` 훅 자체(`src/hooks/use-user.ts`)는 다른 13개 소비자 화면
  컴포넌트가 정상적으로 쓰고 있어 손대지 않았다 — 문제는 훅이 아니라
  "언제 이 훅을 마운트하는가"였다(제5장 제4조 기존 구조 우선).
