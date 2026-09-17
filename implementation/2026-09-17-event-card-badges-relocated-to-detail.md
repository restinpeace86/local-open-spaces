# [메인 이벤트픽 피드 카드 뱃지를 상세/전체보기로 이동 — Decision 025]

## 구현 대상
`implementation/todo.md` [개선사항 3](메인 피드 프리뷰 카드 뱃지 정리)를 처음엔
Decision 012/013과의 충돌로 스킵했으나, 사용자가 스킵 사유를 확인한 뒤 명시적으로
재지시했다: "맞아 다시 승인할께 메인 이벤트픽 화면에선 노출안할꺼야 전체보기했을때
프리뷰카드나 프리뷰카드 눌렀을때 상세카드쪽에서만... 보이도록.. 해줘" — "삭제"가
아니라 "노출 위치 이동"으로 범위를 명확히 해 재작업했다.

## 구현 일시
2026-09-17

## 결정 기록
`project/decision-log.md`에 **Decision 025**로 기록 — Decision 012("오늘 마감/오늘
한정 뱃지 노출")·013("실내/야외 뱃지 상단 표기")을 개정한다. 상세 배경/결정 이유는
Decision 025 항목 참고.

## 변경 사항

### 대상 파악
지시문의 뱃지 목록("접수 중"/"오늘 마감"/"오늘 한정", 무료/유료, 실내/야외)을
실제 코드에서 추적한 결과, 대상은 `curated_items` 카드(BestPickSlider, 어제
[개선사항 1][개선사항 2]에서 이미 정리함)가 아니라 **메인 이벤트픽 화면(`/`)의
이벤트 카드 2종**이었다:
- `src/components/cards/event-card.tsx` — 그리드/가로 슬라이더 공용 카드.
- `src/components/home/hero-carousel.tsx` — 최상단 배너 캐러셀.

### 메인 피드에서 제거
- **EventCard**: `getDateBannerBadge`(오늘 마감/오늘 한정 상단 배너),
  `topRightBadgeLabel`(booking_status/getEventStatus 기반 접수 상태),
  `priceBadge`(무료/유료), `facilityBadge`(실내/야외)를 전부 제거하고 왼쪽 상단
  카테고리 뱃지만 남겼다. 이미지:텍스트 flex-[5]/flex-[5] 비율 등 뱃지와 무관한
  레이아웃 로직은 그대로 유지.
- **HeroCarousel**: 이 카드는 애초에 카테고리 뱃지가 없었다 — dateBanner/무료·
  유료/실내야외를 전부 제거하면 남는 게 이미지+제목+장소뿐이라 그대로 뒀다(새
  카테고리 뱃지를 억지로 추가하지 않음, 지시 범위 밖).

### "전체보기"(EventListRow) — 변경 없음
`src/components/cards/event-list-row.tsx`는 이미 `getParentalBadges(item)`의 모든
뱃지를 텍스트 뱃지 줄로 보여주고 있어(2026-09-11 도입 당시부터) 손댈 게 없었다.

### 상세 카드(DetailModal)에 추가
`src/components/map/detail-modal.tsx`의 이벤트 분기 "2단 뱃지 영역"에 그동안
없던 두 가지를 추가했다:
- `eventDateBanner`(`getDateBannerBadge`) — 오늘 마감/오늘 한정, 배경색은
  기존 EventCard 배너와 동일한 amber/rose 톤 유지.
- `eventExtraBadges`(`getParentalBadges` 중 `is_free`/`facility_type`만 필터) —
  무료/유료, 실내/야외.
기존에 있던 카테고리·`eventStatus`(예약 마감 기준 상태)·연령대상 뱃지와 나란히
같은 줄에 놓인다 — 새 섹션을 만들지 않고 기존 구조에 자연스럽게 얹었다(제5장
제4조).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test`: 전체 160개 파일 / 1849개 테스트 통과. `event-card.test.tsx`/
  `hero-carousel.test.tsx`의 제거된 뱃지 관련 테스트를 "더 이상 보여주지 않는다"
  단정으로 갱신했고, `detail-modal.test.tsx`에 새 뱃지 노출 테스트 3개를 추가했다.
- `npm run build`: 통과.
- 실제 개발 서버 라이브 확인:
  - 홈 화면(`/`) 서버 렌더링 HTML에 "오늘 마감"/"오늘 한정"/"🎁 무료"/"💰 유료"
    문구가 전혀 없음을 확인(메인 피드에서 완전히 사라짐).
  - Playwright로 "전체보기" 바텀시트를 열어 각 행에 카테고리+예약상태+무료·유료
    (+실내/야외) 뱃지가 그대로 노출되는 것을 스크린샷으로 확인(회귀 없음).
