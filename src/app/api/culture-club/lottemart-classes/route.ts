import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [롯데마트 문화센터 — 강좌 목록](2026-10-04 사용자 지시, reference/lottemart
// culture.png 참고): 이마트 문화센터 API(classes/route.ts)와 동일한 관례(관리자
// 전용 RLS 테이블을 신뢰 경계인 Next.js 라우트에서 createAdminClient()로 직접
// 조회, 지점 단일선택 필수, 나머지 다중선택 OR)를 따르되 필터 축은 실제 수집된
// 필드에 맞춘다 — 이마트의 sub_category_name 대신 target_code(수강대상: 어린이
// 청소년/유아/엄마와함께, 실측상 하나의 breadcrumb이 대상별로 달라 카테고리
// 칩보다 대상 선택이 더 적절함)를 쓴다.
const DEFAULT_PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeCode = searchParams.get('store_code');
    if (!storeCode) {
      return NextResponse.json({ error: 'store_code가 필요합니다.' }, { status: 400 });
    }

    const days = (searchParams.get('days') ?? '').split(',').filter(Boolean);
    const targetCodes = (searchParams.get('target_code') ?? '').split(',').filter(Boolean);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createAdminClient();
    let query = supabase
      .from('lottemart_culture_club_classes')
      .select('*', { count: 'exact' })
      .eq('store_code', storeCode)
      .eq('is_excluded', false)
      .order('class_start_date', { ascending: true })
      .range(from, to);

    if (days.length > 0) query = query.overlaps('class_day', days);
    if (targetCodes.length > 0) query = query.in('target_code', targetCodes);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '롯데마트 문화센터 강좌 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
