# 네이버 예약 버튼 자동 생성 (예약 관련 뱃지 + naver_place_id 기반)

## 구현 대상
사용자 지시(2026-09-25): "지금 나드리픽에서 놀이방식당들 관련 네이버 ID
예시.2095637824 이것들 있는 곳들에 대하여 예약 가능 / 예약 필수 등의
뱃지가 있으면 네이버예약 버튼이 있으면 네이버 예약 버튼을 만들어줘. 네이버
예약 버튼은 https://map.naver.com/p/entry/place/2095637824 마지막에
네이버 ID만 바뀌는 저 url로 리다이렉트 저쪽으로 링크연결하면 돼"

## 기존 구조 확인
스팟 상세 카드에는 이미 "예약 채널" 폴백 체인이 있었다
(`src/components/map/detail-modal.tsx` `secondaryAction`):
`reservation_url`(항상 null) → `curation.naver_booking_url`(관리자가 수동
입력한 실제 네이버 예약 URL) → 자체 간편 예약 폼 → 안내 텍스트. 이번
요청은 이 체인 중간에, **관리자가 `naver_booking_url`을 직접 입력하지
않은 스팟도** `open_spaces.naver_place_id`(이미 존재하는 컬럼, 250건에
채워져 있음)만으로 네이버 플레이스 페이지로 연결하는 버튼을 자동 생성하는
새 폴백 단계를 추가하는 것이다.

"예약 가능/예약 필수 뱃지"는 `spot_curations.curation_badges`(관리자가
큐레이션한 키 배열)를 `/api/spot-curations`가 사람이 읽을 라벨로 바꿔
내려주는 `badge_labels`에서 확인한다(`src/lib/admin/curation-badges.ts` —
일반 음식점은 `reservation_possible`/`reservation_required`, 키즈카페는
`kc_reservation_possible`/`kc_reservation_required` 등 카테고리마다 키는
다르지만 라벨은 항상 "예약 가능"/"예약 필수"로 동일해, 라벨 문자열만
검사하면 카테고리 구분 없이 동작한다).

## 변경 사항
- `src/app/api/spot-curations/route.ts`: 기존에 이미 `open_spaces`를
  조인해 `service_categories.category_name`을 가져오고 있어, 같은 조인에
  `naver_place_id`만 추가했다(별도 조회 없음). 응답 최상위에
  `naver_place_id` 필드로 내려준다.
- `src/components/map/detail-modal.tsx`:
  - `SpotCuration` 타입에 `naver_place_id?: string | null` 추가.
  - `hasReservationBadge()`(뱃지 라벨에 "예약 가능"/"예약 필수" 포함 여부)
    와 `buildNaverPlaceUrl()`(`https://map.naver.com/p/entry/place/{id}`)
    헬퍼 추가.
  - `secondaryAction` 폴백 체인의 `naver_booking_url` 바로 다음 단계로
    `naverPlaceReservationAction`("🟢 네이버 예약")을 끼워 넣었다 — 이미
    `naver_booking_url`이 있으면 그쪽을 그대로 우선하고, 없을 때만 이
    자동 생성 버튼이 대신한다. 스팟픽 카드/그 외 화면(홈·이벤트픽 등) 두
    폴백 체인 모두에 동일하게 적용.

## 검증
- `npx tsc --noEmit` / `npm run test`(201개 파일 2,322개 — 신규:
  `/api/spot-curations` naver_place_id 통과 테스트, detail-modal.tsx의
  뱃지+ID 조합별 노출/미노출/우선순위 테스트 5개) / `npm run build` 모두
  통과.
- 실측(운영 DB): 사용자가 예시로 든 `naver_place_id=2095637824`가 실제로
  "바베큐팩토리 백운호수점"이며, `curation_badges`에 `reservation_possible`
  이 있고 `naver_booking_url`이 `null`임을 확인 — 정확히 이번에 추가한
  자동 생성 경로가 적용되는 실제 사례였다. 전체 DB 기준 이 조건(뱃지+
  naver_place_id 동시 보유)에 해당하는 스팟은 현재 208건.
- 배포 후 실제 화면에서 "바베큐팩토리 백운호수점" 상세를 열어 버튼이
  네이버 플레이스 URL로 정확히 연결되는지 재확인 예정(이 기록 갱신).

## 특이 사항
- `naver_booking_url`이 이미 있는 스팟은 이번 변경으로 아무 영향이 없다
  (기존 버튼이 그대로 우선). 이번 변경은 순수하게 "지금까지 버튼이 아예
  없었던" 208건에 새 버튼을 추가하는 효과만 낸다.
