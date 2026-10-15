-- [전국 주차장 표준데이터 통합 — 개선사항 1](implementation/todo.md, 2026-10-15)
-- "전국주차장정보표준데이터.csv"(data.go.kr 표준데이터, 18,939건)를 적재할 마스터
-- 테이블. 기존 seoul_public_parking_lots(서울시 GetParkInfo 전용, 850개소)는 이
-- 전국 데이터로 대체한다(제5장 제4조 — 테이블을 두 개로 쪼개 두지 않는다).
--
-- [노상 전면 제외](todo.md 개선사항1 핵심 규칙 2) 갓길 주차는 유모차 동선/안전에
-- 치명적이라 애초에 이 테이블에 들어오지 않는다 — ingest 스크립트가 CSV 단계에서
-- 걸러내고, 혹시 모를 실수를 대비해 CHECK 제약으로도 한 번 더 막는다.
--
-- [주차장관리번호가 유일키가 아님 — 실측 확인](2026-10-15) 18,939건 중 고유값은
-- 17,798개뿐이다 — 서로 다른 지자체 데이터가 합쳐지면서 완전히 다른 시설(다른
-- 이름/주소/제공기관)이 같은 관리번호를 쓰는 충돌이 1,141건 있었다(예:
-- "165-2-000036"이 인천 남동구의 "남동근린공원"과 "장미(정기차량전용)" 둘 다를
-- 가리킴). 그래서 이 컬럼을 PK나 UNIQUE로 쓰지 않고 참고용 일반 컬럼으로만 둔다
-- — ingest는 매번 전체 교체(TRUNCATE + INSERT) 방식으로 동작한다(증분 upsert의
-- 전제인 "안정적인 자연키"가 없으므로).
create table if not exists public.parking_metadata (
  id uuid primary key default gen_random_uuid(),
  management_no text,
  name text not null,
  category_name text,
  -- [노상 제외 — DB 레벨 안전장치] ingest가 이미 걸러내지만, 혹시 실수로 들어와도
  -- 막는다.
  type_name text not null check (type_name in ('노외', '부설')),
  road_address text,
  lot_address text,
  capacity integer,
  fee_type text,
  base_minutes integer,
  base_fee integer,
  extra_unit_minutes integer,
  extra_unit_fee integer,
  day_pass_hours integer,
  day_pass_fee integer,
  monthly_fee integer,
  payment_methods text,
  notes text,
  management_org text,
  phone text,
  has_disabled_parking boolean,
  data_reference_date date,
  provider_code text,
  provider_name text,
  location geometry(Point, 4326),
  -- [개선사항 3 — 다자녀 할인 연동용, 이번 마이그레이션에서 컬럼만 선점]
  is_multi_child_discount boolean not null default false,
  discount_info text,
  -- [개선사항 2 — 서울시 실시간 주차대수 연동용, 이번 마이그레이션에서 컬럼만 선점]
  realtime_available_count integer,
  realtime_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.parking_metadata is
  '전국주차장정보표준데이터(data.go.kr) 기반 주차장 마스터 테이블. 노상 주차장은
   애초에 수집하지 않는다(유모차 동선/안전). seoul_public_parking_lots를 대체.';
comment on column public.parking_metadata.management_no is
  '원본 주차장관리번호 — 유일키 아님(실측 확인, 다른 지자체 데이터 충돌 1,141건).
   참고용으로만 보관.';
comment on column public.parking_metadata.type_name is
  '노외(공용 반경검색 대상) 또는 부설(목적지 건물 전용, open_spaces.parking_id로
   1:1 매칭).';

create index if not exists idx_parking_metadata_location_geography
  on public.parking_metadata using gist ((location::geography));
create index if not exists idx_parking_metadata_management_no
  on public.parking_metadata (management_no);
create index if not exists idx_parking_metadata_type_name
  on public.parking_metadata (type_name);

alter table public.parking_metadata enable row level security;

create policy "parking_metadata_service_role_all" on public.parking_metadata
  for all
  to service_role
  using (true)
  with check (true);

-- [공개 읽기 정책 — 사전에 겪은 실수 재발 방지](2026-10-02 seoul_public_parking_lots
-- 때 이 정책을 빠뜨려 상세 모달에 주차장이 전혀 안 보이는 버그를 겪었다 — 이번엔
-- 테이블 생성 시점부터 함께 추가한다)
create policy "parking_metadata_public_read" on public.parking_metadata
  for select
  to anon, authenticated
  using (true);

-- [부설 주차장 1:1 매칭 — 스팟 테이블에 FK 연결](todo.md 개선사항1 핵심 규칙 3)
alter table public.open_spaces
  add column if not exists parking_id uuid references public.parking_metadata(id);

create index if not exists idx_open_spaces_parking_id
  on public.open_spaces (parking_id)
  where parking_id is not null;

comment on column public.open_spaces.parking_id is
  '부설(건물 전용) 주차장 1:1 매칭 — parking_metadata.type_name=''부설''인 행만
   연결된다. 노외(공용) 주차장은 이 FK 대신 get_nearby_parking_lots 반경검색으로
   노출(2026-10-15 개선사항1).';

