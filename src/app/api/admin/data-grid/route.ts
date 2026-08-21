import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// implementation/todo.md Task 6: /admin/data-grid 읽기 전용 조회 API.
const PAGE_SIZE = 30;

const SELECT_COLUMNS =
  'id, external_id, source_type, name, category, address, is_free, operating_hours, info_url, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group, location, raw_data, created_at, updated_at';

function parseBoolFilter(value: string | null): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function parseListFilter(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

// ilike 패턴에 사용되는 %, _ 와일드카드를 검색어에서 이스케이프한다.
function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const sourceTypes = parseListFilter(searchParams.get('source_type'));
  const categories = parseListFilter(searchParams.get('category'));
  const isFree = parseBoolFilter(searchParams.get('is_free'));
  const hasParking = parseBoolFilter(searchParams.get('has_parking'));
  const strollerAccessible = parseBoolFilter(searchParams.get('stroller_accessible'));
  const isKidsFriendly = parseBoolFilter(searchParams.get('is_kids_friendly'));
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const supabase = await createClient();

  let query = supabase.from('open_spaces').select(SELECT_COLUMNS, { count: 'exact' });

  if (q) {
    const escaped = escapeIlikePattern(q);
    query = query.or(`name.ilike.%${escaped}%,address.ilike.%${escaped}%`);
  }
  if (sourceTypes.length > 0) query = query.in('source_type', sourceTypes);
  if (categories.length > 0) query = query.in('category', categories);
  if (isFree !== null) query = query.eq('is_free', isFree);
  if (hasParking !== null) query = query.eq('has_parking', hasParking);
  if (strollerAccessible !== null) query = query.eq('stroller_accessible', strollerAccessible);
  if (isKidsFriendly !== null) query = query.eq('is_kids_friendly', isKidsFriendly);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order('created_at', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    rows: data ?? [],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  });
}
