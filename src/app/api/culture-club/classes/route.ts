import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [문화센터 탭 — 강좌 목록](2026-10-03 사용자 지시): "요일 및 카테고리 상태 필터
// (Multi-select / OR 조건) ... 페이징/무한 스크롤" — emart_culture_club_classes는
// 관리자 전용 RLS(service role)라, 이 프로젝트의 기존 공개 API 관례(예:
// src/app/api/nearby/service-categories/route.ts, src/app/api/events/today/route.ts)를
// 그대로 따라 서버 사이드 createAdminClient()로 조회한다 — 서비스 롤 키는 이 Next.js
// 라우트 밖으로 나가지 않고, 라우트 자체가 신뢰 경계라 새 RLS 정책은 필요 없다.
//
// 지점(store_code)은 항상 정확히 1개를 요구한다("유저는 한 번에 하나의 지점만 집중해서
// 선택" — 단일선택 고정 구조). 요일/카테고리는 다중선택 OR로, class_day(text[])는
// .overlaps(), sub_category_name은 .in()으로 처리한다.
//
// [PAGE_SIZE=20] event-browse-sheet.tsx(전국 단위 전체보기)는 24를 쓰지만, 이 화면은
// 지점 1개로 좁힌 조회라 모수 자체가 작다(지점+카테고리+요일 조합 시 수십~백여 건
// 수준) — 더 가벼운 초기 페인트를 위해 20으로 둔다.
const DEFAULT_PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeCode = searchParams.get('store_code');
    if (!storeCode) {
      return NextResponse.json({ error: 'store_code가 필요합니다.' }, { status: 400 });
    }

    const days = (searchParams.get('days') ?? '').split(',').filter(Boolean);
    const subCategories = (searchParams.get('sub_category_name') ?? '').split(',').filter(Boolean);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabase = createAdminClient();
    let query = supabase
      .from('emart_culture_club_classes')
      .select('*', { count: 'exact' })
      .eq('store_code', storeCode)
      .eq('is_excluded', false)
      .order('register_start_date', { ascending: true })
      .range(from, to);

    if (days.length > 0) query = query.overlaps('class_day', days);
    if (subCategories.length > 0) query = query.in('sub_category_name', subCategories);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize });
  } catch (err) {
    const message = err instanceof Error ? err.message : '문화센터 강좌 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
