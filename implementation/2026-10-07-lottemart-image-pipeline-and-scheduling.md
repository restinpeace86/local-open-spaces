# 롯데마트 썸네일 이미지 버그 수정 + 배치 스케줄링 공백 발견/해소

## 구현 대상
사용자 피드백: "페이지네이션 몇개씩이야? 20개씩 아니야?" / "롯데마트 송파점
강좌인데 왜 이미지가 없지? 접수페이지로 가기 눌러서 들어가니깐 이미지
있는데?"

## 구현 일시
2026-10-07

## 1 — 페이지네이션 (확인, 버그 없음)
`culture-club-tab-view.tsx`의 `PAGE_SIZE = 20`이 그대로 `page_size`
파라미터로 API에 전달되고 있다. 코드 확인 결과 20건이 맞고, 별도 버그는
발견하지 못했다.

## 2 — 롯데마트 썸네일 이미지 유실 (실측으로 원인 파악 + 수정)
사용자가 지적한 정확한 예시(롯데마트 송파점, 10/10 토요 퍼니쿠킹 원데이,
store_code=322, cls_cd=20260332236450)로 실제 상세 페이지(courseview.do)를
직접 받아 확인했다.

### 원인
- 목록 API(searchList.do)엔 실제로 `<img>` 태그가 없다(2026-10-04 기존
  조사 그대로 맞음).
- 하지만 **상세 페이지(courseview.do)엔 `.lct-visual` 컨테이너 안에 이
  강좌 자신의 썸네일이 있다** — 지금까지 이 사실을 몰라서 상세수집
  스크립트(`lottemart-culture-club-detail.mjs`)가 강좌코드/강의실/소개/
  Tip만 가져오고 이미지는 전혀 긁지 않고 있었다.
- 추가로, 이마트에서 바로 전에 고친 것과 **동일한 "이중 쓰기 유실" 버그**
  가 롯데마트에도 그대로 있었다 — 매일 도는 목록 배치가 raw_extra를 매번
  새로 만들며 상세수집이 채운 class_intro/class_tip/class_code를 계속
  지우고 있었다(실측: 통합 테이블의 class_intro 보유율이 80%에 그침).
- **더 큰 문제**: 롯데마트는 메인 목록 배치(`lottemart-culture-club.mjs`)
  와 상세수집(`lottemart-culture-club-detail.mjs`) 둘 다 Windows 작업
  스케줄러에 전혀 등록돼 있지 않았다(실측: `schtasks /query`에 없음) —
  지금까지는 누군가 수동으로 실행한 결과로만 데이터가 쌓여 있었다.

### 변경 사항
- `lottemart-culture-club-detail.mjs`: `.lct-visual img`에서 썸네일 URL을
  추출하는 `parseMainImageUrl()` 추가, `main_image_url` 컬럼에 저장
  (마이그레이션: `2026-10-07-lottemart-culture-club-main-image-url.sql`).
  이마트와 달리 이미 완전한 절대 URL이라 CDN 조합이 필요 없다.
- `lottemart-culture-club.mjs`: 이마트와 동일하게 통합 테이블에 쓰기 전
  원본 테이블의 상세정보(이미지 포함)를 다시 읽어와 병합하는
  `mergeDetailEnrichment()`를 적용(이마트/롯데마트 공통이라
  `culture-club-common.mjs`로 옮김).
- `culture-club-unified-row.mjs`: `main_image_url`을 `raw_extra`에 포함.
- `culture-club-tab-view.tsx`: `getThumbnailUrl()`로 통일 — 이마트는 CDN
  URL 조합, 롯데마트는 `raw_extra.main_image_url`을 그대로 사용.
- **스케줄러 신규 등록**: `LocalOpenSpaces-LottemartBatch`(매일 09:10),
  `LocalOpenSpaces-LottemartDetailFetch`(매일 10:00) — 지금까지 완전히
  빠져 있던 자동 실행을 비로소 등록했다.

### 즉시 데이터 반영
- 사용자가 지적한 정확한 그 강좌 1건은 지금 바로 파서로 재조회해 raw
  테이블과 통합 테이블 모두에 이미지를 채워 넣어 즉시 확인 가능하게
  했다.
- `main_image_url`이 없는 나머지 전체 15,153건은 `detail_fetched_at`을
  null로 리셋해 상세수집이 전부 다시 돌도록 만들고, 백그라운드로 전체
  재수집을 실행 중이다(건당 300ms~1s 간격이라 전체는 수 시간 걸림 —
  완료되면 다음 날 메인 목록 배치가 돌 때 통합 테이블에 반영된다).

## 검증
- `npx tsc --noEmit` / `npm run test`(280개 파일 2,908개, 새 테스트:
  parseMainImageUrl 파싱/스코핑, mergeDetailEnrichment 공유 함수, 프론트
  엔드 롯데마트 썸네일 렌더링) / `npm run build` 전부 통과.
- 실측: 파서가 실제 페이지에서 사용자가 제시한 URL과 정확히 일치하는
  이미지를 뽑아내는지 직접 확인, `schtasks /query`로 신규 스케줄 2건
  등록 확인.
