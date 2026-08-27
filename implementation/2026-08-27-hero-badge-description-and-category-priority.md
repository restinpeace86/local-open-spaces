# [메인 카드 유료/무료 뱃지 보완 + 상세보기 설명 추가 + 카드 순서 우선순위]

## 구현 대상
1. 메인(Hero) 카드에서 `is_free===false`(유료)일 때 요금 뱃지가 아예 없던 문제 수정.
2. 상세 팝업(DetailModal)에 본문 설명(`description`)을 추가 — 길면 미리보기 + 더보기/접기
   토글.
3. "현재 이용 가능"/"예약 가능" 두 섹션에서 공공키즈카페류는 앞으로, 자연/과학·교육체험은
   뒤로 가는 부드러운 정렬 적용.

## 구현 일시
2026-08-27

## 1. Hero 카드 유료/무료 뱃지
`src/components/home/hero-carousel.tsx`: `is_free === true`일 때만 "🎁 무료" 뱃지를 보여주고
`is_free === false`(유료)면 아무 뱃지도 없어 요금 정보를 전혀 알 수 없었다(실측 확인 —
EventCard/getParentalBadges는 이미 두 상태 모두 보여주고 있었는데 HeroCarousel만 누락).
"💰 유료" 뱃지를 추가했다. `is_free === null`(정보 없음)은 기존처럼 단정 표시하지 않고
계속 숨긴다.

## 2. 상세보기 설명(description) 추가
- `src/lib/spaces/get-nearby.ts`/`src/lib/home/get-home-feed.ts`: `NearbyItem`/
  `EVENT_COLUMNS`/`EventRow`/`toEventItem()`에 `description` 추가(추가 조회 비용 없음 —
  events 테이블에 이미 있는 컬럼).
- `src/components/map/detail-modal.tsx`: 제목 바로 아래에 설명을 보여준다. 60자 이하면 그대로,
  넘으면 2줄 미리보기(`line-clamp-2`) + "더보기"/"접기" 토글 버튼. 모바일이 주 사용 환경
  (Decision 004)이라 터치에서 아예 동작하지 않는 마우스 호버 툴팁 대신, 모바일/데스크톱
  동일하게 동작하는 클릭 토글을 택했다. 공간(SPACE)에는 적용하지 않는다(이벤트 전용 —
  공간은 이 컬럼을 조회하지 않음).

## 3. 카드 순서 우선순위 (`src/lib/home/get-home-feed.ts`)
"현재 이용 가능"(`getCurrentlyOngoingEvents`)/"예약 가능"(`getReservationOpenEvents`) 두
섹션에 한해, 공공키즈카페류(`공공키즈카페`/`어린이실내놀이터`)는 앞쪽 우선순위로, 자연/과학·
교육체험은 뒤쪽 우선순위로 정렬하는 `sortByCategoryMinPriority()`를 기존 지역/거리 정렬
뒤에 추가로 적용했다(Array.sort는 stable이라 같은 우선순위 안에서는 기존 지역/거리 순서가
그대로 유지된다). 지시받지 않은 나머지 카테고리는 전부 동일한 중간 순위로 둬 임의로 전체
순위를 추측하지 않았다(제3장 제5조). 다른 섹션(홈 피드/카테고리별/테마별/검색)에는 적용하지
않았다 — 사용자가 이 두 섹션만 명시했다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 46 파일 506건 통과(신규 9건: HeroCarousel 유료/무료/정보없음 3건,
  DetailModal 설명 표시 4건, get-home-feed 카드 순서 우선순위 2건).
- `npm run build`: 성공.
- `npm run dev` 로컬 서버 실측:
  - 홈 페이지에 "💰 유료"(41건)/"🎁 무료"(1건) 뱃지 둘 다 정상 렌더링 확인.
  - `/api/home/search?q=체험` 실제 검색 결과에서 description이 실제 채워진 행사("[도산안창호
    기념관] 2026 어린이 역사체험" — "만들기 체험과 맞춤형 해설을 통한...")를 확인해 DB→API→
    화면 파이프라인이 끝까지 연결됨을 확인.
