import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { NearbyItem } from '@/lib/spaces/get-nearby';

// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 요구사항 4 "주변 키즈친화
// 맛집의 거리 및 상세 정보는 초기 일괄 로딩하지 않고, 유저가 특정 장소를 클릭해 상세
// 정보를 열 때 불러오는 지연 로딩(Lazy Loading) 방식... 맛집 탐색 시 거리를 조금씩
// 넓혀가며 탐색." — 메인 검색 결과(search/route.ts)와 완전히 분리된 온디맨드 엔드포인트.
// 실제로 반경을 단계적으로 넓혀가며 순차 조회하다가(한 번에 큰 반경을 조회하지 않음) 첫
// 결과가 나오는 즉시 멈춘다.
const EXPANDING_RADII_METERS = [1000, 3000, 5000];
const KIDS_RESTAURANT_CATEGORY_MIN = '놀이방식당'; // spot-category-groups.ts '키즈친화 식당'과 동일 매핑
const MAX_RESULTS = 5;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: '필수 파라미터(lat, lng)가 없습니다.' }, { status: 400 });
    }

    const supabase = await createClient();

    for (const radiusMeters of EXPANDING_RADII_METERS) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.rpc('get_nearby_spaces_and_events', {
        user_lng: lng,
        user_lat: lat,
        radius_meters: radiusMeters,
        p_item_type: 'SPACE',
      });
      if (error) throw new Error(`키즈친화 맛집 조회 실패: ${error.message}`);

      const matches = ((data ?? []) as NearbyItem[]).filter((item) => item.category_min === KIDS_RESTAURANT_CATEGORY_MIN);
      if (matches.length > 0) {
        return NextResponse.json({ items: matches.slice(0, MAX_RESULTS), radiusMeters });
      }
    }

    return NextResponse.json({ items: [], radiusMeters: EXPANDING_RADII_METERS[EXPANDING_RADII_METERS.length - 1] });
  } catch (err) {
    const message = err instanceof Error ? err.message : '키즈친화 맛집 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
