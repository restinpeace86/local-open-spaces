-- [이벤트픽 "전체보기" DB 레벨 거리 계산/페이지네이션 전면 리팩토링](2026-09-15 사용자
-- 지시): 기존 fetchAllRowsChunked(전체 행을 애플리케이션 메모리로 모아 JS에서
-- 거리순 정렬+페이지 자르기)를 걷어내고, PostGIS 거리 계산 + LIMIT/OFFSET 페이지네이션을
-- DB 레벨에서 수행한다.
--
-- [PostGIS vs 단순 수학 공식(Haversine) 선택] PostGIS를 채택한다:
--   1) 이 프로젝트는 이미 PostGIS를 전면 채택하고 있다 — events.location/open_spaces.location이
--      이미 geography(Point,4326) 컬럼이고, get_nearby_spaces_and_events/
--      get_nearest_spot_weather 등 기존 RPC가 전부 PostGIS(ST_Distance/ST_DWithin/<->
--      KNN 연산자)를 쓴다(제5장 제4조 기존 구조 우선 — 이미 검증된 방식을 재사용).
--   2) [인덱스 활용 방식에 대한 정확한 설명] 이 쿼리는 get_nearby_spaces_and_events처럼
--      "테이블 전체에서 가장 가까운 N개"를 찾는 순수 KNN 검색이 아니라, is_active/
--      end_date/target_audience/category_min 등으로 이미 상당히 좁혀진(보통 수백 건
--      이하) 후보군을 거리순으로 정렬하는 것이다 — 이 좁히기 단계가 기존 btree 인덱스
--      (idx_events_active_enddate/idx_events_display_filter/idx_events_dates)를 그대로
--      활용해 원래의 성능 문제(141,980행 전체를 애플리케이션 메모리로 퍼올리던 것)를
--      해결한다. 거리 계산 자체(ST_Distance)는 이 좁혀진 후보군에만 적용되므로 KNN
--      인덱스(`<->` 연산자)가 굳이 필요 없다 — 그럼에도 PostGIS를 쓰는 이유는 (a) 이미
--      geography 타입/GIST 인덱스(idx_events_location_geography)가 있어 별도 준비
--      없이 정확한 구면 거리를 바로 쓸 수 있고, (b) 반경 조건이 추가되는 미래 확장
--      (예: "10km 이내만") 시 ST_DWithin으로 인덱스를 그대로 활용할 수 있는 여지를
--      남겨두기 때문이다. 순수 SQL Haversine 공식은 이런 여지가 전혀 없다(항상 전체
--      계산, 인덱스 활용 불가).
--   3) ST_Distance/ST_DWithin은 지구 타원체(WGS84) 기준 정확한 거리를 반환하고
--      경계값(극지방 근처, 날짜변경선 등) 예외 처리가 이미 검증돼 있다 — 손으로 짠
--      Haversine 공식은 이런 경계 케이스에서 미묘한 오차가 날 수 있고, 이 프로젝트
--      범위(대한민국 국내)에선 차이가 거의 없더라도 굳이 재검증이 필요한 코드를 새로
--      만들 이유가 없다.
--
-- [페이지네이션 방식] LIMIT/OFFSET을 채택한다(Keyset 대신):
--   - 기존 PagedEvents 타입이 이미 `total`(전체 건수)을 요구하고, 프론트(무한 스크롤
--     바텀시트)가 이 값으로 "더 불러올 페이지가 남았는지" 판단한다 — Keyset(다음
--     페이지 커서만 앎)으로는 총 건수를 함께 구하기 어렵다.
--   - 이 화면의 실제 규모(이벤트픽 전체보기, 최대 수천 건 단위)에서는 OFFSET이 깊어져도
--     (수십 페이지 수준) 성능 문제가 실질적으로 나타나지 않는다 — 수백만 행 규모의
--     무한 피드였다면 Keyset을 권했겠지만, 이번 스케일에는 과설계다.
--   - count(*) over()로 페이지 안에서 총 건수를 함께 받아(추가 왕복 없음) 기존
--     PagedEvents.total 계약을 그대로 유지한다.

