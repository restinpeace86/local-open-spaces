import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시) 1단: "중복 장소
// 검수 배너 — 반경 내 유사 장소 안내." find_nearby_open_spaces RPC(단건 반경 조회,
// 2026-09-05-find-nearby-open-spaces-rpc.sql)를 그대로 감싼다.
export type NearbySpot = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
  address: string | null;
  distance_m: number;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const spotId = searchParams.get('spot_id');
    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('find_nearby_open_spaces', { p_spot_id: spotId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: (data ?? []) as NearbySpot[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '주변 유사 장소 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
