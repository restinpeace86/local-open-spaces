-- /admin/data-grid 개편: 탭별 필터 옵션(출처/카테고리/원천 중분류/접수상태)을 최소 호출로
-- 가져온다. get_sigungu_options()와 동일하게 DISTINCT 목록 조회는 DB에서 처리한다(제5장
-- 제4조 기존 구조 우선).
--
-- 성능 참고(2026-08-25 실측): open_spaces(12만 건)에 대한 요약 집계(count(*) filter (...))는
-- 단일 패스로 묶어도 PostgREST RPC 경로의 8초 statement_timeout에 걸쳐 성공/타임아웃이
-- 반복적으로 갈렸다(같은 쿼리를 반복 호출해도 4.8초~8.6초로 편차가 큼 — 커스텀 RPC 함수
-- 호출이 네이티브 PostgREST 카운트 쿼리(.select(..., {count, head:true}))보다 훨씬 느리고
-- 불안정함을 실측으로 확인). 그래서 요약 메트릭(get_admin_data_grid_summary 상당)은 DB
-- 함수로 만들지 않고, src/app/api/admin/data-grid/summary/route.ts에서 네이티브
-- count/head 쿼리 여러 개로 구현했다 — 실측상 개별 호출은 0.1~1.5초로 훨씬 빠르고 안정적이다.
--
-- 요금/예약URL 미비 진단은 실제 DB 컬럼(is_free/info_url/reservation_url) 기준이다 — 사용자
-- 지시문의 use_pay/payatnm/svcurl은 원천 API 필드명이고, 그 값들은 최종적으로 is_free/
-- info_url/reservation_url 컬럼에 매핑돼 저장된다(신규 컬럼을 만들지 않고 기존 스키마 사용).

-- 실측 확인(2026-08-25, [전체 파이프라인 일괄 가동] 후속): source_type+category 2개 컬럼을
-- 한 RPC로 묶었던 버전이 테이블이 12만→13.9만 건으로 늘어난 뒤 재현성 있게 8초 타임아웃을
-- 넘기기 시작했다(반복 실측 2회 모두 8.2초) — array_agg(DISTINCT ...)는 컬럼마다 내부 정렬이
-- 필요해 컬럼 수가 늘수록 비용이 선형 이상으로 증가하고, 이 테이블은 8초 한도에 항상
-- 아슬아슬하게 걸쳐 있어(이전 실측들 참고) 컬럼을 하나만 늘려도 쉽게 넘긴다. 컬럼당 완전히
-- 독립된 단일 컬럼 RPC로 쪼개 각각 한도 안에서 확실히 끝나도록 한다(page.tsx에서 Promise.all
-- 병렬 호출 + 개별 실패는 빈 배열로 무중단 처리 — 이미 그렇게 구현돼 있음).
drop function if exists public.get_open_spaces_category_options();
create or replace function public.get_open_spaces_source_type_options()
returns table (source_types text[]) as $$
  select array_agg(distinct source_type order by source_type) filter (where source_type is not null) from public.open_spaces;
$$ language sql stable;

create or replace function public.get_open_spaces_category_options()
returns table (categories text[]) as $$
  select array_agg(distinct category order by category) filter (where category is not null) from public.open_spaces;
$$ language sql stable;

create or replace function public.get_open_spaces_source_options()
returns table (sources text[]) as $$
  select array_agg(distinct source order by source) filter (where source is not null) from public.open_spaces;
$$ language sql stable;

-- raw_data->>'MINCLASSNM'/'SVCSTATNM'는 서울시 예약 API(SEOUL_YEYAK, source='seoul_public_
-- reservation') 원본 필드라 다른 출처에는 없다. [전체 파이프라인 일괄 가동](2026-08-25)으로
-- 17개 어댑터 전부가 source 컬럼을 채우게 되면서 `WHERE source IS NOT NULL`의 선택도가
-- 1%→97%로 뒤집혀 idx_open_spaces_source의 Index Only Scan 이점이 사라졌다(실측: 5.1초로
-- 급증). source 값을 'seoul_public_reservation'로 정확히 지정하면 다시 선택적인 동등 비교가
-- 되어 인덱스가 빠르게 쓰인다(실측: 4ms).
drop function if exists public.get_open_spaces_seoul_yeyak_options();
create or replace function public.get_open_spaces_seoul_yeyak_options()
returns table (
  min_class_names text[],
  svc_stat_nms text[]
) as $$
  select
    array_agg(distinct raw_data->>'MINCLASSNM' order by raw_data->>'MINCLASSNM')
      filter (where raw_data->>'MINCLASSNM' is not null),
    array_agg(distinct raw_data->>'SVCSTATNM' order by raw_data->>'SVCSTATNM')
      filter (where raw_data->>'SVCSTATNM' is not null)
  from public.open_spaces where source = 'seoul_public_reservation';
$$ language sql stable;

drop function if exists public.get_open_spaces_filter_options();

-- events(약 2.6만 건)는 open_spaces보다 훨씬 작아 전체 스캔 비용이 낮다 — 별도 최적화 없이
-- 단일 스캔으로 처리한다.
create or replace function public.get_events_filter_options()
returns table (
  sources text[],
  event_types text[],
  min_class_names text[],
  svc_stat_nms text[]
) as $$
  select
    array_agg(distinct source order by source) filter (where source is not null),
    array_agg(distinct event_type order by event_type) filter (where event_type is not null),
    array_agg(distinct raw_data->>'MINCLASSNM' order by raw_data->>'MINCLASSNM')
      filter (where raw_data->>'MINCLASSNM' is not null),
    array_agg(distinct raw_data->>'SVCSTATNM' order by raw_data->>'SVCSTATNM')
      filter (where raw_data->>'SVCSTATNM' is not null)
  from public.events;
$$ language sql stable;

create or replace function public.get_raw_ingest_data_filter_options()
returns table (sources text[]) as $$
  select array_agg(distinct source order by source) from public.raw_ingest_data;
$$ language sql stable;
