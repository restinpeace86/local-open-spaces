# [카드 표준 중분류 표시 전환 + 상세보기 연령대상 추가]

## 구현 대상
1. 이벤트 카드 상단 뱃지를 event_type 기반 5대 UI 카테고리(예: "체험·클래스") 대신 실제
   표준 중분류(`category_min`, 예: "도시농업")로 표시.
2. 상세보기(DetailModal)에 행사 기간/예약 안내 외에 연령대상(`target_audience`)을
   "초등학생 이상"/"미취학"/"가족"/"유아" 등 한글 라벨로 추가 표시.

## 구현 일시
2026-08-27

## 배경
`NearbyItem`/`EVENT_COLUMNS`에 애초에 `category_min`/`target_audience`가 선택돼 있지 않아
(이벤트픽 노출 필터로만 쓰이고 화면에는 전달되지 않음) 카드/상세보기가 접근할 수 없었다.
두 값 모두 이미 필터 조건으로 조회 중이므로 추가 조회 비용 없이 select 목록에만 포함하면
됐다.

## 변경 사항
- `src/lib/spaces/get-nearby.ts`: `NearbyItem`에 `category_min?`/`target_audience?` 추가
  (SPACE 경로는 해당 컬럼이 없어 optional/undefined로 남는다).
- `src/lib/home/get-home-feed.ts`: `EVENT_COLUMNS`/`EventRow`/`toEventItem()`에
  `category_min`/`target_audience` 추가.
- `src/lib/spaces/target-audience-meta.ts`(신규): `getTargetAudienceLabel()` — target_audience
  값을 한글 라벨로 변환(`INFANT`→유아, `KIDS_PRE`→미취학, `KIDS_SCHOOL`→초등학생 이상,
  `FAMILY`→가족, 그 외 방어적 매핑; `OTHER`(수동 검수 대상)나 매핑 안 된 값은 노출 부적절해
  `null`로 숨김).
- `src/components/cards/event-card.tsx`: 카드 상단 뱃지를 `item.category_min ?? meta.label`로
  변경(색상은 기존 `meta.color` 유지 — 상위 5대 카테고리 색 코딩은 그대로 시각적 구분에
  활용).
- `src/components/map/detail-modal.tsx`: 상단 뱃지도 이벤트에 한해 동일하게 전환
  (`isEvent ? (item.category_min ?? meta.label) : meta.label` — 공간은 기존 그대로).
  "행사 기간" 바로 아래에 "연령대상" 행 신규 추가(값이 있을 때만 노출).

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 44 파일 486건 통과(신규 4건: DetailModal의 category_min 뱃지 전환/공간
  미전환/연령대상 표시/연령대상 없을 때 숨김).
- `npm run build`: 성공.
- `npm run dev` 로컬 서버 실측: `/api/home/feed` 응답에 `category_min: "교육체험"`,
  `target_audience: "KIDS_SCHOOL"` 정상 포함, 렌더링된 홈 페이지에 "교육체험" 뱃지가 실제로
  노출되는 것을 확인(DetailModal은 클릭 시에만 렌더링돼 정적 페이지에서는 확인 불가 —
  단위 테스트로 대체 검증).
