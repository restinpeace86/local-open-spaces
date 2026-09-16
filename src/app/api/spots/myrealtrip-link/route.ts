import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [스팟 상세 → 마이리얼트립 자동 매칭](2026-09-16 사용자 지시): 유저 상세 화면이
// "이 스팟에 관리자가 승인해 둔 마이리얼트립 상품이 있는지"만 조회하는 공개
// 라우트. spot_myrealtrip_links는 RLS만 켜고 정책을 추가하지 않은 테이블이라
// (event_operating_exceptions와 동일 관례) 공개 라우트여도 admin 클라이언트로
// 조회해야 한다 — 실시간 검색/마이링크 생성은 전혀 하지 않고 이미 관리자가
// 승인해 둔 결과만 그대로 반환한다(제5장 제11조 — 안정성/응답속도).
export async function GET(request: NextRequest) {
  try {
    const spotId = new URL(request.url).searchParams.get('spot_id');
    if (!spotId) return NextResponse.json({ error: 'spot_id가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_myrealtrip_links')
      .select('item_name, image_url, price_display, mylink')
      .eq('spot_id', spotId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({ link: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '매칭 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
