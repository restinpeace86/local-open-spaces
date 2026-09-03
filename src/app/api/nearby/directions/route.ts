import { NextRequest, NextResponse } from 'next/server';

// [인앱 길찾기](2026-09-03 사용자 지시): "지도에서 보기가 확대/축소밖에 안 된다 — 현재
// 위치 기준 길찾기가 없다"는 지적에 따라 추가한다. 카카오모빌리티 "길찾기 API"(자동차
// 길찾기, 단일 출발지/단일 목적지)를 서버에서만 호출해 REST API 키(KAKAO_REST_API_KEY,
// NEXT_PUBLIC_ 접두어가 아니라 브라우저에 노출되지 않음)를 클라이언트에 노출하지 않는다.
// [외부 지도 앱 연동 제거 및 인앱 위치 보기](2026-08-30 사용자 지시)와의 관계: 그 결정은
// "길찾기를 누르면 네이버 지도 앱으로 유저를 내보내던 것"을 없앤 것이지, "길찾기 자체를
// 없앤" 것이 아니다 — 이번 기능은 경로 좌표/거리/소요시간 데이터만 받아와 이미 있는
// 인앱 지도(MiniMap/MapPreviewModal) 위에 우리가 직접 그려주므로, 앱을 벗어나지
// 않는다는 그 결정의 취지를 그대로 지킨다.
// [API 선택](2026-09-03 사용자 확인): 카카오 "길찾기 API" 5종(자동차/다중 경유지/다중
// 출발지/다중 목적지/미래 운행 정보) 중, 출발지·목적지가 각각 정확히 하나뿐인 우리
// 시나리오에는 가장 기본형인 "자동차 길찾기"만 필요하다고 확인받았다.
type KakaoDirectionsRoute = {
  result_code: number;
  result_msg: string;
  summary: { distance: number; duration: number };
  sections: Array<{
    roads: Array<{ vertexes: number[] }>;
  }>;
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const originLat = Number(searchParams.get('origin_lat'));
    const originLng = Number(searchParams.get('origin_lng'));
    const destLat = Number(searchParams.get('dest_lat'));
    const destLng = Number(searchParams.get('dest_lng'));

    if ([originLat, originLng, destLat, destLng].some((v) => Number.isNaN(v))) {
      return NextResponse.json({ error: '출발지/목적지 좌표가 올바르지 않습니다.' }, { status: 400 });
    }

    const restApiKey = process.env.KAKAO_REST_API_KEY;
    if (!restApiKey) {
      return NextResponse.json({ error: '길찾기 기능이 아직 설정되지 않았습니다.' }, { status: 500 });
    }

    const params = new URLSearchParams({
      origin: `${originLng},${originLat}`,
      destination: `${destLng},${destLat}`,
      priority: 'RECOMMEND',
    });

    const res = await fetch(`https://apis-navi.kakaomobility.com/v1/directions?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${restApiKey}` },
    });
    const data: { routes?: KakaoDirectionsRoute[] } = await res.json();
    const route = data.routes?.[0];

    if (!res.ok || !route || route.result_code !== 0) {
      return NextResponse.json(
        { error: route?.result_msg ?? '경로를 찾을 수 없습니다. 자동차로 이동 가능한 경로가 아닐 수 있어요.' },
        { status: 502 }
      );
    }

    // vertexes는 [lng, lat, lng, lat, ...] 평탄 배열이다(실측 확인 — Kakao 좌표 관례상
    // x=경도/y=위도이고, 이 API의 origin/destination 파라미터도 "경도,위도" 순서를 쓴다).
    const path = route.sections.flatMap((section) =>
      section.roads.flatMap((road) => {
        const points: { lat: number; lng: number }[] = [];
        for (let i = 0; i + 1 < road.vertexes.length; i += 2) {
          points.push({ lng: road.vertexes[i], lat: road.vertexes[i + 1] });
        }
        return points;
      })
    );

    return NextResponse.json({
      distanceMeters: route.summary.distance,
      durationSeconds: route.summary.duration,
      path,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '길찾기 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
