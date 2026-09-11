# [긴급] get_nearby_spaces_and_events RPC 타입 불일치로 스팟픽/홈 피드 전역 조회 실패 수정 — Step 108

## 구현 대상
`implementation/todo.md` 개선사항2: "유저가 글쓰기 화면에서 장소를 검색할 때
('어느 스팟인가요?') UI에 `structure of query does not match function result
type` DB 에러가 빨간색으로 노출된다."

## 구현 일시
2026-09-11

## 원인 (실측으로 직접 재현·확인)
`get_nearby_spaces_and_events` RPC를 프로덕션 DB에 직접 호출해 재현:
```
select * from get_nearby_spaces_and_events(127.0, 37.5, 5000, 'SPACE', null);
ERROR: 42804: structure of query does not match function result type
DETAIL: Returned type text does not match expected type character varying in column 2.
```
- `2026-09-09-dedup-representative-flag.sql`(Step 82, "그룹 대표 노출")에서 SPACE
  쪽 `name` 컬럼을 `coalesce(s.standard_name, s.name)`으로 바꿨다.
- `open_spaces.standard_name`은 `text`, `open_spaces.name`은 `character
  varying` — `coalesce(text, varchar)`의 결과 타입은 `text`로 확정된다.
- 이 함수는 `language plpgsql`이고 `RETURN QUERY`를 쓰는데, PL/pgSQL의
  `RETURN QUERY`는 **순수 SQL 함수와 달리** 결과를 `RETURNS TABLE` 선언 타입으로
  암묵적으로 캐스팅해주지 않는다 — 선언된 `name character varying`과 실제
  `text` 결과가 충돌해 매 호출마다 에러가 났다.
- **영향 범위**: 이 RPC는 스팟픽 기본 반경 지도(`getNearbySpacesAndEvents`),
  홈 피드, 맘스픽 "내 주변 인기 스팟"(`/api/mom-pick/popular-spots`) 등 앱
  전역이 공유하는 핵심 함수라, `SPACE`를 포함하는 모든 호출 패턴
  (`'SPACE'`/`null`/`p_category_mins` 유무 무관 — SPACE 서브쿼리가 UNION에
  포함되는 순간 컬럼 타입이 파싱 시점에 확정되므로 `'EVENT'`만 요청해도 SPACE
  서브쿼리 타입 정의 자체가 오류를 유발함)에서 Step 82(2026-09-09) 이후 실패
  상태였을 것으로 추정된다. 단위 테스트는 `rpc()`를 mock해 이 문제를 잡아내지
  못했다(제5장 제8조 "실제 화면 동작 확인"에 해당 — 이번에 프로덕션 DB에
  직접 호출해 확인·수정).

## 변경 사항
### `scripts/migrations/2026-09-11-fix-nearby-rpc-standard-name-type-mismatch.sql`
- `coalesce(s.standard_name, s.name)` → `coalesce(s.standard_name,
  s.name)::character varying`로 명시 캐스팅(양쪽 분기 모두). 그 외 로직/시그니처는
  완전히 동일(`create or replace`로 안전하게 재적재).

### 안전성 재확인 (다른 RPC 영향 여부)
- 같은 `coalesce(s.standard_name, s.name)` 패턴이 있는
  `get_spots_by_service_category`/`get_deal_spots`는 **`language sql`** 함수라
  결과를 선언 타입으로 자동 캐스팅한다 — 직접 호출해 정상 동작 확인(3,226건 /
  3건). 이 두 함수는 이번 버그의 영향을 받지 않았다.
- `open_spaces`/`events`의 나머지 모든 문자열 컬럼(`category`, `title`,
  `event_type`, `facility_type`, `target_age_group`, `source_type`,
  `booking_status` 등)은 `information_schema.columns`로 실측 대조해 RETURNS
  TABLE 선언과 정확히 일치함을 확인 — 추가 타입 불일치 없음.

## 검증 (프로덕션 DB 직접 호출)
- `get_nearby_spaces_and_events(127.0, 37.5, 5000, 'SPACE', null)` → 1,001건 ✅
- `get_nearby_spaces_and_events(127.0, 37.5, 5000, 'EVENT', null)` → 181건 ✅
- `get_nearby_spaces_and_events(127.0, 37.5, 5000, null, null)` → 1,001건 ✅
- `get_nearby_spaces_and_events(127.0, 37.5, 30000, 'SPACE', array['공원','캠핑장'])` → 1,001건 ✅
- `get_deal_spots()` → 3건 ✅, `get_spot_group_members(...)` → 2건 ✅ (회귀 없음)
- `npx tsc --noEmit` / `npm run test`(코드 변경 없음이라 기존 스위트 그대로) /
  `npm run build` — 프론트엔드 코드 변경이 없어 이 RPC 관련 회귀 없음 확인.

## 특이 사항
- 이 수정은 SQL 함수 재정의뿐이라 프론트엔드/타입 코드 변경이 없다.
- "글쓰기 화면 장소 검색"(SpotPicker, Step 97)이 트리거였다고 보고됐지만, 실제
  원인은 SpotPicker의 `/api/spots/search`(plain PostgREST 쿼리, RPC 아님)가
  아니라 **같은 화면 흐름에서 함께 호출되는 `/api/mom-pick/popular-spots`**
  (1단계 "내 주변 인기 스팟" 목록, `get_nearby_spaces_and_events` 호출)였다 —
  이 RPC를 쓰는 다른 화면(스팟픽 기본 지도 등)도 동일하게 고쳐졌다.