-- ── 헬퍼 1: 운영 요일/반복 규칙 판정 ──────────────────────────────────────────
-- src/lib/spaces/event-operating-schedule.ts의 isEventOperatingOn()과 동일한 로직을
-- SQL로 그대로 옮긴다(정기 휴무 최우선 → 매월 N번째 요일 규칙 → 매주 반복 요일 →
-- 아무 규칙 없으면 항상 운영). Postgres EXTRACT(DOW FROM ...)는 세션 타임존
-- 기준이며, Supabase 기본 세션 타임존(UTC)이 이 프로젝트의 Node 서버(Vercel,
-- 기본 UTC)와 동일해 기존 JS의 new Date().getDay() 요일 판정과 일치한다(기존 앱
-- 전체가 이미 이 UTC 기준 요일/날짜 계산에 의존하고 있어 — 예:
-- deactivate-expired-events.mjs 주석 참고 — 여기서 새로 KST 보정을 넣지 않는다,
-- 범위 밖의 별도 결정 사항).
create or replace function public.is_event_operating_on(
  p_operating_weekdays text[],
  p_excluded_weekdays text[],
  p_operating_nth_weekdays text[],
  p_at timestamptz default now()
)
returns boolean
language sql
immutable
as $$
  select case
    -- 정기 휴무: 항상 최우선으로 검사(어느 허용 규칙과도 조합 가능).
    when p_excluded_weekdays is not null and array_length(p_excluded_weekdays, 1) > 0
      and (array['SUN','MON','TUE','WED','THU','FRI','SAT'])[extract(dow from p_at)::int + 1]
        = any(p_excluded_weekdays)
    then false
    -- 매월 N번째 요일 패턴: operating_weekdays보다 우선하는 대안 규칙.
    when p_operating_nth_weekdays is not null and array_length(p_operating_nth_weekdays, 1) > 0
    then (
      ceil(extract(day from p_at) / 7.0)::int || '-' ||
      (array['SUN','MON','TUE','WED','THU','FRI','SAT'])[extract(dow from p_at)::int + 1]
    ) = any(p_operating_nth_weekdays)
    -- 매주 반복 허용 요일.
    when p_operating_weekdays is not null and array_length(p_operating_weekdays, 1) > 0
    then (array['SUN','MON','TUE','WED','THU','FRI','SAT'])[extract(dow from p_at)::int + 1]
      = any(p_operating_weekdays)
    -- 아무 규칙도 없으면 항상 운영.
    else true
  end
$$;

comment on function public.is_event_operating_on(text[], text[], text[], timestamptz) is
  'src/lib/spaces/event-operating-schedule.ts의 isEventOperatingOn()과 동일 로직(SQL 이식본).
   두 곳 중 하나를 고치면 반드시 다른 쪽도 함께 고쳐야 한다(제5장 제4조 — 두 런타임
   (scripts/mjs vs src/ts)이 코드를 공유하지 않는 이 프로젝트의 기존 관례와 동일한
   이유로 여기 SQL도 별도 이식본이다).';

-- ── 헬퍼 2: 텍스트에서 광역(도/광역시) 코드 추출 ──────────────────────────────
-- src/lib/spaces/province.ts의 getProvinceFromText()와 동일한 목적 — 이미 있는
-- public.normalize_address_region_prefix(장/단축 표기 통일, 2026-09-09 도입)를
-- 재사용해 앞 2글자만 취하고, 실제 17개 광역 코드 중 하나인지 검증한다(검증 없이
-- 앞 2글자만 취하면 "경기도서관"처럼 우연히 "경기"로 시작하는 일반 명칭까지 광역으로
-- 오판할 위험이 있다 — 이 오탐지 자체는 TS 원본에도 동일하게 존재하는 한계이지 이
-- SQL 이식이 새로 만든 문제는 아니다).
create or replace function public.spot_province_code(p_text text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when left(public.normalize_address_region_prefix(btrim(coalesce(p_text, ''))), 2) = any(
        array['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주']
      )
      then left(public.normalize_address_region_prefix(btrim(coalesce(p_text, ''))), 2)
      else null
    end,
    ''
  )
$$;

-- events는 open_spaces와 달리 공용 address 컬럼이 없다(venue_name/sigungu_name만
-- 있음) — province.ts의 isSpotInProvinces()와 동일하게 venue_name을 먼저 시도하고
-- (대부분 실패 — 장소명은 광역 접두로 시작하지 않는 경우가 대부분), 실패하면
-- sigungu_name으로 판정한다(korea-region-lookup.mjs의 normalizeSigunguProvince가
-- 수집 시점에 이미 광역 접두를 붙여 저장해 두므로 이쪽이 실제 판정 성공률이 높다).
create or replace function public.event_province_code(p_venue_name text, p_sigungu_name text)
returns text
language sql
immutable
as $$
  select coalesce(public.spot_province_code(p_venue_name), public.spot_province_code(p_sigungu_name))
$$;

comment on function public.event_province_code(text, text) is
  'src/lib/spaces/province.ts의 isSpotInProvinces() 판정 로직(SQL 이식본) — 실제 광역
   허용 목록(getVisibleProvinces, 예: 경기↔서울 상호 포함) 계산은 TS에 그대로 두고
   (이미 검증된 로직 중복 방지), 이 함수는 "이 행이 어느 광역에 속하는지"만 판정해
   호출부가 = any(p_visible_provinces)로 비교하게 한다.';

