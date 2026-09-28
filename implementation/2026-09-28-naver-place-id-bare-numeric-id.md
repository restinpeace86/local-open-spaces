# 네이버 플레이스 ID 저장 — 순수 숫자 ID 입력 지원

## 구현 대상
사용자 제보(2026-09-28): "서울특별시교육청 어린이도서관, 국립어린이청소년도서관,
화전어린이도서관 이것들 내가 네이버 ID 집어넣고 저장했는데 다시 들어가보면
세팅이 안돼있어."

## 조사 과정
1. 국립어린이청소년도서관/화정어린이도서관(고양시립화정어린이도서관, 중복
   그룹의 대표 행)은 현재 DB에 naver_place_id가 들어있어(각각 11797439/
   18277005), 대표/비대표 그룹 숨김 로직도 정상 동작 확인 — 이 자체로는
   "사라지는" 구조적 버그가 없었다.
2. `naver_place_id` PATCH 라우트(`/api/admin/data-grid/naver-place-id`)에
   실제로 update→재조회 테스트를 직접 수행해, DB 쓰기 자체는 즉시·정상적으로
   반영됨을 확인(가짜 값으로 갱신 후 별도 조회로 재확인, 원복까지 완료).
3. 관리자 화면에서 naver_place_id는 **직접 입력 필드가 없고**, "네이버 플레이스
   주소로 자동 채우기" 입력창에 URL을 붙여넣어 크롤링에 성공했을 때만
   `extractNaverPlaceId(url)`가 뽑아낸 값이 폼 상태에 채워지는 구조였다
   (`src/components/admin/spot-curations-panel.tsx`).
4. `extractNaverPlaceId`(`src/lib/admin/naver-place-crawler.ts`)는 `/place/숫자`,
   `/restaurant/숫자` 같은 **URL 경로 패턴만** 인식한다 — 사용자가 URL이 아니라
   순수 숫자 ID만 타이핑하면 이 패턴이 전부 매치 실패해 크롤링 라우트가 400으로
   실패한다("URL에서 장소 ID를 찾지 못했습니다"). 크롤링이 실패하면 폼의
   `naverPlaceId` 상태가 전혀 갱신되지 않아 저장 시 diff 자체가 없어(값이
   그대로) naver_place_id PATCH가 아예 시도되지 않는다 — 다른 필드(뱃지 등)는
   정상 저장되므로 "저장은 됐는데 이것만 빠졌다"로 보인다.

## 원인 결론
"네이버 ID 집어넣고 저장" = 사용자가 URL이 아니라 순수 숫자 ID를 그 입력창에
직접 타이핑했을 가능성이 높다. 그 입력창은 URL만 파싱하도록 만들어져 있어
크롤링이 조용히 400 실패하고, naver_place_id는 한 번도 실제로 저장 시도되지
않았다.

## 변경 사항
### `src/lib/admin/naver-place-crawler.ts`
- `extractNaverPlaceId`에 마지막 폴백 추가: 트리밍한 입력이 순수 숫자로만
  이루어져 있으면(`/^\d+$/`) 그 자체를 ID로 인정한다. 기존 URL 패턴 매칭이
  전부 실패했을 때만 시도하므로, 기존 "검색 URL 등 ID를 못 찾으면 null" 동작은
  그대로 유지된다(검색 URL은 숫자만으로 구성된 문자열이 아니므로 안 걸림).

### `src/lib/admin/naver-place-crawler.test.ts`
- 순수 숫자 ID 입력 시 그대로 인정하는지(공백 트리밍 포함) 검증 2건 추가.
- 숫자만으로 안 된 문자열은 여전히 null인지(회귀 방지) 검증 1건 추가.

### `src/components/admin/spot-curations-panel.tsx`
- "네이버 플레이스 주소로 자동 채우기" 입력창 위에 "전체 URL 또는 네이버
  플레이스 숫자 ID만 입력해도 됩니다" 안내문 추가 — 재발 방지(관리자가 다시
  숫자만 입력해도 이제는 실제로 동작하지만, URL도 여전히 받는다는 걸 명시).

## 검증
- `npx vitest run src/lib/admin/naver-place-crawler.test.ts src/components/admin/spot-curations-panel.test.tsx` — 2 파일 70개 테스트 통과.
- `npx tsc --noEmit` / `npm run test`(전체 216개 파일 2,480개) / `npm run build` 모두 통과.

## 특이 사항 — 미해결 항목
- "서울특별시교육청 어린이도서관"은 open_spaces 테이블 전체(카테고리 무관,
  standard_name/display_name 양쪽 다)를 검색해도 **어디에도 존재하지 않는다** —
  이 도서관 자체가 아직 시스템에 등록돼 있지 않다. 사용자가 정확히 어떤
  화면/검색어로 접근해 이 노출이름을 입력했는지 확인이 더 필요하다(추측으로
  임의의 행에 이 이름을 붙이지 않았다 — 제3장 제5조).
- "화전어린이도서관"은 "화정어린이도서관"(고양시립화정어린이도서관)과 주소부터
  다른 별개의 실제 장소라고 확인받았다 — 현재 open_spaces에 "화전" 관련 행이
  하나도 없어, 이 역시 아직 시스템에 등록되지 않은 스팟이다.
