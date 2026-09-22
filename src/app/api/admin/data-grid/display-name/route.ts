import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [OPEN_SPACES 노출 이름 수동 수정](2026-09-20 사용자 지시, "장우랑 놀이방" 사례):
// 경기도 놀이방식당 원본 상호명(BIZPLC_NM)이 "장우랑 & 양주회센터"처럼 한 사업장
// 주소에 등록된 여러 상호가 합쳐진 값으로 들어오는 경우가 있다. open_spaces는
// events와 달리 재수집 시 안전 병합을 쓰지 않아(scripts/ingest/lib/supabase-admin.mjs
// upsertRows) 원본 name 컬럼을 직접 고치면 다음 재수집에 되돌아간다 — 그래서 title/
// facility-type route와 같은 관례를 따르되, 별도 컬럼(display_name)에 저장한다.
// 빈 문자열/null이면 override를 지워 원본 name으로 되돌린다.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, display_name: displayName } = body as { id?: unknown; display_name?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    const nextDisplayName = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : null;

    // [개선사항 1 버그 수정](2026-09-22 사용자 지시, todo.md): "노출 이름 수동
    // 수정.. 쪽도 변경 반영되지 않고 있음" — 원인 중 하나는 /api/spot-blog-reviews가
    // 10일 TTL로 캐시해 둔 blog_review_urls가 옛 이름 기준 검색 결과 그대로
    // 남아있던 것이었다. blog_review_updated_at을 비워 캐시를 "오래됨"으로
    // 만들면(isBlogCacheFresh가 null이면 항상 false) 다음 조회 때 새 이름으로
    // 다시 검색한다 — blog_review_urls 자체는 NOT NULL 컬럼이라 지우지 않고
    // 그대로 둔다(재검색이 외부 API 실패로 막히면 이 값이 안전한 폴백으로 쓰임).
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('open_spaces')
      .update({ display_name: nextDisplayName, blog_review_updated_at: null })
      .eq('id', id)
      .select('id, name, display_name')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '노출 이름 수동 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
