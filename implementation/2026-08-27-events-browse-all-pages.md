# [현재 이용 가능 / 예약 가능 전체보기 페이지 신설]

## 문제 제보
직전 작업(카드 순서 우선순위 쏠림 수정)에 대해 대표가 "그게 아니라, 265건을 다 확인할 수
있어야 한다 — 메인 카드처럼 전체보기 기능을 만들어야 한다. 20개만 보고 끝나는 게 이상하다"
고 재지적. 미리보기 안에서 순서를 조정하는 정도로는 근본 해결이 아니라는 지적.

## 구현 대상
Hero Carousel이 이미 갖춘 "오늘 전체보기"(`/events/today`) 패턴과 동일하게, "현재 이용
가능"/"예약 가능" 두 섹션에도 실제 DB 페이지네이션을 갖춘 전용 전체보기 화면을 만든다.

## 구현 일시
2026-08-27

## 설계
- 미리보기(`getCurrentlyOngoingEvents`/`getReservationOpenEvents`)는 "몇 개만 우선 보여주는
  큐레이션 미리보기"라는 성격을 유지한다(지역/거리 Strict Location-First + 카드 순서 우선순위
  그대로). "전체보기"는 반대로 "정말 전부"가 목적이라 지역 큐레이션이나 카테고리 우선순위를
  적용하지 않고, 안정적인 오프셋 페이지네이션(`count:'exact'` + `.range()`)만 쓴다. 제목 유사
  병합(`dedupeAndMergeFree`)도 하지 않는다 — 오프셋 페이지네이션과 사후 병합을 같이 쓰면
  페이지 경계마다 건수가 들쭉날쭉해진다.
- "예약 가능"의 기존 이중 쿼리(booking_status='접수중' OR SEOUL_YEYAK 원본
  SVCSTATNM='접수중')는 페이지네이션에서는 정확한 `count`가 필요해 두 쿼리로 나눠 병합하는
  방식 대신, PostgREST의 중첩 `or(...)/and(...)` 문법으로 하나의 쿼리로 합쳤다:
  `` `booking_status.eq.접수중,and(source.eq.seoul_public_reservation,raw_data->>SVCSTATNM.eq.접수중)` ``.
  실측으로 실제 DB에 대해 정상 동작함을 확인했다(총 791건 페이지네이션 정상).
- `REGION_OPTIONS`(성남시 분당구/서초구 2개뿐, "전체" 옵션 없음)를 그대로 재사용하면 오히려
  "다 보여달라"는 요구와 어긋나므로, 이번 전체보기 페이지에는 지역 필터를 아예 넣지 않았다
  (진짜 전부를 보여주는 것이 목적이므로).

## 변경 사항
- `src/lib/home/get-home-feed.ts`: `getCurrentlyOngoingEventsPage(page, pageSize)`/
  `getReservationOpenEventsPage(page, pageSize)` 신규(`PagedEvents` 타입, `{ items, total }`).
- `src/app/api/events/ongoing/route.ts`, `src/app/api/events/reservation-open/route.ts`
  (신규): `?page=&page_size=` 파라미터를 받는 페이지네이션 API.
- `src/app/events/ongoing/page.tsx`, `src/app/events/reservation-open/page.tsx`(신규):
  `/events/today`와 동일한 레이아웃(카드 그리드 + DetailModal)에, 관리자 그리드가 이미 쓰는
  `Pagination` 컴포넌트(`src/components/admin/pagination.tsx`)를 재사용해 표준 페이지
  번호 이동을 붙였다(제5장 제4조 기존 구조 우선).
- `src/components/home/home-view.tsx`: "✅ 현재 이용 가능"/"📋 예약 가능" 섹션 제목 옆에
  "전체보기 →" 링크 추가, 각각 `/events/ongoing`/`/events/reservation-open`으로 연결.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 47 파일 515건 통과(신규 2건: 페이지네이션 range/count 정확성,
  booking_status/SEOUL_YEYAK 합성 OR 조건이 하나의 페이지에 정확히 반영되는지 — range()를
  지원하는 전용 테스트 스텁 신설).
- `npm run build`: 성공, `/events/ongoing`/`/events/reservation-open`/`/api/events/ongoing`/
  `/api/events/reservation-open` 라우트 정상 생성 확인.
- `npm run dev` 로컬 서버 실측: `/api/events/ongoing` 총 702건, `/api/events/reservation-open`
  총 791건 정상 응답(중첩 or/and 쿼리가 실제 DB에서도 에러 없이 동작함을 확인). 1페이지와
  2페이지가 서로 다른 항목을 반환함을 확인(오프셋 정상 동작). 두 페이지(`/events/ongoing`,
  `/events/reservation-open`) 모두 200 응답, 홈 화면에 "전체보기 →" 링크 2개 정상 노출.
