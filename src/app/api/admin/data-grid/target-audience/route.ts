import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [10대 타겟 분류 체계 실제 적용](2026-08-27): 상세 모달에서 관리자가 target_audience를 직접
// 선택해 수정하면 target_audience_source를 항상 'MANUAL'로 바꾼다(category-min/route.ts와
// 동일 규약 — 관리자의 명시적 판단이 자동 판정보다 최종 우선한다). target_audience는
// events 테이블에만 있는 컬럼이라(open_spaces는 대상 외) table 파라미터를 받지 않는다.
const TARGET_AUDIENCE_TAGS = [
  'INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY', 'TEEN', 'YOUTH', 'ADULT', 'SENIOR', 'ALL', 'FACILITY',
];

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, target_audience: targetAudience } = body as { id?: unknown; target_audience?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    const nextTargetAudience = typeof targetAudience === 'string' && targetAudience.trim() ? targetAudience.trim() : null;
    if (nextTargetAudience !== null && !TARGET_AUDIENCE_TAGS.includes(nextTargetAudience)) {
      return NextResponse.json({ error: `target_audience는 다음 중 하나여야 합니다: ${TARGET_AUDIENCE_TAGS.join(', ')}` }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .update({
        target_audience: nextTargetAudience,
        target_audience_source: nextTargetAudience ? 'MANUAL' : null,
      })
      .eq('id', id)
      .select('id, target_audience, target_audience_source')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '타겟 연령 수동 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
