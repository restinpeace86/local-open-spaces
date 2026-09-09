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
  // [노출 중분류 경계 넘는 오묶음 방지](2026-09-09 사용자 지시): "같은 노출중분류에
  // 대하여서만 하는거 맞아?" — spot-dedup-panel.tsx가 그룹 오픈 시 보강 조회 결과를
  // 현재 스캔 범위의 service_category_id와 대조해 걸러내는 데 쓴다. 이 라우트/RPC
  // 자체는 이 필드로 걸러내지 않는다(다른 두 호출부 — SpotDedupQuickModal/
  // MobileCurationWorkbench — 는 노출 중분류와 무관하게 "좌표만으로 같은 장소인지"
  // 찾는 게 목적이라 강제 필터를 넣으면 안 됨).
  service_category_id: string | null;
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
