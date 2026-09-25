# 놀이방찜질방/스파 뱃지 세트 + 네이버 리뷰 투표 기반 자동 근거

## 구현 대상
사용자 지시(2026-09-26): "찜질방과 스파관련 중분류 만들었고.. 여기에 놀이시설있는
목욕탕업소로 된것들 다 있잖아.. 여기에 대하여 우리 뱃지 어떤거 가져가면 좋을까?"
— 여러 차례에 걸쳐 후보 뱃지를 검토하고, 실제 네이버 플레이스 크롤링(벽계수스파,
아뮤즈스파)과 방문자 리뷰 투표 데이터로 근거를 검증한 뒤 확정했다.

## 검토 과정 요약 (근거 없는 추측 배제)
1. 초기 제안(유모차/수유실/기저귀갈이대, 유아전용탕/이유식포트, 가족탕 등)은
   실제 크롤링 데이터로 뒷받침되지 않아 대부분 기각됐다 — 사용자가 "그런 게
   있는 찜질방이 있을까?"라고 직접 반문한 항목들.
2. 사용자가 붙여넣은 네이버 리뷰 "특징" 요약(76명·59명·48명... 투표수)을 보고
   자동화 가능성을 재검토 — 처음엔 개별 리뷰 HTML(불안정한 해시 클래스명)만
   찾아 "자동화는 무리"라고 판단했으나, 사용자가 직접 페이지 소스에서
   `VisitorReviewStatsResult:{placeId}` Apollo 엔티티(`analysis.votedKeyword.
   details[]`, `code`/`displayName`/`count` 필드)를 찾아줘서 뒤집었다 — 기존
   메뉴/공지와 동일하게 안정적인 정적 파싱이 가능한 진짜 구조화 데이터였다.
3. 사용자가 직접 지적: "휴게공간이 잘 되어있어요.. 이 휴게공간이 어떤
   휴게공간인지 모른단 말이야" — `rest_area`/`facility_equipped`/`play_var`/
   `foodplace_var`처럼 뭉뚱그려진 코드는 득표수가 높아도 뱃지 자동 매핑에서
   제외하고, `water_quality`/`parking_easy`/`baths_various`처럼 코드 자체가
   구체적인 것만 채택했다.
4. 사용자 확정: "10건 이상인건 자동 매핑해놓고.. 결국 최종 저장은 관리자가
   하니깐.. 몇위에 몇건이고 보여줘 뱃지 바로 아래에.. 그거 보고 사용자가
   뺄껀 빼고" — 임계값(count≥10)은 자동 체크에만 쓰고, 최종 판단 근거로
   순위·득표수를 뱃지 아래에 노출한다.

## 변경 사항

### DB
`scripts/migrations/2026-09-26-spot-curations-naver-review-vote-hints.sql`(적용):
`spot_curations.naver_review_vote_hints jsonb` 추가 — 네이버 리뷰 투표 중 우리
뱃지와 매칭된 것만 `[{code, badgeKey, displayName, count, rank}]`로 저장한다.
"스팟 큐레이션" 탭(⚡ 데이터 가져오기)과 "블로그 뱃지 큐레이션" 화면이
2026-09-08에 의도적으로 분리돼 있어(관련 없는 목적을 억지로 통합하지 않음),
전자가 계산해 저장하고 후자가 읽어서 순위/득표수를 보여주는 다리 역할을 한다.

