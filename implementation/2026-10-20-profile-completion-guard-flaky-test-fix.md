# ProfileCompletionGuard 테스트 산발적 실패 수정

## 구현 대상
개선사항2(블로그 제목 노출) 작업 중 전체 테스트 검증 단계에서 우연히
발견한, 이 기능과 무관한 사전 존재 플레이키 테스트.

## 구현 일시
2026-10-20

## 진단
`npm run test -- --run`을 반복 실행하면
`profile-completion-guard.test.tsx`의 "닉네임/아이 출생년도가 모두
있으면 아무 것도 하지 않는다" 테스트가 통과/실패를 번갈아 보였다.
원인: `getMyProfile()`(`src/lib/auth/profile.ts`)에 TTL 기반 모듈 스코프
캐시가 있는데, 이 테스트 파일의 `afterEach`가 mock들만 리셋하고 이
캐시는 비우지 않았다 — 앞선 테스트("아이 출생년도가 비어 있으면...")가
조회한 "미완성" 프로필이 캐시에 남아, 다음 테스트의 새 스텁("완성됨")을
가려 간헐적으로 리다이렉트가 잘못 호출됐다.

## 변경 사항
`src/components/auth/profile-completion-guard.test.tsx`: `afterEach`에
`invalidateMyProfileCache()` 호출 추가.

## 검증
- 같은 테스트 파일을 5회 연속 실행해 전부 통과 확인(수정 전엔 실행마다
  통과/실패가 번갈아 나왔음).
- `npm run test -- --run`(337 파일 3,356개) 전체 통과.

## 특이 사항
- 이번 작업(블로그 제목 노출, 개선사항2)과는 무관한 별도 버그라 별도
  커밋으로 분리했다.
