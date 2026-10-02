-- [스팟/이벤트 상세 "주변 정보" 아코디언 — 주차장 + 키즈친화 식당](2026-10-02 사용자 지시):
-- "키즈친화 식당 하고 주변 주차장으로 해서 하나의 스팟/이벤트 장소에 대하여 주변정보로써
-- 제공하려고 해... 스팟픽 상세페이지나 이벤트픽 상세페이지에 주변 식당영역이랑 주변
-- 주차장영역으로 보여주고자 해." 1차 필터는 직선거리(DB 반경 검색), 펼쳤을 때만 도보
-- 길찾기 API(Tmap, 추후 연동)로 정확한 거리/시간을 계산한다.
--
-- 조사 결과(2026-10-02, 서브에이전트 조사): 키즈친화 식당은 기존 open_spaces +
-- get_nearby_spaces_and_events RPC(category_min 필터)를 그대로 재사용 가능해 이 파일에서
-- 손댈 게 없다. 공영주차장은 open_spaces가 아닌 완전히 새로운 성격의 데이터(서울시
-- 공영주차장 안내 정보 API, GetParkInfo)라 별도 테이블 + 전용 반경검색 RPC가 필요하다.

-- 1. 서울시 공영주차장 테이블 — homeplus_lecture_list(2026-10-02)와 동일한 패턴(서비스롤
--    전용 RLS)을 따른다. open_spaces가 아니므로 좌표 컬럼 타입만 기존 관례(geometry
--    Point,4326)와 맞추고 나머지 구조는 이 소스 전용으로 단순하게 설계한다.
create table if not exists public.seoul_public_parking_lots (
  id bigint generated always as identity primary key,
  pklt_cd text not null unique,
  name text not null,
  address text,
  kind_name text,
  operation_type_name text,
  tel text,
  total_capacity integer,
  is_paid boolean,
  base_fee integer,
  base_minutes integer,
  add_fee integer,
  add_minutes integer,
  weekday_open_time text,
  weekday_close_time text,
  weekend_open_time text,
  weekend_close_time text,
  realtime_info_status text,
  realtime_info_status_name text,
  -- [좌표 없는 행 존재 — 실측 확인] GetParkInfo 응답의 약 14%가 LAT/LOT=0.0으로
  -- 좌표가 비어 있다(2026-10-02 샘플 1,000건 조사) — nullable로 두고 반경검색 RPC가
  -- location is not null 조건으로 자연스럽게 제외한다.
  location geometry(Point, 4326),
  last_data_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.seoul_public_parking_lots is
  '서울시 공영주차장 안내 정보(data.seoul.go.kr GetParkInfo). 스팟/이벤트 상세 "주변 주차장"
   아코디언 전용 — open_spaces가 아니다(공간픽 콘텐츠로 노출되지 않음, 2026-10-02 결정).';

create index if not exists idx_seoul_public_parking_lots_location_geography
  on public.seoul_public_parking_lots using gist ((location::geography));

alter table public.seoul_public_parking_lots enable row level security;

create policy "seoul_public_parking_lots_service_role_all" on public.seoul_public_parking_lots
  for all
  to service_role
  using (true)
  with check (true);

-- 2. 도보 길찾기 결과 캐시 — Tmap 보행자 API(하루 1,000건 무료 한도, 2026-10-02 사용자 확인)
--    쿼터를 아끼기 위해 (출발지, 도착지) 쌍별로 한 번 계산한 결과를 재사용한다. 주차장/
--    식당 위치는 거의 바뀌지 않으므로 캐시 만료 없이 영구 보관하고, 필요시 수동 삭제로
--    재계산한다(TTL 로직은 MVP 범위 밖 — 제1장 제3조 MVP 우선).
--    origin/target id는 open_spaces.id(uuid)와 seoul_public_parking_lots.id(bigint)를
--    함께 담아야 해서 text로 통일한다(두 타입을 한 컬럼에 안전하게 저장하는 가장 단순한
--    방법 — 제1장 제3조 MVP 우선, 과설계 금지).
create table if not exists public.nearby_walking_distance_cache (
  id bigint generated always as identity primary key,
  origin_table text not null check (origin_table in ('open_spaces', 'events')),
  origin_id text not null,
  target_table text not null check (target_table in ('seoul_public_parking_lots', 'open_spaces')),
  target_id text not null,
  distance_meters integer not null,
  duration_seconds integer not null,
  computed_at timestamptz not null default now(),
  unique (origin_table, origin_id, target_table, target_id)
);

comment on table public.nearby_walking_distance_cache is
  '스팟/이벤트 상세 "주변 주차장/식당" 아코디언을 펼쳤을 때 계산하는 Tmap 보행자 경로
   결과 캐시. (출발지,도착지) 쌍은 위치가 거의 바뀌지 않아 한 번 계산하면 계속 재사용한다
   (2026-10-02, Tmap 무료 한도 하루 1,000건 절약 목적).';

alter table public.nearby_walking_distance_cache enable row level security;

create policy "nearby_walking_distance_cache_service_role_all" on public.nearby_walking_distance_cache
  for all
  to service_role
  using (true)
  with check (true);

-- 3. 공영주차장 반경검색 RPC — get_nearby_spaces_and_events(2026-09-27 최신판)와 동일한
--    st_dwithin 패턴. open_spaces 전용 RPC는 재사용할 수 없어(테이블이 다름) 별도로 만든다.
--    이 프로젝트의 기존 nearby RPC들과 동일하게 명시적 grant/revoke 없이 기본 권한(PUBLIC
--    EXECUTE, anon/authenticated 포함)을 그대로 둔다 — 읽기 전용 반경 조회라 노출 위험이
--    없고, 클라이언트(상세 모달)가 service_role 경유 없이 직접 호출해야 하기 때문이다.
create or replace function public.get_nearby_parking_lots(
  user_lng double precision,
  user_lat double precision,
  radius_meters integer default 500
)
returns table(
  id bigint,
  name text,
  address text,
  distance_meters double precision,
  lng double precision,
  lat double precision,
  is_paid boolean,
  total_capacity integer,
  tel text
)
language sql
stable
as $function$
  select
    p.id,
    p.name,
    p.address,
    st_distance(p.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) as distance_meters,
    st_x(p.location) as lng,
    st_y(p.location) as lat,
    p.is_paid,
    p.total_capacity,
    p.tel
  from public.seoul_public_parking_lots p
  where p.location is not null
    and st_dwithin(
      p.location::geography,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    )
  order by distance_meters
  limit 50;
$function$;
