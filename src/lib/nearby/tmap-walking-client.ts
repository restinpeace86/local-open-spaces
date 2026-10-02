// [스팟/이벤트 상세 "주변 주차장/식당" 아코디언 — Tmap 보행자 경로](2026-10-02 사용자
// 지시): "T맵(TMAP) 보행자 경로 안내 API는... 하루 1,000건까지 무료로 사용할 수
// 있습니다. 이거 나중에 가입할께 비워놔" — TMAP_API_KEY가 아직 없다(.env.local에
// 비워둠). 이 파일의 요청/응답 형식은 SK Open API 포털의 공개 문서를 기반으로
// 작성했으나, 이 세션에서는 실제 키로 호출해 검증하지 못했다(추측 금지 원칙에 따라
// 이 사실을 숨기지 않는다) — 키 등록 후 반드시 실제 응답으로 아래 파싱 로직을
// 확인해야 한다(특히 features 배열에서 totalDistance/totalTime을 담은 Feature를
// 찾는 부분).
const TMAP_PEDESTRIAN_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json';

export type WalkingRouteResult = {
  distanceMeters: number;
  durationSeconds: number;
};

export function hasTmapApiKey(): boolean {
  return Boolean(process.env.TMAP_API_KEY);
}

// [미검증 — 키 등록 후 확인 필요] Tmap 보행자 경로 API는 GeoJSON FeatureCollection을
// 반환하며, 출발점 Point Feature의 properties에 totalDistance(미터)/totalTime(초)
// 요약값이 담긴다고 공개 문서에 설명되어 있다. 응답 구조가 문서와 다르면 null을
// 반환해 호출부가 직선거리 추정으로 안전하게 폴백하게 한다(제5장 제11조 무중단 원칙).
export async function fetchTmapWalkingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<WalkingRouteResult | null> {
  const apiKey = process.env.TMAP_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(TMAP_PEDESTRIAN_URL, {
    method: 'POST',
    headers: {
      appKey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      startX: String(origin.lng),
      startY: String(origin.lat),
      endX: String(destination.lng),
      endY: String(destination.lat),
      startName: '출발지',
      endName: '도착지',
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      searchOption: '0',
    }),
  });

  if (!res.ok) {
    throw new Error(`Tmap 보행자 경로 호출 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    features?: { properties?: { totalDistance?: number; totalTime?: number } }[];
  };

  const summary = json.features?.find(
    (f) => typeof f.properties?.totalDistance === 'number' && typeof f.properties?.totalTime === 'number'
  );
  if (!summary?.properties) return null;

  return {
    distanceMeters: Math.round(summary.properties.totalDistance!),
    durationSeconds: Math.round(summary.properties.totalTime!),
  };
}
