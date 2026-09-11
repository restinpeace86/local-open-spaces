import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, implementation/todo.md
// 개선사항7-2/8): open_spaces의 spot_curations(Decision 021)와 달리 events는 별도
// 큐레이션 테이블이 없어(가격/영업시간 등 스팟 전용 개념이 없음) events 테이블의
// curated_blog_urls 컬럼을 직접 CRUD한다(2026-09-11-events-curated-blog-urls.sql).
// events는 RLS로 보호돼 있어(다른 관리자 라우트와 동일 패턴) service_role
// (createAdminClient())로만 갱신한다.
const MAX_URLS = 3;

function normalizeUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .slice(0, MAX_URLS);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    if (!eventId) {
      return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .select('curated_blog_urls')
      .eq('id', eventId)
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ urls: normalizeUrls(data?.curated_blog_urls) });
  } catch (err) {
    const message = err instanceof Error ? err.message : '큐레이션 블로그 URL 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { event_id?: string; urls?: unknown };
    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });
    }

    const urls = normalizeUrls(body.urls);
    const admin = createAdminClient();
    const { error } = await admin.from('events').update({ curated_blog_urls: urls }).eq('id', body.event_id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : '큐레이션 블로그 URL 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
