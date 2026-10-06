import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [문화센터 통합 관리자 화면](2026-10-06 사용자 지시, project/decision-log.md
// Decision 028): "동일한구조로 조회/검색가능하게 관리자화면도" — 기존
// /api/admin/emart-culture-club, /api/admin/lottemart-culture-club 2개를
// culture_club_classes 하나로 대체한다.
//
// [지점 필터 — 브랜드 충돌 방지] store_code는 브랜드마다 독립 네임스페이스
// 라("964"가 이마트/롯데마트에 둘 다 존재할 수 있음) 단순 store_code만으로
// 필터하면 브랜드가 섞인다 — `${brand}:${storeCode}` 복합 값으로 받아
// (brand, store_code) 쌍 단위 OR 조건으로 조회한다.
const ROWS_LIMIT = 1000;

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const brands = (searchParams.get('brand') ?? '').split(',').filter(Boolean);
  const statuses = (searchParams.get('normalized_status') ?? '').split(',').filter(Boolean);
  const storePairs = (searchParams.get('store') ?? '')
    .split(',')
    .filter(Boolean)
    .map((v) => {
      const [brand, storeCode] = v.split(':');
      return brand && storeCode ? { brand, storeCode } : null;
    })
    .filter((v): v is { brand: string; storeCode: string } => v !== null);

  let query = supabase.from('culture_club_classes').select('*', { count: 'exact' }).order('collected_at', { ascending: false }).limit(ROWS_LIMIT);

  if (brands.length > 0) query = query.in('brand', brands);
  if (statuses.length > 0) query = query.in('normalized_status', statuses);
  if (storePairs.length > 0) {
    query = query.or(storePairs.map((p) => `and(brand.eq.${p.brand},store_code.eq.${p.storeCode})`).join(','));
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rows: data ?? [], total: count ?? 0 });
}

// [수동 노출 제외] 통합 테이블은 brand별로 class_id가 겹칠 수 있어 surrogate
// id로 식별한다(기존 두 라우트는 class_id로 했었지만, 그건 각 브랜드 전용
// 테이블이라 class_id가 테이블 내에서 유일했기 때문 — 통합 테이블에서는
// (brand, source_class_id) 조합이어야 유일하므로 그냥 id를 쓰는 게 더 단순).
export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();

  let body: { id?: number; is_excluded?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 });
  }

  const { id, is_excluded: isExcluded } = body;
  if (typeof id !== 'number' || typeof isExcluded !== 'boolean') {
    return NextResponse.json({ error: 'id(number)와 is_excluded(boolean)가 필요합니다.' }, { status: 400 });
  }

  const { error } = await supabase.from('culture_club_classes').update({ is_excluded: isExcluded }).eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
