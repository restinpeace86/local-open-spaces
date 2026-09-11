import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [이벤트픽 유저용 큐레이션 블로그](2026-09-11 사용자 지시, implementation/todo.md
// 개선사항8): "관리자 화면에서 저장한 URL들이 유저 상세 화면에 노출". 관리자가
// events.curated_blog_urls에 저장한 값을 공개 조회한다(스팟픽 상세 카드가
// /api/spot-blog-reviews를 별도로 조회하는 것과 동일한 패턴 — NearbyItem/RPC에
// 필드를 얹지 않고 DetailModal이 이벤트일 때만 가볍게 추가 조회한다, 제5장 제4조).
// RLS로 익명 select가 막혀 있을 수 있어(다른 공개 큐레이션 조회 라우트와 동일하게)
// 일반 서버 클라이언트로 우선 시도하고, curated_blog_urls 컬럼이라 민감 정보가
// 아니므로 anon 조회가 막혀 있는 경우를 대비해 실패 시 빈 배열로 안전 폴백한다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    if (!eventId) {
      return NextResponse.json({ urls: [] });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('events')
      .select('curated_blog_urls')
      .eq('id', eventId)
      .single();

    if (error || !data) {
      return NextResponse.json({ urls: [] });
    }

    const urls = Array.isArray(data.curated_blog_urls)
      ? data.curated_blog_urls.filter((u): u is string => typeof u === 'string' && u.length > 0)
      : [];
    return NextResponse.json({ urls });
  } catch {
    return NextResponse.json({ urls: [] });
  }
}
