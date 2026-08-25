import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applyCategoryRules } from '@/lib/admin/category-rules';

// [카테고리 정제 & 어드민 확장](2026-08-26): "[규칙 기반 일괄 재분류 실행]" 버튼.
// category_min IS NULL인 행 전체를 대상으로 DB의 최신 category_rules를 적용해 RULE로
// 채운다(scripts/ingest/lib/category-rules.mjs의 배치 후처리와 동일 로직 — TS 버전).
export async function POST() {
  try {
    const admin = createAdminClient();
    const result = await applyCategoryRules(admin);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '일괄 재분류 실행 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