-- ── 메인 RPC: 이벤트픽 "전체보기" 페이지 조회 ─────────────────────────────────
-- p_mode로 기존 3개 함수(getTodayEventsPage/getCurrentlyOngoingEventsPage/
-- getReservationOpenEventsPage)의 서로 다른 날짜/상태 조건을 하나의 RPC 안에서
-- 분기한다 — 공통 조건(is_active/target_audience/category_min 제외 목록/카테고리
-- 필터/광역 필터/운영 요일 규칙/거리 계산/페이지네이션)을 한 곳에 모아 중복을
-- 없앤다.
create or replace function public.get_events_browse_page(
  p_mode text, -- 'TODAY_DEADLINE' | 'ONGOING' | 'RESERVATION_OPEN'
  p_page integer default 1,
  p_page_size integer default 24,
  p_category_mins text[] default null,
  p_visible_provinces text[] default null, -- null = 광역 필터 없음(전체 노출)
  p_user_lat double precision default null,
  p_user_lng double precision default null,
  p_now timestamptz default now()
)
returns table (
  id uuid,
  title character varying,
  description text,
  event_type character varying,
  category_min text,
  target_audience text,
  location geometry,
  location_precision character varying,
  thumbnail_url text,
  start_date date,
  end_date date,
  reservation_start_date timestamptz,
  reservation_end_date timestamptz,
  reservation_url text,
  is_reservation_required boolean,
  is_free boolean,
  is_kids_friendly boolean,
  has_parking boolean,
  stroller_accessible boolean,
  facility_type character varying,
  target_age_group character varying,
  booking_status character varying,
  venue_name text,
  sigungu_name text,
  price_text text,
  source_url text,
  operating_weekdays text[],
  excluded_weekdays text[],
  operating_nth_weekdays text[],
  distance_meters double precision,
  total_count bigint
)
language plpgsql
stable
as $function$
declare
  v_today date := (p_now)::date;
  v_user_point geography;
  v_offset integer := greatest(0, (greatest(1, p_page) - 1) * greatest(1, p_page_size));
  v_limit integer := greatest(1, p_page_size);
begin
  if p_user_lat is not null and p_user_lng is not null then
    v_user_point := st_setsrid(st_makepoint(p_user_lng, p_user_lat), 4326)::geography;
  end if;

  return query
  with matched as (
    select
      e.id, e.title, e.description, e.event_type, e.category_min, e.target_audience,
      e.location, e.location_precision, e.thumbnail_url, e.start_date, e.end_date,
      e.reservation_start_date, e.reservation_end_date, e.reservation_url, e.is_reservation_required,
      e.is_free, e.is_kids_friendly, e.has_parking, e.stroller_accessible, e.facility_type,
      e.target_age_group, e.booking_status, e.venue_name, e.sigungu_name, e.price_text, e.source_url,
      e.operating_weekdays, e.excluded_weekdays, e.operating_nth_weekdays,
      case when v_user_point is not null then st_distance(e.location::geography, v_user_point) end as distance_meters
    from public.events e
    where e.is_active = true
      and e.target_audience in ('INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY')
      and e.category_min is not null
      and e.category_min not in (
        '강당', '강의실', '골프장', '다목적실', '녹화장소', '단체봉사', '보건소', '장애인버스',
        '서북병원', '어린이병원', '청년공간', '전문/자격증', '청년정보', '회의실', '정보통신', '주민공유공간'
      )
      and (p_category_mins is null or e.category_min = any(p_category_mins))
      and (
        p_visible_provinces is null
        or public.event_province_code(e.venue_name, e.sigungu_name) is null
        or public.event_province_code(e.venue_name, e.sigungu_name) = any(p_visible_provinces)
      )
      and public.is_event_operating_on(e.operating_weekdays, e.excluded_weekdays, e.operating_nth_weekdays, p_now)
      and (
        case p_mode
          when 'TODAY_DEADLINE' then
            e.end_date = v_today
            and (e.is_reservation_required = false or e.reservation_end_date >= p_now or e.reservation_end_date is null)
          when 'ONGOING' then
            e.start_date <= v_today and e.end_date >= v_today
          when 'RESERVATION_OPEN' then
            e.end_date >= v_today
            and (
              e.booking_status = '접수중'
              or (e.source = 'seoul_public_reservation' and (e.raw_data ->> 'SVCSTATNM') = '접수중')
            )
          else false
        end
      )
  ),
  counted as (
    select *, count(*) over() as total_count from matched
  )
  select
    c.id, c.title, c.description, c.event_type, c.category_min, c.target_audience,
    c.location, c.location_precision, c.thumbnail_url, c.start_date, c.end_date,
    c.reservation_start_date, c.reservation_end_date, c.reservation_url, c.is_reservation_required,
    c.is_free, c.is_kids_friendly, c.has_parking, c.stroller_accessible, c.facility_type,
    c.target_age_group, c.booking_status, c.venue_name, c.sigungu_name, c.price_text, c.source_url,
    c.operating_weekdays, c.excluded_weekdays, c.operating_nth_weekdays,
    c.distance_meters, c.total_count
  from counted c
  order by
    case when v_user_point is not null then c.distance_meters end asc nulls last,
    case when v_user_point is null then c.end_date end asc
  offset v_offset
  limit v_limit;
end;
$function$;

comment on function public.get_events_browse_page(text, integer, integer, text[], text[], double precision, double precision, timestamptz) is
  '이벤트픽 "전체보기" 페이지 조회(2026-09-15 DB 레벨 리팩토링) — 기존
   fetchAllRowsChunked+finalizeBrowsePage(JS 메모리 전체 로드+정렬+페이지 자르기)를
   대체. get-home-feed.ts의 getTodayEventsPage/getCurrentlyOngoingEventsPage/
   getReservationOpenEventsPage 3개 함수가 p_mode만 다르게 호출한다.';
