import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [개선사항2](todo.md, 2026-09-09) "다만 어떻게 병합되었는지 원본에 대한 정보는
// 어떤 방식이든 확인할 수 있어야합니다" — 관리자 그리드는 이제 그룹의 대표
// 1건만 보여주므로(data-grid/route.ts), 대표 상세에서 같은 group_id를 공유하는
// 나머지 원본 멤버(대표 포함 전체)를 이 라우트로 확인할 수 있게 한다.
export type GroupMemberRow = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
  address: string | null;
  source: string | null;
  source_type: string;
  is_dedup_representative: boolean;
  created_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get('group_id');
    if (!groupId) {
      return NextResponse.json({ error: 'group_id는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('open_spaces')
      .select('id, name, category, category_min, address, source, source_type, is_dedup_representative, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: (data ?? []) as GroupMemberRow[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '그룹 멤버 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
