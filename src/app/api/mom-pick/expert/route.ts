import { NextRequest, NextResponse } from 'next/server';
import { requireCommunityAccess } from '@/lib/community/require-community-access';
import { getExpertPosts } from '@/lib/community/mom-pick-dashboard';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시) 섹션 ① 전체보기: /mom-pick/expert.
const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  try {
    const access = await requireCommunityAccess();
    if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status });

    const page = Math.max(1, Number(new URL(request.url).searchParams.get('page') ?? '1') || 1);
    const result = await getExpertPosts(PAGE_SIZE, page);
    return NextResponse.json({ items: result.items, total: result.total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    const message = err instanceof Error ? err.message : '파워맘/우수맘 추천 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
