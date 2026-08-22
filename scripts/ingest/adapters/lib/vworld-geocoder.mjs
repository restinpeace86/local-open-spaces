// Vworld 주소 지오코딩 헬퍼 (api.vworld.kr/req/address).
// 원본 데이터에 좌표가 없고 주소 텍스트만 있는 소스(전국문화기반시설총람 등)를 위해 사용한다.
// process.env.VWORLD_API_KEY가 필요하다 — 국토교통부 Vworld 오픈API(www.vworld.kr) 신청 후 발급받는 인증키.
const ADDRESS_API_URL = 'https://api.vworld.kr/req/address';

export function hasVworldApiKey() {
  return Boolean(process.env.VWORLD_API_KEY);
}

// Task 9-2-1(2026-08-22) 백필 마이그레이션 실행 중 실측 확인: VWorld 서버가 간헐적으로
// 502/연결 끊김을 반환한다(같은 정상 좌표를 재요청하면 성공 — 진짜 NOT_FOUND가 아니라
// 일시적 서버 불안정). 이런 일시 오류를 그대로 "결과 없음"으로 처리하면 실제로는 찾을 수
// 있는 주소를 누락시키므로, 짧은 대기 후 재시도하는 안정화 로직을 추가한다.
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchVworld(params) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${ADDRESS_API_URL}?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Vworld API 호출 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastErr;
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

  return fetchVworld(params);
}

// Task 9-2-1(2026-08-22) 실측으로 발견한 VWorld 도로명 매칭 특성: "OO리 OO로 84"처럼 도로명
// 바로 앞에 읍/면 하위 리·동 토큰이 끼어 있으면 ROAD/PARCEL 둘 다 NOT_FOUND를 반환하지만,
// 그 리·동 토큰만 제거하면("OO로 84") 정상 매칭된다(실제 호출로 직접 검증함 —
// national-park-ecotour의 "충청북도 보은군 속리산면 상판리 법주사로 84" 사례).
// 표준 도로명주소 표기는 원래 "동/리"를 생략하는 게 정식 규칙이라, 원본 데이터가 비표준
// 표기(지번식 상세 지역명 + 도로명 혼용)일 때만 해당하는 안정화 로직이다.
function stripVillageTokenBeforeRoad(address) {
  const tokens = address.trim().split(/\s+/);
  const roadIndex = tokens.findIndex((t) => /(로|길)(\d.*)?$/.test(t));
  if (roadIndex <= 0) return null;

  const prevToken = tokens[roadIndex - 1];
  if (!/(동|리)$/.test(prevToken)) return null;

  const cleaned = [...tokens.slice(0, roadIndex - 1), ...tokens.slice(roadIndex)].join(' ');
  return cleaned === address ? null : cleaned;
}

async function tryGeocode(address, type) {
  const json = await callVworldAddress(address, type);
  const status = json?.response?.status;
  if (status === 'OK') {
    const point = json.response.result?.point;
    if (point?.x && point?.y) return { lng: Number(point.x), lat: Number(point.y) };
  }
  if (status === 'ERROR') {
    const err = json.response.error;
    throw new Error(`Vworld 지오코딩 에러 응답: ${err?.code} ${err?.text}`);
  }
  return null; // NOT_FOUND
}

// 도로명(ROAD) 주소 검색 우선 시도, 결과 없으면 지번(PARCEL) 주소로 폴백한다
// (원본 instAddr가 도로명/지번 어느 쪽으로 표기되어 있는지 소스마다 일정하지 않음).
// 그래도 실패하면 위 리·동 토큰 제거 보정 후 ROAD로 한 번 더 시도한다.
export async function geocode(address) {
  if (!address) return null;

  for (const type of ['ROAD', 'PARCEL']) {
    const result = await tryGeocode(address, type);
    if (result) return result;
  }

  const cleaned = stripVillageTokenBeforeRoad(address);
  if (cleaned) {
    const result = await tryGeocode(cleaned, 'ROAD');
    if (result) return result;
  }

  return null;
}

// Task 9-2-1(2026-08-22): DB에 이미 좌표는 있지만 sigungu_name이 NULL인 레코드 백필용
// 역지오코딩(좌표 → 주소). VWorld getAddress 응답의 structure.level1(시/도)+level2(시/군/구,
// 도 지역은 "성남시 분당구"처럼 이미 합쳐서 반환됨)를 "{시/도} {level2}" 문자열로 합성한 뒤,
// 기존 extractSigunguName()과 완전히 동일한 규칙(METRO_CITY_SHORT_NAME 축약 등)을 그대로
// 재사용한다 — 실측 확인(2026-08-22): 인천 좌표 역지오코딩 시 level1="인천광역시",
// level2="서해구"만 반환되고 세종/제주 등 시군구 단위가 없는 지역은 level2가 빈 문자열로
// 옴(추측 아님, VWorld가 실제로 그렇게 반환).
export async function reverseGeocodeSigunguAddress(lng, lat) {
  const apiKey = process.env.VWORLD_API_KEY;
  const params = new URLSearchParams({
    service: 'address',
    request: 'getAddress',
    version: '2.0',
    crs: 'epsg:4326',
    point: `${lng},${lat}`,
    format: 'json',
    // 좌표 지점에 도로명 주소가 없는 경우도 있어(예: 공원/체육시설 부지) road 단독이 아니라
    // both(도로명+지번)로 요청해 둘 중 하나라도 매칭되는 결과를 사용한다(실측 확인).
    type: 'both',
    key: apiKey,
  });

  const json = await fetchVworld(params);
  const status = json?.response?.status;
  if (status === 'ERROR') {
    const err = json.response.error;
    throw new Error(`Vworld 역지오코딩 에러 응답: ${err?.code} ${err?.text}`);
  }
  if (status !== 'OK') return null; // NOT_FOUND

  const results = json.response.result ?? [];
  const structure = results.find((r) => r.structure?.level2)?.structure;
  if (!structure) return null; // 세종/제주 등 시군구 단위 자체가 없는 주소

  return `${structure.level1} ${structure.level2}`.trim();
}
