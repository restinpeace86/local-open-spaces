# [LLM 매장 검증 타임아웃 장애 수정]

## 구현 대상
사용자 보고(2026-09-16): "🤖 LLM 매장 검증 (블로그 6건 자동 분석) 관련 라라코스트
부천 으로 상호명 넣어서 LLM 분석했는데 `fetch timeout after 8000ms:
https://generativelanguage.googleapis.com/.../gemini-flash-lite-latest:generateContent...`
상기와 같이 에러남" — [개선사항 8]에서 구현한 LLM 매장 검증 버튼이 실제 상호명으로
클릭 시 타임아웃 에러로 실패.

## 구현 일시
2026-09-16

## 원인
`src/app/api/admin/spot-curations/llm-verify/route.ts`의 `GEMINI_TIMEOUT_MS`가
8000ms로 설정돼 있었다. 직접 같은 프롬프트로 Gemini API를 여러 번 재현 호출해
정상 응답 시간은 1~1.5초 내외임을 확인했지만, 응답에 `thoughtSignature` 필드가
포함된 것으로 보아 이 모델은 답변 전 내부 추론(thinking)을 거치며, 이 추론
분량이 매 호출마다 달라 드물게 8초를 넘기는 경우가 있는 것으로 보인다(실제
사용자가 정확히 이 경우를 만남). 이 버튼은 실시간 채팅 흐름(같은 Gemini
호출이지만 3.5초 타임아웃 + 실패 시 대체 문구가 있는 `summary.ts`)과 달리
관리자가 한 번 클릭하고 결과를 기다리는 단발성 액션이라, 8초는 지나치게
빠듯한 예산이었다.

## 변경 사항
### `src/app/api/admin/spot-curations/llm-verify/route.ts`
`GEMINI_TIMEOUT_MS`를 8000 → 20000으로 상향. 관리자 클릭 후 대기하는 단발성
액션이라는 UX 특성상, 실패해서 재시도시키는 것보다 조금 더 기다려 성공시키는
쪽이 낫다고 판단했다(다른 필드의 Naver 검색 타임아웃 8000ms는 블로그 검색
자체는 원래도 빠른 API라 그대로 유지).

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1779개), `npm run build` 모두 통과.
- 실제 개발 서버에 사용자가 겪은 것과 동일한 입력값("라라코스트 부천")으로
  `/api/admin/spot-curations/llm-verify`를 직접 재현 호출해 HTTP 200 정상 응답을
  확인(약 6초 소요, 기존 8초 예산으로는 위험했을 여유). 응답 자체는 해당 상호명에
  대한 네이버 블로그 검색 결과가 0건이라 "매장 불일치(데이터 없음)"로 정직하게
  처리됐다 — 이는 검색 결과 자체의 문제이지 이번에 고친 타임아웃 버그와는 무관하다.
