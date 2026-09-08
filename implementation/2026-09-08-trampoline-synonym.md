# 트램폴린 뱃지 동의어("트램펄린") 추가

## 구현 대상
`implementation/todo.md` 개선사항1-1: "트램폴린에 대하여 키워드 트램펄린도
가져가도록 할것."

## 구현 일시
2026-09-08

## 변경 사항
`src/lib/admin/curation-badges.ts`의 `KIDS_CAFE_CONFIG.keywordGroups.kc_trampoline`
키워드 목록에 '트램펄린'을 추가했다(`['트램폴린', '트램펄린', '방방', '방방이',
'점핑존', '점프']`). 블로그 본문에서 표준 표기(트램폴린)와 흔한 대체 표기
(트램펄린) 둘 다 같은 `kc_trampoline` 뱃지로 자동 체크/하이라이트된다.

## 검증
- `src/lib/admin/curation-badges.test.tsx`에 회귀 테스트 추가: '트램펄린'과
  '트램폴린' 둘 다 `kc_trampoline`으로 매칭됨을 확인.
- `npx tsc --noEmit` / `npm run test`(1296건) / `npm run build` 전체 통과.
