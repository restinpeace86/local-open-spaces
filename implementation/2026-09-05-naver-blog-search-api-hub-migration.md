# 네이버 블로그 검색 API — NAVER API HUB 이관 대응 (인증 실패 원인 정정)

## 구현 대상
사용자 지시: "네이버 Data HUB spot-pick .env.local에 이거 id / client secret 다
있고 이번에 블로그 쪽도 신청했어.. 다시 확인해봐 네이버 블로그 읽어올수있는지" —
이전 구현(2026-09-05-admin-blog-curation-modal.md)에서 "401 인증 실패 — 사용자가
네이버 개발자센터에서 확인해야 함"으로 기록했던 부분을 재확인.

## 구현 일시
2026-09-05

## 무엇이 잘못됐었는지 (정직하게 기록)
이전에 `.env.local`의 키로 옛 엔드포인트(`openapi.naver.com/v1/search/blog.json`
+ `X-Naver-Client-Id/Secret` 헤더)를 호출해 401이 나자, "네이버 개발자센터에서
검색 API가 활성화 안 됐거나 키가 유효하지 않다"고 결론 내렸다. 이번에 사용자가
"ncloud.com(네이버 클라우드 플랫폼)에서 발급받았다"고 답했을 때도 처음엔 "그건
블로그 검색을 제공하지 않는 별개 플랫폼"이라고 잘못 안내했다.

그런데 사용자가 네이버 개발자센터의 공식 공지문(2026-06-29 게시)을 그대로
붙여줬고, 거기엔 **2026-06-25부로 검색 API(Search API, 검색어 트렌드, 쇼핑
인사이트)가 개발자센터에서 NAVER Cloud Platform의 "NAVER API HUB"로 이관**됐고,
**2026-07-31 이후로는 옛 콘솔에서 신규 신청 자체가 막혔다**고 명시돼 있었다.
즉 사용자가 "이번에 블로그 신청"한 시점(2026-09-05 기준 최근)이면 애초에 NAVER
API HUB(ncloud.com)에서 발급받는 게 유일한 방법이었다 — 사용자의 답이 맞았고,
내가 옛 엔드포인트만 기준으로 판단해 틀린 진단을 내렸던 것이다.

## 실측으로 재확인한 것
- WebSearch/WebFetch로 NAVER API HUB 공식 이관 가이드(guide.ncloud-docs.com,
  api.ncloud-docs.com)를 확인해 새 엔드포인트/헤더 규격을 파악했다(추측하지 않고
  1차 문서로 확인).
- 같은 `.env.local`의 `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 값을 새 엔드포인트로
  직접 호출 → **200 OK + 실제 블로그 검색 결과 수신 확인**.
- 앱 자체의 `/api/admin/spot-curations/blog-search` 라우트를 코드 수정 후 dev
  서버로 직접 띄워 실제 호출 → 정상적으로 정제된 결과(`<b>` 태그 제거, `isRecent`
  계산 포함) 수신 확인.

## 변경 사항
- `src/app/api/admin/spot-curations/blog-search/route.ts`:
  - 엔드포인트: `https://openapi.naver.com/v1/search/blog.json` →
    `https://naverapihub.apigw.ntruss.com/search/v1/blog`
  - 요청 헤더: `X-Naver-Client-Id`/`X-Naver-Client-Secret` →
    `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`
  - 응답 JSON 필드 구조(title/link/description/bloggername/postdate)는 이관 전후
    동일해 파싱 로직(`cleanNaverText`/`isWithinRecentWindow` 등)은 변경 없음.
  - 401 에러 힌트 문구를 "네이버 개발자센터 확인" → "NAVER API HUB 콘솔에서 이
    Application에 검색 API가 연결돼 있는지 확인"으로 갱신.
- `project/decision-log.md` Decision 021 5항을 "정정" 표시와 함께 갱신 — 당초
  오판(계정/키 설정 문제)과 실제 원인(엔드포인트 이관)을 모두 남겨 기록의 정확성을
  유지했다(과거 기록을 조용히 지우지 않음).
- `NAVER_CLIENT_ID`/`NAVER_CLIENT_SECRET` 환경변수 이름 자체는 그대로 유지했다
  (이미 이 이름으로 `.env.local`에 등록돼 있고, 값의 출처만 NAVER API HUB로
  바뀐 것이라 이름을 바꿀 이유가 없다).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 113개 파일 / 1185개 테스트 전체 통과(관련 테스트는 fetch를
  모킹하므로 헤더/엔드포인트 변경에 영향받지 않음 — 실제 네트워크 검증은 아래
  수동 확인으로 별도 수행).
- `npm run build` 통과.
- **실제 네트워크 호출로 재현 확인**: (1) 새 엔드포인트/헤더로 직접 호출 → 200 +
  실제 검색 결과, (2) 앱의 `/api/admin/spot-curations/blog-search` 라우트를 dev
  서버로 띄워 직접 호출 → 200 + `isRecent`/텍스트 정제까지 포함한 정상 응답.

## 특이 사항
- "본문 텍스트는 요약 스니펫(≈200자)만 제공된다"는 이전 기록(Decision 021 6항)은
  이번 이관과 무관하게 그대로 유효하다 — NAVER API HUB로 옮겨진 뒤에도 응답
  필드는 동일(title/link/**description**/bloggername/postdate)하기 때문이다.
- 이 건은 "구현 AI가 첫 진단을 잘못 내렸다가 사용자가 제공한 1차 정보(공식 공지)로
  바로잡은" 사례다 — 추측 대신 공식 문서를 실측 확인한 뒤 코드에 반영했다(제3장
  제5조).
