# [이벤트픽 화면 카드 구역 개편 — 예약 가능 개칭 + 현재 이용 가능 신규 섹션]

## 구현 대상
1. 메인 캐러셀 자동 슬라이드가 화면 밖으로 스크롤해도 계속 돌아 스크롤을 강제로 끌어올리는
   버그의 재발 여부 확인.
2. "오늘 한정"/"오늘 마감" 메인 카드 영역이 0건일 때 섹션 자체를 숨기는지 확인.
3. "당일 예약 필요" 섹션 제목을 "예약 가능"으로 변경(로직은 그대로 유지).
4. "예약 가능" 섹션 위에 "현재 이용 가능"(오늘이 `start_date`~`end_date` 진행 기간 안에 있는
   행사, 예약 여부 무관) 신규 섹션 추가 — 동일한 가로 스크롤/드래그 방식.

## 구현 일시
2026-08-27

## 1~2. 조사 결과(코드 변경 없음)

`src/components/home/hero-carousel.tsx`를 확인한 결과, 뷰포트 이탈 시 Autoplay를 멈추는
`IntersectionObserver` 로직(2026-08-23 도입, 주석에 정확히 이 버그가 기록돼 있음)이 **이미
정상적으로 존재**했다. `home-view.tsx`의 `heroEvents.length > 0 && (...)` 조건부 렌더링도
이미 적용돼 있어 0건이면 섹션 자체가 렌더링되지 않는다(2026-08-23 Task 9-6-9에서 도입).
정적 코드 리뷰로는 회귀를 재현하거나 원인을 찾지 못했다 — 코드 자체는 두 요구사항을 이미
만족하는 상태였으므로 이 두 항목은 변경하지 않았다. 실제 화면에서 여전히 문제가 재현되면
구체적인 재현 절차(브라우저/기기, 몇 초 후 발생하는지 등)를 알려주시면 다시 조사하겠다.

## 3. "당일 예약 필요" → "예약 가능" 개칭

`src/components/home/home-view.tsx`의 섹션 제목과 `aria-label`만 변경했다. 데이터 소스
(`getReservationOpenEvents`, `booking_status='접수중'` 또는 SEOUL_YEYAK
`raw_data->>SVCSTATNM='접수중'`)와 노출 조건(0건이면 섹션 숨김)은 그대로 유지했다.

## 4. "현재 이용 가능" 신규 섹션

### 백엔드 (`src/lib/home/get-home-feed.ts`)
- `getCurrentlyOngoingEvents(limit, region)` 신규: `is_active=true`, 타겟 연령 4종, 배제
  중분류 16종 제외 등 기존 이벤트픽 3대 조건을 동일하게 적용하고, `start_date <= 오늘 <=
  end_date`(진행 기간에 포함)만 필터링한다. `getReservationOpenEvents`와 달리 소스별 분기가
  필요 없다(예약 상태가 아니라 날짜 컬럼 기준이라 모든 소스가 동일 구조).
- `HomeFeed` 타입에 `currentlyOngoingEvents` 필드 추가, `getHomeFeed()`가 함께 조회.
- `CURRENTLY_ONGOING_FETCH_LIMIT = 20`(다른 섹션과 동일 관례).

### 프론트엔드
- `src/app/page.tsx`: SSR 초기 페칭에 `getCurrentlyOngoingEvents` 추가(Hero/예약가능과 동일한
  방어적 폴백 — 실패해도 빈 배열로 섹션이 숨겨질 뿐 화면 전체가 죽지 않음).
- `src/components/home/home-view.tsx`: `currentlyOngoingEvents` 상태 추가, `/api/home/feed`
  재조회 시 함께 갱신. "✅ 현재 이용 가능" 섹션을 "📋 예약 가능" 섹션 **바로 위**에 배치하고,
  기존 `ReservationOpenSlider`(단순 가로 스크롤 카드 목록, Autoplay 없음)를 items만 바꿔
  그대로 재사용했다(제5장 제4조 기존 구조 우선 — 새 슬라이더 컴포넌트를 만들지 않음). 0건이면
  다른 섹션과 동일하게 섹션 자체를 숨긴다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 44 파일 482건 통과(신규 2건: `getCurrentlyOngoingEvents` 정상 범위 포함/
  하루짜리 행사 포함 케이스). 테스트 하네스(`makeFilteringChainable`)의 `.lte()`/`.gte()`가
  기존에는 no-op이라 날짜 필터를 검증할 수 없었는데, 이번에 실제로 걸러주도록 보강해 의미
  있는 테스트가 가능해졌다(기존 테스트 전부 재확인 — 영향 없음, 33건 그대로 통과).
- `npm run build`: 성공.
- `npm run dev` 로컬 서버 실측: `/api/home/feed` 응답에 `currentlyOngoingEvents: 20`건 정상
  포함, 렌더링된 페이지에 "현재 이용 가능"/"예약 가능" 문구가 정상 노출되고 "당일 예약
  필요"는 더 이상 어디에도 나타나지 않음을 확인.
