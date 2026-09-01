// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) — `scripts/ingest/lib/
// kma-grid.mjs`의 TS 미러다. Next.js 서버 런타임(API 라우트)은 `scripts/`의 .mjs
// 인제스트 스크립트를 직접 import하지 않는다(그 파일들의 CLI 진입점 `if (import.meta.url
// === pathToFileURL(process.argv[1]).href)`가 모듈 최상단에서 `process.argv[1]`이
// undefined일 때 즉시 throw하는 부작용이 있어, Next.js 서버 프로세스에서 그대로
// import하면 크래시한다 — 실측으로 확인함) — `korea-region-lookup.ts`/`.mjs`처럼 두
// 런타임이 서로 import를 주고받지 않는 이 프로젝트의 기존 관례를 그대로 따른다. 알고리즘/
// 상수는 원본과 완전히 동일하다(기상청 공식 LCC 변환 공식, 임의 값 아님).
const DEGRAD = Math.PI / 180.0;
const RE = 6371.00877;
const GRID = 5.0;
const SLAT1 = 30.0 * DEGRAD;
const SLAT2 = 60.0 * DEGRAD;
const OLON = 126.0 * DEGRAD;
const OLAT = 38.0 * DEGRAD;
const XO = 43;
const YO = 136;

const re = RE / GRID;
const sn =
  Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) /
  Math.log(Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5));
const sf = (Math.tan(Math.PI * 0.25 + SLAT1 * 0.5) ** sn * Math.cos(SLAT1)) / sn;
const ro = (re * sf) / Math.tan(Math.PI * 0.25 + OLAT * 0.5) ** sn;

export function latLngToKmaGrid(lat: number, lon: number): { nx: number; ny: number } {
  if (typeof lat !== 'number' || typeof lon !== 'number' || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error(`latLngToKmaGrid: 유효하지 않은 좌표입니다(lat=${lat}, lon=${lon})`);
  }

  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = (re * sf) / ra ** sn;
  let theta = lon * DEGRAD - OLON;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}
