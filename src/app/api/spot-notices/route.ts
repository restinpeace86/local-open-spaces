import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// [네이버 플레이스 공지 온디맨드 레이더](2026-09-19 사용자 지시): 유저 화면에는
// status='published'인(관리자가 검수/가공을 마친) 공지만 내려준다 — 원본(pending)은
// 절대 노출하지 않는다. 스팟/이벤트/제휴상품 상세 3개 진입점이 전부 이 라우트를
// 그대로 호출한다(제5장 제4조 — spot_id 하나로 통일된 조회, 진입점별 분기 없음).
const NOTICES_LIMIT = 10;

export async function GET(request: NextRequest) {
  try {
    const spotId = new URL(request.url).searchParams.get('spot_id')?.trim();
    if (!spotId) {
      return NextResponse.json({ notices: [] });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('spot_notices')
      .select('id, curated_title, curated_content, curated_image_url, raw_posted_at, published_at')
      .eq('spot_id', spotId)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(NOTICES_LIMIT);

    if (error) return NextResponse.json({ notices: [] });

    return NextResponse.json({ notices: data ?? [] });
  } catch {
    return NextResponse.json({ notices: [] });
  }
}
