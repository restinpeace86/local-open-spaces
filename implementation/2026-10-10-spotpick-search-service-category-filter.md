# 스팟픽 지도 검색도 노출중분류 매핑된 스팟만 노출 (Decision 030 연장)

## 구현 대상
사용자 지시(2026-10-10, Decision 030 후속): "스팟픽에서의 검색이니깐
마찬가지로 노출중분류 매핑된데만 보이도록 일단 바꿔나" — 기본 지도
핀 로딩에만 적용했던 "노출중분류 매핑된 것만" 규칙을, 스팟픽 지도의
검색창(`/api/spots/search`)에도 적용한다.

## 구현 일시
2026-10-10

## 실측 확인 — 공유 엔드포인트라 선택적 플래그로 해결
`/api/spots/search` → `searchSpacesNationwide()`는 3곳에서 공유된다:
1. 스팟픽 지도 검색창(`map-explorer.tsx`) — 이번에 노출중분류 매핑된
   것만 보이게 해야 하는 대상.
2. 맘스픽 글쓰기 시 스팟 매핑(`spot-picker.tsx`) — Decision 030이 이미
   확인한 의도된 예외("노출중분류 없는 장소라도 우리 DB에 있으면 매핑
   가능해야 함"), 계속 무제한 검색이어야 한다.
3. 관리자 스팟 큐레이션 탭 자동완성(2026-09-01) — 관리자가 노출중분류를
   매핑/관리하는 화면이라 역시 무제한 검색이어야 한다(매핑 안 된 스팟을
   찾아서 매핑하는 용도).

하나를 위해 전부 거르면 2·3이 깨지므로, **opt-in 플래그**로 해결했다 —
스팟픽 검색만 새 파라미터를 보내 선택적으로 거른다.

## 변경 사항
- `src/lib/home/get-home-feed.ts`: `searchSpacesNationwide()`에
  `requireServiceCategory = false`(기본값) 파라미터 추가. true일 때만
  `.not('service_category_id', 'is', null)`을 쿼리에 추가한다.
- `src/app/api/spots/search/route.ts`: `require_service_category=true`
  쿼리 파라미터를 읽어 그대로 전달한다. 파라미터가 없으면(기존 호출부
  전부) 기존과 동일하게 무제한 검색.
- `src/components/map/map-explorer.tsx`: 스팟픽 검색 호출에만
  `&require_service_category=true`를 추가.
- `spot-picker.tsx`/관리자 큐레이션 자동완성 호출은 전혀 수정하지
  않음(파라미터를 안 보내 기존 동작 그대로 유지).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(315개 파일 **3,192개**,
  신규 테스트 6개 포함) / `npm run build` 전부 통과.
- 신규 테스트: `get-home-feed.test.ts`(플래그 true/false 각각
  `.not()` 호출 여부 검증), `src/app/api/spots/search/route.test.ts`
  (신규 파일, 파라미터 조합별 전달 검증), `map-explorer.test.tsx`
  (검색 호출 URL에 새 파라미터 포함 검증).
- 라이브 검증(개발 서버, 실제 DB): `q=동대문` 기준
  `require_service_category=true` → 89건, 기본(파라미터 없음) → 201건
  (페이지당 상한). 플래그가 실제로 결과를 줄이는 것을 직접 확인했다.

## 특이 사항
- API 응답에는 `service_category_id` 자체를 아직 내려주지 않는다
  (SPACE_COLUMNS에 없음) — 필터링은 서버에서 끝내고 클라이언트에 그
  컬럼을 노출할 필요가 없어 그대로 뒀다.
- 이번 변경은 지도의 "검색창" 결과에만 적용된다 — 이전에 고친 "기본
  핀 로딩"(Decision 030)과 합쳐 스팟픽 지도의 두 데이터 진입점(핀 로딩
  + 검색)이 이제 동일한 전제(노출중분류 매핑된 것만)를 따른다.
