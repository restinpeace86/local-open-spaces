# 블로그 전체 본문 파서 jsdom → node-html-parser 교체 (프로덕션 500 근본 해결)

## 구현 대상
사용자가 Vercel 함수 로그를 직접 확인해 제공해준 정확한 에러:
```
Error: Failed to load external module jsdom-4cccfac9827ebcfe:
Error [ERR_REQUIRE_ESM]: require() of ES Module
/var/task/node_modules/@exodus/bytes/encoding-lite.js from
/var/task/node_modules/html-encoding-sniffer/lib/html-encoding-sniffer.js
not supported.
```

## 구현 일시
2026-09-06

## 근본 원인 (드디어 확정)
이전 두 차례 조치(`serverExternalPackages`, `outputFileTracingIncludes`)는 모두
"Vercel이 필요한 파일을 함수에 빠뜨렸을 것"이라는 추정에 기반한 번들링/트레이싱
관점의 수정이었다 — 실제 로그가 없어 추정으로 접근했던 것이 실패 원인이었다.
사용자가 준 실제 로그로 확인한 진짜 원인은 전혀 다른 층위였다:

**jsdom이 의존하는 `html-encoding-sniffer`가 `@exodus/bytes`의 ESM 전용 파일을
CommonJS `require()`로 불러오려 하는데, Node가 이를 지원하지 않는다.** 이건
파일이 빠진 게 아니라 **jsdom 자신의 의존성 그래프 안에 있는 CJS/ESM 비호환
버그**다 — Next.js 설정(serverExternalPackages든 outputFileTracingIncludes든)으로
고칠 수 있는 문제가 애초에 아니었다. 로컬에서 `next build && next start`가
멀쩡했던 건 로컬 Node 버전/모듈 해석 방식이 이 특정 require 경로를 우연히
다르게 처리했거나, dev/로컬 실행 경로가 이 코드 경로를 정확히 같은 방식으로
타지 않았기 때문으로 보인다 — 어쨌든 결론은 "Vercel만의 번들링 문제"가 아니라
"jsdom 자체를 이 런타임에서 못 쓴다"였다.

## 수정 — 무거운 jsdom 대신 목적에 맞는 가벼운 파서로 교체
애초에 이 기능에 필요한 건 "특정 class(`.se-main-container`)의 텍스트만
뽑아내기"뿐이라 전체 DOM/브라우저 엔진(jsdom)은 처음부터 과했다.
`node-html-parser`(순수 CJS, 가볍고 이런 스크래핑 용도로 널리 쓰이는 패키지)로
교체했다.

- `package.json`: `node-html-parser` 추가(dependencies). `jsdom`은 프로덕션
  코드에서 더 이상 안 쓰지만, `vitest.config.ts`의 `environment: 'jsdom'`
  (테스트 DOM 환경)이 여전히 필요로 해 `devDependencies`로 되돌렸다(테스트
  실행에만 쓰이고 Vercel 배포 번들에는 포함 안 됨 — 애초에 문제가 될 일이
  없는 위치로 정리). 더 이상 필요 없는 `@types/jsdom`은 제거했다.
- `src/lib/admin/naver-blog-body.ts`: `new JSDOM(html).window.document
  .querySelector(...)` → `parse(html).querySelector(...)`(node-html-parser).
  `textContent` → `structuredText`(블록 요소 사이에 개행을 넣어줘, 원본 HTML에
  실제 공백이 없어도 단어가 붙지 않게 해줌 — jsdom의 `textContent` + 정규식
  공백 정리와 동등하거나 더 나은 결과).
- `next.config.ts`: 더 이상 필요 없는 `serverExternalPackages`/
  `outputFileTracingIncludes`(jsdom 대상) 설정을 원상복구(제거) — 근본 원인이
  Next.js 설정과 무관했으므로 남겨두면 다음에 읽는 사람이 오해할 수 있어 정리했다.

## 검증
- 실제로 다운로드해둔 그 블로그 페이지(2.4MB, 스팸 게시물)로 jsdom과
  node-html-parser 결과를 직접 비교: **완전히 동일한 1,317자** 출력, 파싱
  시간은 **~600ms → 11ms**로 대폭 개선.
- `npx tsc --noEmit` 통과.
- `npm run test`: 115개 파일 / 1209개 테스트(합성 HTML 픽스처 기반 기존 9개
  포함) 전체 통과 — 파서를 바꿔도 동작이 그대로임을 재확인.
- `npm run build` 통과.
- 프로덕션 재검증은 배포 완료 후 별도로 확인.

## 특이 사항
- 이전 두 번의 시도(serverExternalPackages, outputFileTracingIncludes)는
  실제 로그 없이 "흔히 보고되는 문제 패턴"에 기반한 추측성 수정이었다 —
  결과적으로 틀렸다. 사용자가 실제 Vercel 함수 로그를 직접 확인해 정확한
  스택트레이스를 제공해준 뒤에야 진짜 원인(설정 문제가 아니라 jsdom 의존성
  자체의 버그)을 알 수 있었다. 로그 없이 추측을 반복하는 대신 사용자에게
  로그 확인을 요청한 판단이 옳았음을 확인한 사례로 기록해둔다.
