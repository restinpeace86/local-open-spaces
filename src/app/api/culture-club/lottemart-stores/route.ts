import { NextRequest, NextResponse } from 'next/server';
import { LOTTEMART_STORES } from '@/lib/home/culture-club-options';
import { getStoreDistancesByCode } from '@/lib/home/culture-club-nearby-stores';

const EXTERNAL_ID_PREFIX = 'LOTTEMART_STORE_';

// [롯데마트 문화센터 — 지점 선택](2026-10-04 사용자 지시): 화면 구조 참조 요청
// (reference/lottemart culture.png) — 이마트는 open_spaces에 이미 지오코딩된
// EMART_STORE_* 행(64건)이 있어 그걸 재사용했지만, 롯데마트는 아직 open_spaces에
// 등록된 지점이 없다(실측 확인 2026-10-04: open_spaces에 LOTTEMART_STORE_*
// 0건 — 별도 지오코딩 작업 필요, 이번 범위 아님).
//
// [성능 버그 수정 — 실측 확인](2026-10-04 사용자 지적): "문화센터를 이벤트픽
// 화면에서 들어갔었는데... 왜이렇게 느려졌지?" — 원인은 이 라우트가 60개
// 지점명을 뽑으려고 lottemart_culture_club_classes 전체 15,000여 행을
// 1,000건씩 16번 페이지네이션으로 훑고 있었던 것(실측: 2.3초, 이마트 지점
// API의 0.6초 대비 4배 — 지점 목록을 불러온 뒤에야 강좌 목록을 불러오는
// 순차 구조라 체감 지연이 그대로 더해짐). 지점 목록은 scripts/ingest/
// lottemart-culture-club.mjs의 STORES와 동일한 정적 데이터(수집 스크립트도
// 매번 재수집하지 않고 하드코딩해서 씀 — 지점이 느는 건 드문 수동 이벤트)라
// 매 요청마다 테이블을 훑을 이유가 없었다. 공유 상수(LOTTEMART_STORES)를
// 그대로 반환하도록 바꿔 DB 쿼리 자체를 없앴다.
// [계층형 지점 선택 — 반경 내 지점만](2026-10-07 todo.md 개선사항1-3): 이마트
// 지점 API와 동일하게 lat/lng가 있으면 거리를 계산해 반경 내 지점만 돌려준다.
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

    const stores = [...LOTTEMART_STORES].sort((a, b) => a.label.localeCompare(b.label, 'ko'));

    if (!hasLocation) {
      return NextResponse.json({ stores });
    }

    const distances = await getStoreDistancesByCode(EXTERNAL_ID_PREFIX, { lat, lng });
    let withDistance = stores.map((store) => ({ ...store, distanceMeters: distances.get(store.storeCode) ?? null }));
    if (hasRadius) withDistance = withDistance.filter((store) => store.distanceMeters != null && store.distanceMeters <= radiusKm! * 1000);
    withDistance.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));

    return NextResponse.json({ stores: withDistance });
  } catch (err) {
    const message = err instanceof Error ? err.message : '롯데마트 문화센터 지점 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
