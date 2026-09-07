# 관리자 화면 "수정/적재일"이 카테고리 재분류 후 화면에는 여전히 안 바뀌는 문제 수정

## 구현 대상
사용자 지시: "어 여전히 수정 적재일자 안바뀌는거 같은데 내가 표준중분류를
식당 -> 놀이방식당 바꾼것들..." — [[2026-09-07-updated-at-not-changing-fix]]
(Step 65)로 서버 쪽 `updated_at` 미갱신 버그를 고쳤는데도 사용자에게는
여전히 안 바뀌는 것처럼 보인다는 후속 신고.

## 구현 일시
2026-09-08

## 원인 (실측)
DB 직접 조회로 확인한 결과 서버 쪽은 이미 정상이었다:

```
select category_min, category_min_source, count(*), min(updated_at), max(updated_at), max(now())
from open_spaces where category_min = '놀이방식당' group by category_min, category_min_source;
-- {"category_min":"놀이방식당","category_min_source":"MANUAL","cnt":102,
--  "min_updated":"2026-08-22 04:51:20+00","max_updated":"2026-09-07 15:03:17+00",
--  "now_is":"2026-09-07 15:03:57+00"} -- 가장 최근 값이 확인 시점 40초 전
```

즉 DB의 `updated_at`은 정확히 갱신되고 있었다 — 실제 버그는 **클라이언트
쪽**이었다. `src/components/admin/data-grid-client.tsx`에서 표준
중분류/노출 중분류 수정이 성공한 뒤 로컬 React state(`rows`,
`selectedRow`)를 낙관적으로 갱신하는 세 곳 모두 `category_min` /
`service_category_id`는 갱신하면서 `updated_at`은 빠뜨리고 있었다:
1. `applyBulkEdit()` — 체크박스 선택 다건 일괄 수정
2. `RawDataModal`에 넘기는 `onCategoryMinUpdated` — 상세 모달의 표준
   중분류 단일 수정
3. `RawDataModal`에 넘기는 `onServiceCategoryUpdated` — 상세 모달의 노출
   중분류 단일 수정

그래서 사용자가 화면에서 값을 바꾸면 DB에는 즉시 오늘 날짜로 반영되지만,
목록을 새로고침(페이지 재조회)하기 전까지는 화면에 이전 날짜가 계속
보였다 — "여전히 안 바뀐다"는 신고와 정확히 일치한다.

## 변경 사항
`data-grid-client.tsx`의 세 지점에 `updated_at: new Date().toISOString()`을
추가해 서버 응답 성공 직후 로컬 state도 함께 갱신한다.
- `applyBulkEdit()`: `bulkCategoryMin`/`bulkServiceCategoryId` 중 하나라도
  적용됐으면 `updated.updated_at`을 지금 시각으로 설정(둘 다 open_spaces
  전용 라우트라 항상 안전).
- `onCategoryMinUpdated`: 이 핸들러는 `table={tab}` prop을 통해
  open_spaces/events 두 테이블 모두에서 쓰이는데, `events`에는
  `updated_at` 컬럼 자체가 없어 서버도 이 필드를 채우지 않는다
  ([[2026-09-07-updated-at-not-changing-fix]] 참고). 그래서
  `tab === 'open_spaces'`일 때만 `updated_at`을 함께 갱신하도록 분기했다.
- `onServiceCategoryUpdated`: 노출 중분류 편집기는 open_spaces 전용이라
  분기 없이 항상 `updated_at`을 갱신한다.

화면에는 날짜 단위(`toLocaleDateString('ko-KR')`)로만 표시되므로, 서버가
실제 기록한 시각과 초 단위까지 똑같을 필요는 없다 — 클라이언트에서 생성한
현재 시각으로 충분하다(추가로 서버 응답에 `updated_at`을 실어 보내도록
API를 바꾸는 것은 이번 문제 해결에 필요하지 않아 하지 않았다 — 제5장
제4조 기존 구조 우선/불필요한 변경 최소화).

## 검증
- `npx tsc --noEmit` 통과
- `npm run test` — 115개 파일, 1287개 테스트 전부 통과
- `npm run build` 통과
- 서버 쪽 DB 반영은 이미 Step 65에서 실측 검증 완료. 이번 수정은 화면
  표시 지연(새로고침 전까지 안 보이던 문제)만 해소하는 것이라 별도의
  DB 재검증은 필요하지 않았다.

## 특이 사항
- `onTargetAudienceUpdated`(이벤트 전용, `target_audience` 필드)와
  `onLocationUpdated`는 애초에 `events`/좌표 필드라 `updated_at`이
  없거나(이벤트) 이번 신고 범위(표준/노출 중분류) 밖이라 손대지 않았다.
