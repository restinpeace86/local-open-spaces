import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [카테고리 정제 & 어드민 확장](2026-08-26): 상세 모달에서 관리자가 category_min을 직접
// 선택해 수정하면 category_min_source를 항상 'MANUAL'로 바꾼다(RAW/RULE 값을 덮어써도
// 관리자의 명시적 판단이 최종 우선한다는 규약).
type TargetTable = 'open_spaces' | 'events';

function isTargetTable(value: unknown): value is TargetTable {
  return value === 'open_spaces' || value === 'events';
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, id, category_min: categoryMin } = body as {
      table?: unknown;
      id?: unknown;
      category_min?: unknown;
    };

    if (!isTargetTable(table)) {
      return NextResponse.json({ error: 'table은 open_spaces 또는 events여야 합니다.' }, { status: 400 });
    }
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    // 빈 문자열/null은 "미분류로 되돌리기"로 취급한다(category_min_source도 함께 null로 되돌림).
    const nextCategoryMin = typeof categoryMin === 'string' && categoryMin.trim() ? categoryMin.trim() : null;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from(table)
      .update({
        category_min: nextCategoryMin,
        category_min_source: nextCategoryMin ? 'MANUAL' : null,
      })
      .eq('id', id)
      .select('id, category_min, category_min_source')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '카테고리 수동 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