-- [기존 주차장 테이블/RPC 병합](todo.md 개선사항1 핵심 규칙 5 — "주차장 정보를
-- 가진 테이블이 여러개 필요없다") seoul_public_parking_lots는 이 전국 표준데이터로
-- 대체되므로 제거한다. 반경검색 RPC는 같은 이름(get_nearby_parking_lots)을 유지해
-- 프런트엔드 호출부를 그대로 재사용하되, 반환 컬럼이 늘어나(요금/결제방법/특기사항/
-- 데이터기준일자 등 노출) 반환 타입이 바뀌므로 먼저 DROP해야 한다.
drop function if exists public.get_nearby_parking_lots(double precision, double precision, integer);

-- [반경검색은 노외만 대상](todo.md 개선사항1 핵심 규칙 4) 부설은 특정 스팟 전용
-- 자원이라 "근처 주차장 아무거나 3곳" 목록에 중복 노출하지 않는다 — open_spaces.
-- parking_id로 그 스팟 자신의 상세페이지에서만 뱃지로 보여준다.
create or replace function public.get_nearby_parking_lots(
  user_lng double precision,
  user_lat double precision,
  radius_meters integer default 500
)
returns table(
  id uuid,
  name text,
  address text,
  distance_meters double precision,
  lng double precision,
  lat double precision,
  capacity integer,
  fee_type text,
  base_minutes integer,
  base_fee integer,
  extra_unit_minutes integer,
  extra_unit_fee integer,
  day_pass_hours integer,
  day_pass_fee integer,
  monthly_fee integer,
  payment_methods text,
  notes text,
  phone text,
  has_disabled_parking boolean,
  data_reference_date date,
  is_multi_child_discount boolean,
  discount_info text,
  realtime_available_count integer
)
language sql
stable
as $function$
  select
    p.id,
    p.name,
    coalesce(p.road_address, p.lot_address) as address,
    st_distance(p.location::geography, st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography) as distance_meters,
    st_x(p.location) as lng,
    st_y(p.location) as lat,
    p.capacity,
    p.fee_type,
    p.base_minutes,
    p.base_fee,
    p.extra_unit_minutes,
    p.extra_unit_fee,
    p.day_pass_hours,
    p.day_pass_fee,
    p.monthly_fee,
    p.payment_methods,
    p.notes,
    p.phone,
    p.has_disabled_parking,
    p.data_reference_date,
    p.is_multi_child_discount,
    p.discount_info,
    p.realtime_available_count
  from public.parking_metadata p
  where p.location is not null
    and p.type_name = '노외'
    and st_dwithin(
      p.location::geography,
      st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    )
  order by distance_meters
  limit 50;
$function$;

-- [전체 교체용 헬퍼] 안정적인 자연키가 없어(위 주석 참고) ingest가 매번 전체를
-- 비우고 새로 넣는다 — supabase-js REST 클라이언트는 조건 없는 TRUNCATE/DELETE를
-- 직접 호출할 수 없어 RPC로 감싼다. open_spaces.parking_id는 on delete 액션이
-- 없는 일반 FK라 먼저 끊어줘야 한다.
--
-- [TRUNCATE 대신 DELETE — 실측 확인](2026-10-15) TRUNCATE는 참조하는 행이 전부
-- null이어도 "다른 테이블이 FK로 참조 중"이라는 사실만으로 거부된다(`cannot
-- truncate a table referenced in a foreign key constraint`) — CASCADE를 쓰면
-- open_spaces까지 통째로 비워지는 대참사라 쓸 수 없다. DELETE는 이 제약이 없어
-- (행 단위 FK 검사만 하고, 참조가 이미 다 끊겨 있으니 통과) 그대로 쓴다.
-- [`where true` 필요 — 실측 확인] 이 프로젝트 DB의 authenticator 롤이 safeupdate
-- 확장을 쓰고 있어(세션 설정 확인) WHERE 없는 UPDATE/DELETE를 전부 거부한다
-- (`DELETE requires a WHERE clause`) — 항상 참인 조건을 명시해 우회한다.
create or replace function public.truncate_parking_metadata()
returns void
language plpgsql
as $function$
begin
  update public.open_spaces set parking_id = null where parking_id is not null;
  delete from public.parking_metadata where true;
end;
$function$;

comment on function public.truncate_parking_metadata() is
  'parking-metadata.mjs 전체교체 ingest 전용 — open_spaces.parking_id 참조를 먼저
   끊고 parking_metadata를 비운다(DELETE, TRUNCATE는 FK 참조 때문에 불가 — 실측
   확인). 매칭(match-parking-to-spots.mjs)은 이 ingest 다음 순서로 재실행해야
   한다.';

-- [기존 seoul_public_parking_lots 대체] 전국 표준데이터가 서울 공영주차장도
-- 포함하므로(실측 확인: 서울 소재 856건) 더 이상 별도 테이블이 필요 없다 — 두
-- 출처를 행 단위로 교차 매칭/병합하는 건 이번 범위에서 하지 않는다(서로 다른
-- 소스라 이름 표기가 달라 자동 매칭 시 오탐 위험, 제3장 제5조 추측 금지). 다만
-- DROP(완전 삭제)은 되돌리기 어려우므로, 혹시 놓친 참조가 있을 경우를 대비해
-- 바로 지우지 않고 이름만 바꿔 보관한다(필요 없다고 확인되면 추후 별도로 삭제).
alter table if exists public.seoul_public_parking_lots
  rename to seoul_public_parking_lots_deprecated_20261015;
