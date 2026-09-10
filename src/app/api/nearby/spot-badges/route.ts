import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBadgeOptionsForCategory, resolveCurationCategoryId } from '@/lib/admin/curation-badges';

// [스팟픽 리스트 카드 뱃지](2026-09-10 사용자 지시, implementation/todo.md 개선사항2-3):
// "해당 스팟 전용 뱃지 목록 (카테고리 맞춤형 뱃지만 노출)". 바텀시트/좌측 목록의
// 여러 스팟에 대한 뱃지를 한 번에 조회한다 — 상세 카드용 /api/spot-curations
// (단건)와 동일한 라벨 변환 규약을 그대로 쓰되, spot_id 여러 건을 배치로 받는다.
// spot_curations는 RLS+정책 없음이라 service_role로 읽는다.
const MAX_IDS = 200;

export async function GET(request: NextRequest) {
  try {
    const raw = new URL(request.url).searchParams.get('ids')?.trim();
    if (!raw) return NextResponse.json({ badges: {} });
    const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_IDS);
    if (ids.length === 0) return NextResponse.json({ badges: {} });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_curations')
      .select('spot_id, curation_badges, min_age_recommended, open_spaces(service_categories(category_name))')
      .in('spot_id', ids)
      .eq('is_active', true);
    if (error) return NextResponse.json({ badges: {} }, { status: 200 });

    const badges: Record<string, { labels: string[]; minAge: number }> = {};
    for (const row of data ?? []) {
      if (!row.spot_id) continue;
      const openSpace = row.open_spaces as { service_categories: { category_name: string } | null } | null;
      const categoryId = resolveCurationCategoryId(openSpace?.service_categories?.category_name ?? null);
      const options = getBadgeOptionsForCategory(categoryId);
      const keys = Array.isArray(row.curation_badges) ? row.curation_badges : [];
      const labels = keys
        .map((k) => options.find((o) => o.key === k)?.label)
        .filter((l): l is string => Boolean(l));
      const minAge = typeof row.min_age_recommended === 'number' && row.min_age_recommended > 0 ? row.min_age_recommended : 0;
      if (labels.length > 0 || minAge > 0) badges[row.spot_id] = { labels, minAge };
    }
    return NextResponse.json({ badges });
  } catch {
    return NextResponse.json({ badges: {} }, { status: 200 });
  }
}
