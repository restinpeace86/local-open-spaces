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
    const { table, id, ids, category_min: categoryMin } = body as {
      table?: unknown;
      id?: unknown;
      ids?: unknown;
      category_min?: unknown;
    };

    if (!isTargetTable(table)) {
      return NextResponse.json({ error: 'table은 open_spaces 또는 events여야 합니다.' }, { status: 400 });
    }
    // 빈 문자열/null은 "미분류로 되돌리기"로 취급한다(category_min_source도 함께 null로 되돌림).
    const nextCategoryMin = typeof categoryMin === 'string' && categoryMin.trim() ? categoryMin.trim() : null;

    const admin = createAdminClient();

    // [관리자 목록 일괄 편집](2026-09-07 사용자 지시): "체크박스 선택된 것들에 대하여
    // 표준 중분류랑.. 일괄적으로 수정 가능하도록" — 기존 단일 id PATCH는 그대로 두고,
    // bulk-category-mapping의 ids 배열 관례를 그대로 재사용해(제5장 제4조) 여러 건을
    // 한 번에 수정하는 경로를 추가한다. 대량 오적용 사고를 막기 위해 이 경로는 값을
    // 반드시 요구한다(단일 id 경로처럼 null로 되돌리는 것은 허용하지 않음 — 개별 행
    // 되돌리기는 기존 상세 모달에서 계속 가능).
    if (Array.isArray(ids)) {
      const idList = ids.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0);
      if (idList.length === 0) {
        return NextResponse.json({ error: '선택된 항목이 없습니다.' }, { status: 400 });
      }
      if (!nextCategoryMin) {
        return NextResponse.json({ error: '표준 중분류(category_min)를 선택해주세요.' }, { status: 400 });
      }
      const { error, count } = await admin
        .from(table)
        .update({ category_min: nextCategoryMin, category_min_source: 'MANUAL' }, { count: 'exact' })
        .in('id', idList);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ updated_count: count ?? 0 });
    }

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }

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
