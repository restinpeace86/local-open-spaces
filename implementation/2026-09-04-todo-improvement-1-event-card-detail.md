# [개선사항1] 이벤트픽 카드 및 상세 화면 개선

## 구현 대상
`implementation/todo.md` [개선사항1] 4개 항목:
1. open_spaces 연동 카드의 "상시" 태그 완전 제거.
2. "현재 위치에서 X km" 거리 정보 프리뷰 패널 상시 노출 + 성능 최적화(사전 계산).
3. 부정확한 예약 안내("예약불필요"/"현장 방문") 정돈.
4. 상세 모달 "지도에서 보기" → "지도에서 길찾기" 버튼명 변경.

## 구현 일시
2026-09-04

## 변경 사항

### 1. "상시" 태그 제거
`getEventStatus()`(`src/lib/spaces/event-status.ts`)는 open_spaces 공유 항목(캠핑장 등,
`toSpaceItem`이 start_date/end_date를 둘 다 null로 채움)에 대해 `{ label: '상시', ... }`를
반환한다 — 이 값을 실제로 렌더링하는 곳은 `EventCard`(`src/components/cards/event-card.tsx`)
상태 뱃지(카드 이미지 우상단) 단 한 곳뿐이었다(실측 확인 — `SpaceGridCard`/
`DetailModal`은 애초에 `getEventStatus`를 호출하지 않음). `getEventStatus()` 자체의
로직/반환값은 그대로 두고(다른 소비처가 생길 가능성을 열어둠, 단위 테스트도 그대로
유지), `EventCard`에서 `status.label === '상시'`일 때만 뱃지 렌더링을 건너뛰도록 했다 —
다른 상태값(접수중/오늘 마감/예정/진행중)은 그대로 노출된다.

### 2. 거리 정보 상시 노출 + 성능
실측 확인 결과 "성능 최적화(사전 계산)" 요건은 **이미 기존 구조로 충족돼 있었다** —
`distance_meters`는 `sortByDistanceIfKnown()`(`src/lib/home/get-home-feed.ts`)이 서버에서
요청당 딱 한 번 Haversine으로 계산해 `NearbyItem`에 담아 클라이언트로 내려보내고, 카드
렌더링 코드 어디에도 렌더링마다 재계산하는 로직이 없었다(컴포넌트 전체를 검색해 확인 —
`Math.sqrt`/haversine류 호출이 그 서버 함수 한 곳뿐). 그래서 새로 만든 것은 "화면에
보여주는 부분"뿐이다: `EventCard`의 텍스트 영역에 `DetailModal`과 동일한 문구/포맷
("현재 위치에서 {formatDistance(...)}")을 상시 노출하도록 줄을 추가했다.
`distance_meters === -1`(위치 미상 sentinel)일 때는 숨긴다.

### 3. 예약 안내 뱃지 신뢰도 정비
지시문의 "정보가 불충분한 상태에서 잘못된 정보를 줄 수 있는 뱃지"라는 표현의 실제
근거를 데이터에서 추적했다. `getReservationAvailabilityTag()`(`event-status.ts`)는
`is_reservation_required === false`일 때 "✅ 예약불필요 / 현장방문"을 확정적으로
보여줬는데, 수집 파이프라인 전체(`scripts/ingest/adapters/lib/schema-mapper.mjs`의
`buildEventRow`, 그리고 이 필드를 다루는 모든 어댑터)를 실측으로 뒤져본 결과:
- `buildEventRow`의 `isReservationRequired` 기본값 자체가 `false`다.
- 실제로 이 필드를 명시적으로 `buildEventRow`에 넘기는 어댑터는 **`seoul-yeyak-
  adapter.mjs`의 `true`(SEOUL_YEYAK 소스는 전건 사전 예약 필수, 진짜 근거 있음)
  단 한 곳뿐**이다.
- `gg-culture-events-adapter.mjs`/`seoul-culture-events.mjs`/`tour-api-festival.mjs`에도
  `isReservationRequired: false`가 등장하지만, 전부 `deriveBookingStatus()`(다른
  필드 계산용) 호출에만 쓰이고 `buildEventRow`에는 한 번도 전달되지 않는다.
- 즉 오늘 DB에 있는 모든 `is_reservation_required = false` 값은 "예약 불필요를
  확인함"이 아니라 "그 수집기가 이 필드를 아예 다루지 않아 기본값으로 떨어진 것"뿐이다
  (실측: `events` 테이블에서 `is_reservation_required=false and reservation_url is
  null`인 766건이 전부 이 케이스).

근거 있는 "사전예약필요"(true)만 남기고, 근거 없는 "예약불필요 / 현장방문"(false)
단정은 완전히 제거했다(수정이 아니라 제거 — 확정할 수 없는 사실을 애매한 문구로
바꿔치기하는 대신, 정보가 없으면 아예 보여주지 않는 쪽을 택함, 제3장 제5조 추측 금지).

### 4. 버튼명 변경
`DetailModal`의 지도 CTA 라벨을 `'🗺️ 지도에서 보기'` → `'🗺️ 지도에서 길찾기'`로
바꿨다. 이 버튼이 여는 `MapPreviewModal` 안에는 이미 "🧭 현재 위치에서 길찾기"
기능(2026-09-03 도입, 카카오모빌리티 인앱 경로 표시)이 있어, 버튼명이 실제 제공
기능을 더 정확히 안내하도록 했다(기능 자체는 변경 없음, 라벨만 교체).

## 특이 사항
- 예약 안내 뱃지 제거는 지시문이 명시하지 않은 근본 원인(어댑터 전수 조사)까지
  실측으로 확인한 뒤 결정한 것이라 이 기록에 상세히 남긴다 — 향후 어댑터가 이
  필드를 실제로 다루게 되면(신규 소스 추가 등) 이 판단을 재검토해야 한다.
- 검증: `npx tsc --noEmit` 통과, `npm run test`(99개 파일/1045개 테스트) 전체 통과,
  `npm run build` 프로덕션 빌드 통과.
