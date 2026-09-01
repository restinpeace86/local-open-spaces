// [기상청 단기예보 조회서비스 연동 어댑터](2026-09-01 사용자 지시) — 위경도(WGS84) →
// 기상청 격자좌표(NX, NY) 변환. 기상청이 공식 배포하는 LCC(Lambert Conformal Conic)
// 격자 변환 알고리즘/기준값을 그대로 구현한다(기상청 "기상자료개방포털"/getVilageFcst API
// 활용가이드에 공개된 표준 공식·상수 — 임의로 만든 값이 아니라 문서화된 스펙 구현이다).
const DEGRAD = Math.PI / 180.0;
const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0 * DEGRAD; // 투영 표준위도1
const SLAT2 = 60.0 * DEGRAD; // 투영 표준위도2
const OLON = 126.0 * DEGRAD; // 기준점 경도
const OLAT = 38.0 * DEGRAD; // 기준점 위도
const XO = 43; // 기준점 X좌표(GRID 단위)
const YO = 136; // 기준점 Y좌표(GRID 단위)

const re = RE / GRID;
const sn =
  Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) /
  Math.log(Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5));
const sf = (Math.tan(Math.PI * 0.25 + SLAT1 * 0.5) ** sn * Math.cos(SLAT1)) / sn;
const ro = (re * sf) / Math.tan(Math.PI * 0.25 + OLAT * 0.5) ** sn;

// 위경도(도 단위, WGS84) → 기상청 5km 격자 좌표(정수 nx, ny)로 변환한다.
export function latLngToKmaGrid(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error(`latLngToKmaGrid: 유효하지 않은 좌표입니다(lat=${lat}, lon=${lon})`);
  }

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = (re * sf) / ra ** sn;
  let theta = lon * DEGRAD - OLON;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  // +0.5는 반올림(round-to-nearest)을 floor로 구현하기 위한 표준 보정값이다.
  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}