### 뱃지 정의: `src/lib/admin/curation-badges.ts`
- `CurationCategoryConfig`에 `categoryMinNames?: string[]` 추가 — 노출중분류
  (`exposureCategoryNames`)와 별개로 표준중분류(`open_spaces.category_min`)만
  으로도 config를 활성화할 수 있다(사용자 지시: "노출중분류 매핑도 내가 수동으로
  할 거니깐.. 표준중분류가.. 이 뱃지들 나오게끔").
- `resolveCurationCategoryId(exposureCategoryName, categoryMin?)` — categoryMin이
  있고 매칭되는 config가 있으면 노출중분류보다 우선한다. categoryMin이 없거나
  매칭이 없으면 기존과 완전히 동일하게 동작(기존 카테고리 전부 무영향).
- 신규 `SPA_JJIMJILBANG_CONFIG`(`categoryMinNames: ['놀이방찜질방/스파']`) — 6개
  그룹, 16개 뱃지:
  - 네이버 리뷰 투표로 자동 확인되는 8개: 주차 완비, 수질 관리 우수, 탕 종류
    다양함, 수면실 있음, 노천탕 있음, 세신 서비스 우수, 샤워실 잘 되어있음,
    특이한 찜질방(테마방).
  - 블로그 키워드 매칭으로만 채우는 8개: 24시간 운영, 놀이방/키즈존, 오락실/
    코인노래방/PC방, 매점, 식당(키즈메뉴), 저온 힐링방, 야외 족욕탕/휴게공간,
    이성 혼탕 나이 제한.
- `NAVER_REVIEW_VOTE_CODE_TO_BADGE_KEY` export — 네이버 `code` → 우리 뱃지 키
  8개 매핑(뭉뚱그려진 코드는 의도적으로 없음).

### 크롤링: `src/lib/admin/naver-place-crawler.ts`
- `buildNaverPlaceReviewUrl(placeId)` — `/review/visitor` 페이지도 기존 home/
  menu/feed와 동일한 `__APOLLO_STATE__` 정적 파싱으로 접근 가능함을 실측 확인
  (아뮤즈스파&피트니스 남악점, naver_place_id 1683390650).
- `extractNaverPlaceReviewVoteHints(html)` — `VisitorReviewStatsResult:{id}`
  엔티티를 키 접두어로 찾아 `analysis.votedKeyword.details[]`를 득표수
  기준으로 직접 정렬(API 응답 순서를 신뢰하지 않음, 제3장 제5조)한 뒤,
  `NAVER_REVIEW_VOTE_CODE_TO_BADGE_KEY`에 있고 count≥10인 것만 순위와 함께
  반환한다.

### API: `src/app/api/admin/spot-curations/naver-crawl/route.ts`
home/menu와 함께 review 페이지도 병렬로 fetch해 `badgeVoteHints`를 응답에
추가한다. 리뷰 페이지 조회가 실패해도(느린 응답 등) 나머지 크롤링 결과는
그대로 반환한다(무중단 원칙, 제5장 제11조).

### 관련 버그 수정: `src/components/admin/spot-curations-panel.tsx`
"스팟 큐레이션" 탭(CurationFormModal)의 뱃지 표시·자동 체크가 스팟의 실제
category_min과 무관하게 항상 `restaurant` config로 하드코딩돼 있던 기존 버그를
함께 고쳤다(2026-09-19 도입, 이번 기능이 정상 동작하려면 필수 — 사용자 확인:
"같이 고치기"). 이제 스팟의 실제 category_min으로 계산한 `curationCategoryId`
를 쓴다. 크롤링 시 `badgeVoteHints`도 편의시설 자동 체크와 동일한 안전장치
(추가만, 기존 체크 해제 안 함)로 반영하고, 저장 시 `naver_review_vote_hints`도
함께 반영한다.

### 데이터 전달 체인 (category_min / naver_review_vote_hints)
`raw-data-modal.tsx`(open_spaces 상세팝업) → `spot-curation-quick-modal.tsx`
→ `spot-curations-panel.tsx`(CurationFormModal) 및 → `blog-curation-modal.tsx`/
`mobile-curation-workbench.tsx` → `use-spot-curation-form.ts` →
`curation-badge-form.tsx`까지 `category_min`을 새로 꿰었고, `/api/admin/
spot-curations` GET의 임베디드 `open_spaces(...)` select에 `category_min`을
추가해 자동으로 흘러들어오게 했다. `curation-badge-form.tsx`는 `voteHints` prop이
있으면 해당 뱃지 칩 바로 아래에 "네이버 리뷰 N위 · M건"을 작게 보여준다(다른
카테고리는 voteHints가 없어 기존 화면과 완전히 동일).

## 검증
- `npx tsc --noEmit` / `npm run test`(203개 파일 2,360개, 신규 테스트 다수
  포함) / `npm run build` 모두 통과.
- 배치 조회 쿼리·크롤러 파싱 로직 모두 실제 데이터(아뮤즈스파 사례)를 픽스처로
  삼아 검증했다.
- 배포된 운영 크롤러 API로 실제 URL(어뮤즈스파&피트니스 남악점)을 호출해 기존
  필드(가격/영업시간/편의시설)가 정상 반환됨을 재확인 — `badgeVoteHints`는 이
  변경이 아직 배포되지 않은 시점에 호출해 응답에 없었다(예상된 결과, 배포 후
  재확인 예정).

## 특이 사항
- 이 config는 노출중분류(`exposureCategoryNames`)가 비어 있다 — 관리자가
  나중에 수동으로 노출중분류를 매핑할 예정이며, 매핑 여부와 무관하게
  category_min만으로 뱃지가 나온다.
- "스팟 큐레이션" 탭의 후보 목록(카테고리별 브라우징)은 여전히
  `category_min='놀이방식당'`만 보여준다(2026-09-03 기존 설계, 이번 작업
  범위 밖) — 놀이방찜질방/스파 스팟은 open_spaces 상세팝업의 "스팟 큐레이션"
  버튼으로 개별 진입해야 한다.
