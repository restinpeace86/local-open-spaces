# getMyProfile() 캐싱 — 프로필 조회 중복 왕복 제거

## 구현 대상
사용자 질문(2026-10-09): "그럼 위치설정 전역변수라던가 온보딩때의 애
나이같은거 입력한거는 바로바로 세션으로 가지고 있는거야?" → 조사 결과
공유("getMyProfile()이 15곳에서 호출되는데 캐시가 전혀 없다") →
"영향도 보여주고 해 그리고 정석적이고 맞는 방향이면 변경범위가 크더라도
진행하는게 맞지" → 영향도 제시 후 진행.

## 구현 일시
2026-10-09

## 실측 확인 — 영향도
- `getMyProfile()` 호출 지점 15곳. 캐시가 전혀 없어 호출마다
  `auth.getUser()` + `profiles` select, 왕복 2번(왕복 1회 ~70~180ms,
  이전 세션에서 이미 실측).
- 가장 심한 지점: `BookmarkButton`(카드 리스트마다 하나씩 렌더 — 카드
  20개면 20번 중복), `culture-club-tab-view.tsx`(이 화면 안에서만도
  `useCultureClubAccess` 게이트용 1번 + 자체 연령필터용 1번 = 2번 중복).
- 기존에 동일한 문제를 해결한 전례가 있었다: `culture-club-store-
  coordinates-cache.ts`(짧은 TTL + 진행 중 요청 공유).

## 변경 사항

### `src/lib/auth/profile.ts`
- 모듈 레벨 캐시(`cachedResult`, TTL 30초) + 진행 중인 요청 공유
  (`pendingRequest`) 추가 — 동시에 여러 컴포넌트가 호출해도(응답이 오기
  전에 중복 호출) 실제 네트워크 조회는 한 번만 나간다(caching stampede
  방지, 단순 "캐시 있으면 반환" 방식은 이 경우를 못 막는다).
- `invalidateMyProfileCache()` 신규 export.
- 로그인/로그아웃(계정 전환) 시 캐시가 이전 사용자 값을 돌려주지 않도록
  `supabase.auth.onAuthStateChange()` 구독으로 자동 무효화.
- `updateBirthYearsAndMonths`/`updateNickname`(이 파일이 직접 바꾸는
  경우) 성공 시 즉시 무효화 — 온보딩/마이페이지에서 저장한 직후 다른
  화면에서 TTL이 안 지났다는 이유로 저장 전 값을 보여주는 사고를 막는다.
- 호출부 15곳은 **전혀 바뀌지 않는다**(함수 내부만 바뀜, 시그니처 동일).

### `src/hooks/use-mom-pick-access.ts`
- `refreshKey`가 바뀔 때 `invalidateMyProfileCache()`를 직접 호출하도록
  추가 — "방금 뭔가 바뀌었으니 꼭 새로 읽어라"라는 신호를 훅 스스로
  처리해, 호출부가 무효화를 깜빡해도(지금은 mom-pick-view.tsx만 쓰지만
  앞으로 다른 호출부가 추가될 경우) 2026-09-13에 고친 "글쓰기 직후 등급
  미반영" 버그가 재발하지 않게 한다.

### `src/components/community/mom-pick-view.tsx`
- `refreshProfileAfterPost()`가 `getMyProfile()`을 다시 부르기 전에
  `invalidateMyProfileCache()`를 명시적으로 호출 — 이 함수는 자기 자신의
  로컬 `profile` state도 직접 갱신하므로(훅 effect 타이밍과 별개) 캐시를
  직접 무효화해야 즉시 최신값을 받는다.

### 테스트
- `src/lib/auth/profile.test.ts`: `culture-club-store-coordinates-cache.
  test.ts`와 동일한 패턴(`vi.doMock` + 동적 import + `vi.resetModules()`)
  으로 전면 재작성. 기존 검증 유지 + 신규: TTL 내 중복 호출 1회만 조회,
  동시 호출(stampede) 1회만 조회, TTL 만료 후 재조회, 명시적 무효화,
  `onAuthStateChange` 시 무효화, 에러는 캐시하지 않음, 저장 함수 호출 후
  캐시 무효화 확인(출생년월/닉네임 둘 다).
- `src/hooks/use-culture-club-access.test.ts` / `use-mom-pick-access.
  test.ts` / `src/components/auth/complete-profile-view.test.tsx` /
  `src/components/home/home-view.test.tsx`: 각 파일의 `afterEach`에
  `invalidateMyProfileCache()` 호출 추가 — 이 4개 파일은 `@/lib/supabase/
  client`만 모의하고 `@/lib/auth/profile`은 실제 구현을 그대로 쓰는데,
  같은 파일 안의 여러 테스트가 모듈 레벨 캐시를 공유해 이전 테스트가
  채워둔 값을 다음 테스트가 이어받는 문제가 실제로 발생해(전체 테스트
  실행으로 발견) 고쳤다.
  - **시도했다가 되돌린 접근**: 전역 `vitest.setup.ts`에 `afterEach`로
    한 번에 처리하는 방법을 먼저 시도했으나, `profile.test.ts`처럼
    `vi.doMock`+동적 import+`vi.resetModules()` 패턴을 쓰는 파일과
    충돌했다(전역 afterEach가 로컬 afterEach의 resetModules 이후에
    실행되며 `./profile.ts`를 실제 Supabase 클라이언트로 재바인딩해
    캐시를 "선점"해버려, 그다음 테스트의 자체 모의가 무시되는 연쇄
    실패가 발생 — 실측으로 확인 후 되돌림). 결국 영향받는 4개 파일에만
    개별로 무효화를 추가하는 쪽으로 정리했다.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(314개 파일 **3,186개**) /
  `npm run build` 전부 통과.
- 개발 서버로 `/`, `/my`, `/mom-pick` 세 페이지 모두 200 응답 확인(서버
  크래시 없음).
- 실제 로그인 세션에서의 체감 속도 개선(카드 여러 개가 있는 화면에서
  BookmarkButton들이 동시에 마운트될 때 네트워크 탭에 조회가 1번만
  뜨는지)은 이 환경에서 직접 재현하지 못했다 — 사용자가 직접 확인 필요.

## 특이 사항
- TTL(30초)은 보수적으로 짧게 잡았다 — 서버 쪽에서 바뀌는 경우(DB
  트리거로 등급 승급, `/api/ai-chat/search`의 무료 횟수 소진 등)는 이
  클라이언트 캐시가 알 방법이 없어 TTL이 지나야 반영된다. "즉시 반영이
  꼭 필요한" 경로(글쓰기 직후 등급, 온보딩/마이페이지 저장 직후)는 모두
  명시적 무효화로 별도 처리했다.
- `detail-modal.test.tsx`/`map-explorer.test.tsx`/`my-page-view.test.tsx`
  등 `@/lib/supabase/client`를 모의하는 다른 파일들도 같은 구조적
  위험(여러 테스트가 모듈 캐시를 공유)을 안고 있지만, 전체 테스트
  실행에서 실제로 실패하지 않아 건드리지 않았다 — 필요해지면(새 테스트
  추가로 실제 충돌이 드러나면) 그때 동일한 방식으로 고친다.
