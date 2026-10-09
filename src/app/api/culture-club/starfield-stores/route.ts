import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStoreDistancesByCode } from '@/lib/home/culture-club-nearby-stores';

// [스타필드 — 지점 목록 API](2026-10-09 사용자 승인: "그렇게 진행하자")
// /api/culture-club/akplaza-stores/shinsegae-stores와 동일한 패턴
// (제5장 제4조 기존 구조 우선): 지점이 오늘 open_spaces에 지오코딩
// 등록됐으므로(STARFIELD_STORE_* 3건, starfield-culture-club-stores.mjs)
// 그 데이터를 그대로 재사용한다.
const EXTERNAL_ID_PREFIX = 'STARFIELD_STORE_';
const CULTURE_CENTER_CATEGORY_MIN = '쇼핑몰문화센터';

function extractShortRegion(address: string | null): string | null {
  if (!address) return null;
  const tokens = address.trim().split(/\s+/);
  return tokens.slice(0, 2).join(' ') || null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');
    const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : NaN;
    const lng = lngRaw != null && lngRaw !== '' ? Number(lngRaw) : NaN;
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
    const radiusKmRaw = searchParams.get('radius_km');
    const radiusKm = radiusKmRaw != null && radiusKmRaw !== '' ? Number(radiusKmRaw) : null;
    const hasRadius = radiusKm != null && Number.isFinite(radiusKm) && radiusKm > 0;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('open_spaces')
      .select('external_id, display_name, name, address')
      .eq('category_min', CULTURE_CENTER_CATEGORY_MIN)
      .order('display_name', { ascending: true });

    if (error) throw new Error(error.message);

    const stores = (data ?? [])
      .filter((row): row is typeof row & { external_id: string } => Boolean(row.external_id?.startsWith(EXTERNAL_ID_PREFIX)))
      .map((row) => {
        const name = row.display_name ?? row.name;
        const region = extractShortRegion(row.address);
        return {
          storeCode: row.external_id.slice(EXTERNAL_ID_PREFIX.length),
          label: region ? `${name} (${region})` : name,
        };
      });

    if (!hasLocation) {
      return NextResponse.json({ stores });
    }

    const distances = await getStoreDistancesByCode(EXTERNAL_ID_PREFIX, { lat, lng });
    let withDistance = stores.map((store) => ({ ...store, distanceMeters: distances.get(store.storeCode) ?? null }));
    if (hasRadius) withDistance = withDistance.filter((store) => store.distanceMeters != null && store.distanceMeters <= radiusKm! * 1000);
    withDistance.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));

    return NextResponse.json({ stores: withDistance });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스타필드 지점 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
