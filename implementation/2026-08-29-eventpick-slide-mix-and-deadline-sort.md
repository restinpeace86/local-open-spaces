# [이벤트픽 홈 슬라이드 카테고리 믹스 + 전체보기 마감임박순 정렬 및 '전체' 칩 제거]

## 요구사항
1. 이벤트픽 홈 슬라이드(미리보기): 각 카테고리 내부는 종료일(end_date) 가까운 순(ASC)으로
   정렬하고, 상위 10개 구성 시 특정 카테고리가 슬라이드를 독점하지 않도록 상한/교차배치.
2. 전체보기 바텀시트(EventBrowseSheet가 쓰는 3개 API: today/ongoing/reservation-open) 정렬을
   무조건 end_date 오름차순으로 변경 — 기간이 매우 긴 이벤트가 맨 앞에 고정되는 문제 방지.
3. EventBrowseSheet 상단 중분류 필터 칩에서 무의미한 '전체' 칩 제거.
4. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 1. 카테고리 하드코딩 우선순위 → 일반화된 라운드로빈 교차배치로 대체

기존 `sortByCategoryMinPriority`(2026-08-27 도입)는 "공공키즈카페/어린이실내놀이터는 앞으로,
자연/과학·교육체험은 뒤로"처럼 특정 카테고리 2~4개만 하드코딩하고 앞 우선순위 점유율을
50%로 캡핑하는 방식이었다. 이번 지시("특정 카테고리가 독점하지 않도록 상한/교차배치")는
카테고리 조합을 특정하지 않는 더 일반적인 요구라, 하드코딩 목록 없이 동작하는
`interleaveByCategoryMin`(카테고리별 그룹을 라운드로빈으로 한 건씩 채움)으로 완전히
대체했다 — 어떤 카테고리 조합이 오더라도 자동으로 ceil(limit/등장 카테고리 수)를 넘게
차지하지 못한다.

적용 대상: `getCurrentlyOngoingEvents`/`getReservationOpenEvents`(항상 적용, 바텀시트에서
재사용되지 않는 홈 전용 함수라 무조건 적용해도 안전함을 실제 호출부 확인으로 검증)와
`getTodayEvents`(Hero Carousel 미리보기와 "오늘 전체보기" 바텀시트가 함께 쓰는 함수라, 신규
`diversifyByCategory` 파라미터로 켤 때만 적용 — 기본값 false로 바텀시트 호출부
(`/api/events/today`)는 변경 없이 그대로 동작, 홈 Hero 호출부(`page.tsx`,
`getHomeFeed`)만 명시적으로 `true`를 넘긴다).

## 2. 마감임박순(end_date ASC) 정렬

`sortByEndDateAscending`을 신설해 `sortByDistanceIfKnown` 뒤·`byRegionPriority`/
`heroRegionTier` 정렬 앞에 끼워 넣었다(Array.sort의 안정 정렬 특성을 이용). 최종 우선순위는
"지역 우선순위 > 종료일 임박순 > 거리(동일 종료일일 때만 tie-break)" 순이 된다 — 기존
Strict Location-First(Decision: 위치 설정 시 해당 지역 우선 정렬)는 그대로 유지하면서, 그
안에서의 세부 정렬 기준만 "종료일 임박순"으로 바꿨다.

전체보기 바텀시트가 쓰는 3개 함수(`getTodayEvents`의 SQL order, `getCurrentlyOngoingEventsPage`,
`getReservationOpenEventsPage`)도 `.order('start_date', ...)` → `.order('end_date', {
ascending: true })`로 변경했다(요구사항 2, "무조건 end_date 기준"). `getTodayEvents`는 원래
`end_date = 오늘`로 이미 고정된 값만 조회하므로 이 변경은 사실상 no-op이지만, 3개 엔드포인트
정렬 기준을 일관되게 맞추기 위해 동일하게 적용했다.

## 3. `selectRegionFirst` 리팩터링

`getTodayEvents`가 limit로 자르기 전에 `interleaveByCategoryMin`을 한 번 더 거쳐야 해서,
기존 `selectRegionFirst`(정렬+자르기)를 `rankByRegion`(정렬만) + `selectRegionFirst`(그
결과를 자르기)로 분리했다. 유일한 기존 호출부(`getCategoryMinFeed`)는 `selectRegionFirst`를
그대로 쓰므로 동작 변화가 없다(제5장 제4조 기존 구조 우선 — 새 함수를 만들되 기존 동작은
그대로 보존).

## 4. EventBrowseSheet '전체' 칩 제거

`event-browse-sheet.tsx`에서 항상 보이던 "전체" 칩 버튼을 제거했다. 필터 해제는 이미 선택된
칩을 다시 누르면 되고(기존 토글 동작 그대로), 결과가 0건일 때는 `EmptyState`의 "필터 초기화"
버튼이 여전히 `selectedMaj`를 `null`로 되돌린다 — 기능 손실 없이 칩 한 줄만 짧아졌다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(60파일 611건, 신규/수정 테스트 포함) 통과.
  - 기존 "공공키즈카페류는 앞으로/뒤로" 하드코딩 검증 테스트 2건을 새 일반화 동작(다양한
    카테고리가 골고루 섞여 나옴) 검증으로 교체.
  - 신규: 카테고리 내부 종료일 오름차순 정렬(getCurrentlyOngoingEvents/
    getReservationOpenEvents), `diversifyByCategory` on/off(getTodayEvents), 페이지네이션
    함수 2종의 `.order('end_date', ...)` 호출 검증, EventBrowseSheet '전체' 칩 부재 검증.
- `npm run build` 통과.

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- `/api/events/ongoing`: 응답 항목들의 end_date가 오름차순(마감임박순)으로 나오는지 확인.
- `/api/home/feed`(성남시 분당구): heroEvents/currentlyOngoingEvents/reservationOpenEvents
  모두 특정 카테고리가 연속 반복되지 않고 여러 카테고리가 라운드로빈으로 골고루 섞여
  나오는 것을 실측 확인(예: ONGOING이 자연/과학→문화행사→전시/관람→산림여가→... 순으로
  20개 서로 다른 카테고리를 순환).

## 특이 사항
- `getTodayEvents`에 새 파라미터(`categoryMins`, `diversifyByCategory`)가 위치 인자로
  누적되고 있다 — 이번 세션에서 두 차례에 걸쳐 위치 인자로 추가한 기존 관례를 따랐다(제5장
  제4조 기존 구조 우선). 앞으로 파라미터가 더 늘어난다면 옵션 객체로 리팩터링을 고려할 만
  하지만, 이번 범위를 초과하는 리팩터링이라 진행하지 않았다.
