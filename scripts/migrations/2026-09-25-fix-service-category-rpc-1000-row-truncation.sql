-- [노출 중분류 조회 1,000건 truncation 버그 수정](2026-09-25 사용자 지시): "1000건
-- 잘리면 안되지... 내 기준에서 1000건만 보여달라는건 없었잖아" — get_spots_by_
-- service_category_id RPC를 map-explorer.tsx가 카테고리 선택 시 호출하는데,
-- ORDER BY가 없는 채로 PostgREST 기본 max-rows(1,000)에 그대로 걸려 전체를
-- 조용히 잘라 반환하고 있었다. 실측 확인: "캠핑장 / 피크닉장"은 실제 3,227건인데
-- 공개 REST 엔드포인트로 직접 호출하면 content-range 0-999/3227(status 206)로
-- 1,000건만 내려온다. "키즈카페 / 실내놀이터"(2,246건)/"휴양마을"(1,211건)도
-- 동일하게 영향받는다.
--
-- [수정] 클라이언트(get-nearby.ts의 getSpotsByServiceCategory)가 .range()로 페이지를
-- 반복 요청해 전체를 모으도록 바꾸는데, ORDER BY 없는 페이지네이션은 Postgres가
-- 페이지 간 정렬 순서를 보장하지 않아(동시 쓰기/플랜 변경 시) 중복·누락이 생길 수
-- 있다 — 안정적인 유니크 키(s.id) 기준 정렬을 추가해 페이지네이션을 안전하게 만든다.
-- 반환 컬럼/타입/WHERE 조건은 기존과 완전히 동일(재적재 회귀 방지), ORDER BY 한
-- 줄만 추가한다 — 컬럼을 추가하는 게 아니라 이 함수는(get_nearby_spaces_and_events와
-- 달리) DROP 없이 CREATE OR REPLACE로 안전하게 교체 가능하다.
create or replace function public.get_spots_by_service_category(p_service_category_id uuid)
 returns table(id uuid, name character varying, category character varying, distance_meters double precision, item_type character varying, lng double precision, lat double precision, address text, thumbnail_url text, start_date date, end_date date, reservation_start_date timestamp with time zone, reservation_end_date timestamp with time zone, reservation_url text, is_reservation_required boolean, operating_hours text, is_free boolean, info_url text, is_kids_friendly boolean, has_parking boolean, stroller_accessible boolean, facility_type character varying, target_age_group character varying, booking_status character varying, source_type character varying, category_min text, group_id uuid)
 language sql
 stable
as $function$
  select s.id, coalesce(s.standard_name, s.name) as name, s.category,
    -1::float as distance_meters,
    'SPACE'::varchar as item_type,
    st_x(s.location) as lng, st_y(s.location) as lat, s.address,
    null::text as thumbnail_url, null::date as start_date, null::date as end_date,
    null::timestamptz as reservation_start_date, null::timestamptz as reservation_end_date,
    null::text as reservation_url, null::boolean as is_reservation_required,
    s.operating_hours, s.is_free, s.info_url,
    s.is_kids_friendly, s.has_parking, s.stroller_accessible, s.facility_type, s.target_age_group,
    null::varchar as booking_status, s.source_type, s.category_min, s.group_id
  from public.open_spaces s
  where s.service_category_id = p_service_category_id
    and s.location_precision = 'EXACT'
    and (s.group_id is null or s.is_dedup_representative = true)
  order by s.id
$function$;
