// Vworld 주소 지오코딩 헬퍼 (api.vworld.kr/req/address).
// 원본 데이터에 좌표가 없고 주소 텍스트만 있는 소스(전국문화기반시설총람 등)를 위해 사용한다.
// process.env.VWORLD_API_KEY가 필요하다 — 국토교통부 Vworld 오픈API(www.vworld.kr) 신청 후 발급받는 인증키.
const ADDRESS_API_URL = 'https://api.vworld.kr/req/address';

export function hasVworldApiKey() {
  return Boolean(process.env.VWORLD_API_KEY);
}

async function callVworldAddress(address, type) {
  const apiKey = process.env.VWORLD_API_KEY;
  const params = new URLSearchParams({
    service: 'address',
    request: 'getcoord',
    version: '2.0',
    crs: 'epsg:4326',
    address,
    format: 'json',
    type,
    key: apiKey,
  });

  const res = await fetch(`${ADDRESS_API_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Vworld 지오코딩 호출 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

// 도로명(ROAD) 주소 검색 우선 시도, 결과 없으면 지번(PARCEL) 주소로 폴백한다
// (원본 instAddr가 도로명/지번 어느 쪽으로 표기되어 있는지 소스마다 일정하지 않음).
export async function geocode(address) {
  if (!address) return null;

  for (const type of ['ROAD', 'PARCEL']) {
    const json = await callVworldAddress(address, type);
    const status = json?.response?.status;
    if (status === 'OK') {
      const point = json.response.result?.point;
      if (point?.x && point?.y) {
        return { lng: Number(point.x), lat: Number(point.y) };
      }
    }
    if (status === 'ERROR') {
      const err = json.response.error;
      throw new Error(`Vworld 지오코딩 에러 응답: ${err?.code} ${err?.text}`);
    }
    // status === 'NOT_FOUND' → 다음 type으로 폴백
  }

  return null;
}
