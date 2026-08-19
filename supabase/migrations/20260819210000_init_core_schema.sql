-- Core schema for local-open-spaces (project/database_schema.md 기준)
-- Decision 001 (Zero-Cost) / Decision 002 (PostGIS 공간 연산 DB 처리) 준수

create extension if not exists "uuid-ossp";
create extension if not exists postgis;

-- 3.1. 열린 공간 (public.open_spaces)
create table if not exists public.open_spaces (
  id uuid primary key default gen_random_uuid(),
  external_id varchar(100) unique not null,
  source_type varchar(50) not null,
  name varchar(255) not null,
  category varchar(50) not null,
  address text not null,
  location geometry(Point, 4326) not null,
  is_free boolean default true,
  operating_hours text,
  info_url text,
  raw_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_open_spaces_location
  on public.open_spaces using gist (location);

-- 3.2. 시한성 이벤트 및 행사 (public.events)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  external_id varchar(100) unique not null,
  space_id uuid references public.open_spaces(id) on delete set null,
  title varchar(255) not null,
  event_type varchar(50) not null,
  start_date date not null,
  end_date date not null,
  is_reservation_required boolean default false,
  reservation_start_date timestamptz,
  reservation_end_date timestamptz,
  reservation_url text,
  location geometry(Point, 4326) not null,
  thumbnail_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_events_location
  on public.events using gist (location);
create index if not exists idx_events_dates
  on public.events (start_date, end_date);
create index if not exists idx_events_reservation
  on public.events (reservation_end_date);

-- 4.1. 주변 열린 공간 및 행사 조회 함수 (project/database_schema.md 4.1)
create or replace function public.get_nearby_spaces_and_events(
  user_lng double precision,
  user_lat double precision,
  radius_meters int default 3000
)
returns table (
  id uuid,
  name varchar,
  category varchar,
  distance_meters float,
  item_type varchar
) as $$
begin
  return query
  select
    s.id,
    s.name,
    s.category,
    st_distance(
      s.location::geography,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
    ) as distance_meters,
    'SPACE'::varchar as item_type
  from public.open_spaces s
  where st_dwithin(
    s.location::geography,
    st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
    radius_meters
  )
  union all
  select
    e.id,
    e.title as name,
    e.event_type as category,
    st_distance(
      e.location::geography,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography
    ) as distance_meters,
    'EVENT'::varchar as item_type
  from public.events e
  where e.is_active = true
    and st_dwithin(
      e.location::geography,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    );
end;
$$ language plpgsql stable;
