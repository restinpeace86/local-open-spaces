# 놀이방찜질방/스파 뱃지 — 샤워실 삭제

## 구현 대상
사용자 지시(2026-09-26): "샤워실도 빼자 샤워실이 잘되어있는거 체크하려고
만든거 같은데.. 기본적으로 샤워실은 존재하고 샤워실이 좌지우지 하는거
같지는 않아. 큰 차이 없어보여".

## 판단
바로 전에 삭제한 "혼탕 나이 제한"과 같은 논리다 — 목욕탕/찜질방이라면 어디든
기본으로 있는 시설(샤워실)이라, 스팟마다 다르게 붙는 뱃지로는 스팟 간 구분에
도움이 안 된다.

## 변경 사항
`src/lib/admin/curation-badges.ts`의 `SPA_JJIMJILBANG_CONFIG`에서
`jj_shower`(샤워실) 완전 삭제 — badgeOptions, keywordGroups,
`NAVER_REVIEW_VOTE_CODE_TO_BADGE_KEY`(`shower_good` 매핑)까지 전부 제거.

## 검증
- `src/lib/admin/curation-badges.test.tsx`: 뱃지 개수 20→19(휴게/청결
  그룹 5→4개), NAVER_REVIEW_VOTE_CODE_TO_BADGE_KEY 매핑 개수 7→6개로 갱신,
  삭제 확인 테스트 추가.
- `src/lib/admin/naver-place-crawler.test.ts`: 리뷰 투표 픽스처의 예상
  출력에서 `shower_good` 항목 제거(입력 픽스처는 "이제 매핑 없어 제외됨"
  주석과 함께 유지 — scrubber_good과 동일한 패턴).
- `npx tsc --noEmit` / `npm run test`(203개 파일 2,374개) / `npm run build`
  모두 통과.
