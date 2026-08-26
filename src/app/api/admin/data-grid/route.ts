import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [개편] /admin/data-grid: open_spaces/events/raw_ingest_data 3개 탭을 지원하도록 확장.
// 표 데이터 검증용 도구이므로 필터 옵션은 하드코딩하지 않고 DB의 실제 값을 조회해 구성한다.
const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_PAGE_SIZES = [50, 100, 200];

type AdminTable = 'open_spaces' | 'events' | 'raw_ingest_data';

function parseTable(value: string | null): AdminTable {
  if (value === 'events' || value === 'raw_ingest_data') return value;
  return 'open_spaces';
}

function parsePageSize(value: string | null): number {
  const n = Number(value);
  return ALLOWED_PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

function parseBoolFilter(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

// [0순위 우선 요청](2026-08-26): "기본 조회 조건에 WHERE is_active = true를 적용하여
// 비활성화된 과거 데이터가 어드민 그리드에 섞여 나오지 않도록" — 다른 tri-state 필터
// (parseBoolFilter, 기본값 '전체')와 달리 이 필터만 파라미터가 없을 때도 기본값이 true다.
// 명시적으로 'all'을 보내야만 필터가 해제된다(비활성 포함 전체 조회).
function parseIsActiveFilter(value: string | null): boolean | null {
  if (value === 'false') return false;
  if (value === 'all') return null;
  return true;
}

function parseListFilter(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

// ilike 패턴에 사용되는 %, _ 와일드카드를 검색어에서 이스케이프한다.
function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const OPEN_SPACES_COLUMNS =
  'id, external_id, source_type, source, name, category, category_min, category_min_source, address, location, location_precision, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, raw_data, sigungu_name, created_at, updated_at';

const EVENTS_COLUMNS =
  'id, external_id, source, title, event_type, category_min, category_min_source, venue_name, sigungu_name, start_date, end_date, location, location_precision, is_reservation_required, reservation_url, reservation_start_date, reservation_end_date, is_free, thumbnail_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, booking_status, is_active, raw_data, created_at';

const RAW_INGEST_COLUMNS = 'source, source_id, fetched_at, raw_payload';

// raw_data->>'MINCLASSNM'/'SVCSTATNM'는 서울시 예약 API(SeoulYeyakAdapter) 원본 필드라 다른
// 출처의 raw_data에는 없다.
const SEOUL_YEYAK_SOURCE = 'seoul_public_reservation';

type Ctx = Awaited<ReturnType<typeof createClient>>;

// 실측 확인(2026-08-25): open_spaces(12만~13만 건)에서 raw_data->>'MINCLASSNM'/'SVCSTATNM'
// 같은 JSONB 경로 조건은 옵티마이저가 idx_open_spaces_source 인덱스를 신뢰하지 못해(추정
// 비용 오차) 매번 전체 시퀀셜 스캔을 선택해 8초 타임아웃을 넘긴다(EXPLAIN ANALYZE로 확인 —
// Seq Scan 예상 비용이 Index Scan보다 낮게 잘못 추정됨). MINCLASSNM/SVCSTATNM은 SeoulYeyak
// 소스에만 존재하는 필드라 `source = SEOUL_YEYAK_SOURCE`(동등 비교, 실측 4ms)로 정확히
// 좁힌 뒤 나머지 모든 필터/검색/페이지네이션을 애플리케이션 코드(JS)에서 처리한다 — 이
// 경로에서는 SQL에 JSONB 조건을 절대 넣지 않는다.
// [전체 파이프라인 일괄 가동] 후속 수정(2026-08-25): 원래는 `source IS NOT NULL`로 좁혔으나,
// 17개 어댑터 전부가 source를 채우게 되면서 그 조건의 선택도가 1%→97%로 뒤집혀 인덱스
// 이점이 사라졌다(실측 5.1초로 급증) — 정확한 출처값으로 동등 비교하도록 정정했다.
async function queryOpenSpacesViaSourceSubset(
  supabase: Ctx,
  params: {
    q: string;
    sourceTypes: string[];
    sources: string[];
    categories: string[];
    minClassName: string | null;
    svcStatNm: string | null;
    categoryMin: string | null;
    missingCategoryMin: boolean;
    isFree: boolean | null;
    hasParking: boolean | null;
    strollerAccessible: boolean | null;
    isKidsFriendly: boolean | null;
    missingLocation: boolean;
    missingFee: boolean;
    page: number;
    pageSize: number;
  }
) {
  const { data, error } = await supabase.from('open_spaces').select(OPEN_SPACES_COLUMNS).eq('source', SEOUL_YEYAK_SOURCE);
  if (error) return { error };

  type Row = NonNullable<typeof data>[number];
  const q = params.q.toLowerCase();

  const filtered = (data ?? []).filter((row: Row) => {
    if (q && !`${row.name} ${row.address}`.toLowerCase().includes(q)) return false;
    if (params.sourceTypes.length > 0 && !params.sourceTypes.includes(row.source_type)) return false;
    if (params.sources.length > 0 && (!row.source || !params.sources.includes(row.source))) return false;
    if (params.categories.length > 0 && !params.categories.includes(row.category)) return false;
    const rawData = row.raw_data as Record<string, unknown> | null;
    if (params.minClassName && rawData?.MINCLASSNM !== params.minClassName) return false;
    if (params.svcStatNm && rawData?.SVCSTATNM !== params.svcStatNm) return false;
    if (params.categoryMin && row.category_min !== params.categoryMin) return false;
    if (params.missingCategoryMin && row.category_min !== null) return false;
    if (params.isFree !== null && row.is_free !== params.isFree) return false;
    if (params.hasParking !== null && row.has_parking !== params.hasParking) return false;
    if (params.strollerAccessible !== null && row.stroller_accessible !== params.strollerAccessible) return false;
    if (params.isKidsFriendly !== null && row.is_kids_friendly !== params.isKidsFriendly) return false;
    if (params.missingLocation && row.location !== null) return false;
    if (params.missingFee && row.is_free !== null) return false;
    return true;
  });

  const from = (params.page - 1) * params.pageSize;
  const rows = filtered.slice(from, from + params.pageSize);
  return { rows, total: filtered.length };
}

async function queryOpenSpaces(supabase: Ctx, searchParams: URLSearchParams, page: number, pageSize: number) {
  const q = searchParams.get('q')?.trim() ?? '';
  const sourceTypes = parseListFilter(searchParams.get('source_type'));
  const sources = parseListFilter(searchParams.get('source'));
  const categories = parseListFilter(searchParams.get('category'));
  const minClassName = searchParams.get('min_class_name');
  const svcStatNm = searchParams.get('svc_stat_nm');
  const categoryMin = searchParams.get('category_min');
  const missingCategoryMin = searchParams.get('missing_category_min') === 'true';
  const isFree = parseBoolFilter(searchParams.get('is_free'));
  const hasParking = parseBoolFilter(searchParams.get('has_parking'));
  const strollerAccessible = parseBoolFilter(searchParams.get('stroller_accessible'));
  const isKidsFriendly = parseBoolFilter(searchParams.get('is_kids_friendly'));
  const missingLocation = searchParams.get('missing_location') === 'true';
  const missingFee = searchParams.get('missing_fee') === 'true';

  if (minClassName || svcStatNm) {
    const result = await queryOpenSpacesViaSourceSubset(supabase, {
      q,
      sourceTypes,
      sources,
      categories,
      minClassName,
      svcStatNm,
      categoryMin,
      missingCategoryMin,
      isFree,
      hasParking,
      strollerAccessible,
      isKidsFriendly,
      missingLocation,
      missingFee,
      page,
      pageSize,
    });
    if ('error' in result) throw new Error(result.error!.message);
    return result;
  }

  // MINCLASSNM/SVCSTATNM 필터가 없으면 일반 쿼리 빌더 경로를 쓴다 — 실측상 raw_data JSONB를
  // 건드리지 않는 일반 컬럼 필터는 이 테이블에서도 문제없이 빠르다.
  let query = supabase.from('open_spaces').select(OPEN_SPACES_COLUMNS, { count: 'estimated' });

  if (q) {
    const escaped = escapeIlikePattern(q);
    query = query.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%`);
  }
  if (sourceTypes.length === 1) query = query.eq('source_type', sourceTypes[0]);
  else if (sourceTypes.length > 1) query = query.in('source_type', sourceTypes);
  // 실측 확인(2026-08-25, [전체 파이프라인 일괄 가동] 후속): .in()이 컴파일하는
  // `source = ANY(array[...])` 형태는 옵티마이저가 idx_open_spaces_source_created_at 복합
  // 인덱스를 무시하고 매번 created_at 인덱스만 타 관련 없는 행을 수만 건 걸러내는 별개의
  // 플래너 버그성 동작을 보였다(단일 값 `=` 비교로는 문제없이 인덱스를 씀 — 실측: 16초→11ms).
  // 단일 값 선택이 흔한 이 관리자 그리드 UX에서는 값이 하나면 .eq()로 우회한다.
  if (sources.length === 1) query = query.eq('source', sources[0]);
  else if (sources.length > 1) query = query.in('source', sources);
  if (categories.length === 1) query = query.eq('category', categories[0]);
  else if (categories.length > 1) query = query.in('category', categories);
  if (categoryMin) query = query.eq('category_min', categoryMin);
  if (missingCategoryMin) query = query.is('category_min', null);
  if (isFree !== null) query = query.eq('is_free', isFree);
  if (hasParking !== null) query = query.eq('has_parking', hasParking);
  if (strollerAccessible !== null) query = query.eq('stroller_accessible', strollerAccessible);
  if (isKidsFriendly !== null) query = query.eq('is_kids_friendly', isKidsFriendly);
  if (missingLocation) query = query.is('location', null);
  if (missingFee) query = query.is('is_free', null);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order('created_at', { ascending: false, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

async function queryEvents(supabase: Ctx, searchParams: URLSearchParams, page: number, pageSize: number) {
  const q = searchParams.get('q')?.trim() ?? '';
  const sources = parseListFilter(searchParams.get('source'));
  const eventTypes = parseListFilter(searchParams.get('category'));
  const minClassName = searchParams.get('min_class_name');
  const svcStatNm = searchParams.get('svc_stat_nm');
  const categoryMin = searchParams.get('category_min');
  const missingCategoryMin = searchParams.get('missing_category_min') === 'true';
  const isActive = parseIsActiveFilter(searchParams.get('is_active'));
  const isFree = parseBoolFilter(searchParams.get('is_free'));
  const hasParking = parseBoolFilter(searchParams.get('has_parking'));
  const strollerAccessible = parseBoolFilter(searchParams.get('stroller_accessible'));
  const isKidsFriendly = parseBoolFilter(searchParams.get('is_kids_friendly'));
  const missingLocation = searchParams.get('missing_location') === 'true';
  const missingFee = searchParams.get('missing_fee') === 'true';

  // events(약 2.6만 건)는 open_spaces보다 훨씬 작아 raw_data JSONB 조건을 SQL에 그대로 넣어도
  // 실측상 문제없이 빠르다(별도 우회 경로 불필요).
  let query = supabase.from('events').select(EVENTS_COLUMNS, { count: 'exact' });

  if (q) {
    const escaped = escapeIlikePattern(q);
    query = query.or(`title.ilike.%${escaped}%,venue_name.ilike.%${escaped}%`);
  }
  if (sources.length > 0) query = query.in('source', sources);
  if (eventTypes.length > 0) query = query.in('event_type', eventTypes);
  if (minClassName) query = query.filter('raw_data->>MINCLASSNM', 'eq', minClassName);
  if (svcStatNm) query = query.filter('raw_data->>SVCSTATNM', 'eq', svcStatNm);
  if (categoryMin) query = query.eq('category_min', categoryMin);
  if (missingCategoryMin) query = query.is('category_min', null);
  if (isActive !== null) query = query.eq('is_active', isActive);
  if (isFree !== null) query = query.eq('is_free', isFree);
  if (hasParking !== null) query = query.eq('has_parking', hasParking);
  if (strollerAccessible !== null) query = query.eq('stroller_accessible', strollerAccessible);
  if (isKidsFriendly !== null) query = query.eq('is_kids_friendly', isKidsFriendly);
  if (missingLocation) query = query.is('location', null);
  if (missingFee) query = query.is('is_free', null);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query
    .order('created_at', { ascending: false, nullsFirst: false })
    .range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

async function queryRawIngestData(supabase: Ctx, searchParams: URLSearchParams, page: number, pageSize: number) {
  const q = searchParams.get('q')?.trim() ?? '';
  const sources = parseListFilter(searchParams.get('source'));

  let query = supabase.from('raw_ingest_data').select(RAW_INGEST_COLUMNS, { count: 'exact' });

  if (q) {
    const escaped = escapeIlikePattern(q);
    query = query.ilike('source_id', `%${escaped}%`);
  }
  if (sources.length > 0) query = query.in('source', sources);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.order('fetched_at', { ascending: false }).range(from, from + pageSize - 1);

  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = parseTable(searchParams.get('table'));
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const pageSize = parsePageSize(searchParams.get('page_size'));

  const supabase = await createClient();

  try {
    const result =
      table === 'events'
        ? await queryEvents(supabase, searchParams, page, pageSize)
        : table === 'raw_ingest_data'
          ? await queryRawIngestData(supabase, searchParams, page, pageSize)
          : await queryOpenSpaces(supabase, searchParams, page, pageSize);

    return NextResponse.json({ table, rows: result.rows, total: result.total, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '데이터 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
