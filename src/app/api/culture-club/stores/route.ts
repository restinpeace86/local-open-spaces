import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStoreDistancesByCode } from '@/lib/home/culture-club-nearby-stores';

// [문화센터 탭 — 지점 선택](2026-10-03 사용자 지시): "지점 선택(Branch Selector -
// 단일선택) ... 유저가 쉽게 클릭한번으로 선택" — 지점 목록은 emart_culture_club_classes
// (6,500여건, store_code/store_name만 raw)를 직접 훑는 대신, 이미 이번 세션에서
// 지오코딩/브랜드 정규화까지 끝낸 open_spaces의 EMART_STORE_* 행(64건, 2026-10-03
// "이마트 지점 open_spaces 등록" 작업물)을 재사용한다 — 기존 구조 우선(제5장 제4조),
// display_name이 이미 브랜드별로 정리돼 있어(예: "트레이더스 킨텍스점") raw store_name
// ("트레이더스킨텍스")보다 화면에 보여주기 좋고, 조회량도 64건으로 훨씬 가볍다.
const EXTERNAL_ID_PREFIX = 'EMART_STORE_';
const CULTURE_CENTER_CATEGORY_MIN = '대형마트문화센터';

// [지점명 뒤 지역 표기 제거](2026-10-09 사용자 지적: "이마트 분당점 (경기
// 성남시) 2.4km 이렇게 나와 ? 일단 이마트 분당점 2.4km만나오던가") 2026-10-03
// 당시엔 지점명만으론 위치를 알기 어렵다는 이유로 주소 앞 2토큰을 괄호로
// 붙였었는데, 이후 뱃지에 실제 거리(km)가 함께 표시되게 되면서 지역 표기가
// 중복 정보가 됐고 글자 수만 늘렸다 — 지역 표기를 제거하고 지점명만 쓴다.

// [계층형 지점 선택 — 반경 내 지점만](2026-10-07 todo.md 개선사항1-3): lat/lng가
// 있으면 거리를 계산해 "distanceMeters"를 함께 돌려주고, radius_km가 있으면
// 그 반경을 벗어난 지점은 목록에서 제외한다(뱃지 다중선택 UI가 반경 내 지점만
// 보여주기 위함). 위치가 없으면 기존처럼 전체 지점을 그대로 돌려준다.
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
      .select('external_id, display_name, name')
      .eq('category_min', CULTURE_CENTER_CATEGORY_MIN)
      .order('display_name', { ascending: true });

    if (error) throw new Error(error.message);

    const stores = (data ?? [])
      .filter((row): row is typeof row & { external_id: string } => Boolean(row.external_id?.startsWith(EXTERNAL_ID_PREFIX)))
      .map((row) => ({
        storeCode: row.external_id.slice(EXTERNAL_ID_PREFIX.length),
        label: row.display_name ?? row.name,
      }));

    if (!hasLocation) {
      return NextResponse.json({ stores });
    }

    const distances = await getStoreDistancesByCode(EXTERNAL_ID_PREFIX, { lat, lng });
    let withDistance = stores.map((store) => ({ ...store, distanceMeters: distances.get(store.storeCode) ?? null }));
    if (hasRadius) withDistance = withDistance.filter((store) => store.distanceMeters != null && store.distanceMeters <= radiusKm! * 1000);
    withDistance.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));

    return NextResponse.json({ stores: withDistance });
  } catch (err) {
    const message = err instanceof Error ? err.message : '이마트 컬처클럽 지점 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
