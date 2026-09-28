# 공지 크롤링 주간 배치 — 어린이도서관 제외

## 구현 대상
todo.md [개선사항 2] (2026-09-28 등록): 표준중분류가 '어린이도서관'인 항목은
일일/주간 크롤링·업데이트 루프에서 제외한다. 확장성 고려(향후 다른 표준중분류도
제외 가능해야 함).

## 배경
"일일 크롤링 및 업데이트 루프"에 해당하는 실제 코드는
`scripts/ingest/notice-refresh-batch.mjs`(네이버 플레이스 공지 주간 배치,
`.github/workflows/notice-refresh-batch.yml`)다. naver_place_id가 채워진
open_spaces 행을 전부 훑어 네이버 플레이스 페이지를 크롤링하고
`notice_checked_at`을 갱신한다. 실측 확인 결과 naver_place_id가 채워진
어린이도서관이 67건 있어, 도서관은 "공지사항" 큐레이션 대상이 아님에도 이
배치가 매주 67건씩 불필요한 네이버 크롤링을 하고 있었다.

## 변경 사항
### `scripts/ingest/notice-refresh-batch.mjs`
- `const EXCLUDED_CATEGORY_MINS = ['어린이도서관'];` 추가(배열이라 향후 다른
  표준중분류도 그대로 추가 가능 — 확장성 요구사항 반영).
- 대상 조회 쿼리에 `category_min` 컬럼 추가, 조회 후
  `spots = allSpots.filter((s) => !EXCLUDED_CATEGORY_MINS.includes(s.category_min))`로
  제외 대상을 걸러낸 뒤 그 목록만 순회.
- 로그와 반환값에 `excludedCount`를 추가해 몇 건이 제외됐는지 드러나게 함.
- 다른 중분류(놀이방식당/찜질방·스파 등)의 기존 로직은 전혀 손대지 않음.

### `scripts/ingest/notice-refresh-batch.test.mjs` (신규)
- 제외 대상 중분류 스팟은 fetch/DB 갱신 어느 쪽도 타지 않는지 검증(1개).
- 제외 대상이 없으면 기존과 동일하게 전부 처리되는지 검증(회귀 방지, 1개).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(전체 216개 파일, 2,478개 테스트) 통과.
- `npm run build` 통과.

## 특이 사항
없음 — 순수 필터 추가라 다른 중분류 동작에 영향 없음.
