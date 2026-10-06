import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [문화센터 통합검색](2026-10-06 사용자 지시, project/decision-log.md Decision
// 028): "전체 통합검색 및 롯데마트나 이마트 필터검색도 가능하게" — 기존
// /api/culture-club/classes(이마트 전용)/lottemart-classes(롯데마트 전용)를
// culture_club_classes 하나로 대체한다. brand를 생략하면 전체(모든 브랜드)를
// 반환한다.
//
// [지점 필터는 단일 브랜드 선택 시에만 의미 있음] 지점 코드가 브랜드마다
// 독립적으로 부여돼(이마트 '964'와 롯데마트 '455' 등 서로 다른 네임스페이스)
// store_code만으로는 브랜드를 특정할 수 없다 — 이 라우트는 brand가 정확히
// 1개로 지정됐을 때만 store_code 필터를 받는다(그 외에는 무시, 추측으로
// 브랜드를 짐작하지 않음).
//
// [카테고리/대상 필터는 브랜드별로 다른 축] 이마트는 sub_category_name(5개
// 고정값), 롯데마트는 target_code(수강대상, raw_extra에 보관)로 서로 다른
// 분류 체계를 쓴다 — 억지로 하나의 공통 카테고리로 합치지 않고, 각자 원래
// 쓰던 파라미터 이름을 그대로 받는다(둘 다 와도 됨, 각자 해당 브랜드 행에만
// 적용됨).
const DEFAULT_PAGE_SIZE = 20;
const VALID_BRANDS = new Set(['emart', 'lottemart']);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const brands = (searchParams.get('brand') ?? '')
      .split(',')
      .filter(Boolean)
      .filter((b) => VALID_BRANDS.has(b));
    const storeCode = searchParams.get('store_code');
    const days = (searchParams.get('days') ?? '').split(',').filter(Boolean);
    const subCategories = (searchParams.get('sub_category_name') ?? '').split(',').filter(Boolean);
    const targetCodes = (searchParams.get('target_code') ?? '').split(',').filter(Boolean);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createAdminClient();
    let query = supabase
      .from('culture_club_classes')
      .select('*', { count: 'exact' })
      .eq('is_excluded', false)
      .order('schedule_start_date', { ascending: true })
      .range(from, to);

    if (brands.length > 0) query = query.in('brand', brands);
    if (brands.length === 1 && storeCode) query = query.eq('store_code', storeCode);
    if (days.length > 0) query = query.overlaps('class_day', days);
    if (subCategories.length > 0) query = query.in('sub_category_name', subCategories);
    if (targetCodes.length > 0) {
      query = query.or(targetCodes.map((code) => `raw_extra->>target_code.eq.${code}`).join(','));
    }

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '문화센터 통합검색 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
