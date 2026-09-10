// [사용자 글쓰기 스팟 검색 — 외부 API Fallback](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항5): "우리 DB에 검색 결과가 없거나 부족한 경우,
// 자동으로 네이버/카카오 로컬 API를 호출하여 외부 장소 리스트를 함께 노출."
// 수집 파이프라인의 scripts/ingest/adapters/lib/kakao-geocoder.mjs와 동일한
// 카카오 로컬 키워드 장소 검색 엔드포인트를 쓰되, Next.js 앱(서버)용으로 별도
// 모듈로 둔다(REST API 키 KAKAO_REST_API_KEY는 서버에서만 — API 라우트에서만 import).

const KAKAO_KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

export type KakaoLocalPlace = {
  // open_spaces.external_id(UNIQUE)로 그대로 쓴다 — 같은 장소를 두 번 등록하지 않기 위함.
  externalId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

type KakaoDoc = {
  id?: string;
  place_name?: string;
  road_address_name?: string;
  address_name?: string;
  x?: string; // 경도
  y?: string; // 위도
};

// 대한민국 대략 경계 — 이 밖의 좌표는 파싱 오류로 보고 버린다(추측 금지).
function isInKorea(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

// 순수 파서(단위 테스트 대상) — route.ts가 이 함수를 그대로 쓴다.
export function parseKakaoLocalDocuments(json: unknown): KakaoLocalPlace[] {
  const docs = (json as { documents?: KakaoDoc[] })?.documents;
  if (!Array.isArray(docs)) return [];
  const out: KakaoLocalPlace[] = [];
  for (const doc of docs) {
    const name = (doc.place_name ?? '').trim();
    const address = (doc.road_address_name || doc.address_name || '').trim();
    const lat = Number(doc.y);
    const lng = Number(doc.x);
    if (!doc.id || !name || !address) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInKorea(lat, lng)) continue;
    out.push({ externalId: `KAKAO_LOCAL_${doc.id}`, name, address, lat, lng });
  }
  return out;
}

export type KakaoLocalSearchResult =
  | { ok: true; items: KakaoLocalPlace[] }
  | { ok: false; error: string };

export async function searchKakaoLocalKeyword(query: string, size = 5): Promise<KakaoLocalSearchResult> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return { ok: false, error: 'KAKAO_REST_API_KEY 미설정' };
  const trimmed = query.trim();
  if (!trimmed) return { ok: true, items: [] };

  const url = `${KAKAO_KEYWORD_SEARCH_URL}?${new URLSearchParams({
    query: trimmed,
    size: String(Math.min(15, Math.max(1, size))),
  }).toString()}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : '카카오 요청 실패' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `카카오 로컬 검색 실패 (HTTP ${res.status}): ${text.slice(0, 200)}` };
  }
  const json = await res.json().catch(() => ({}));
  return { ok: true, items: parseKakaoLocalDocuments(json).slice(0, size) };
}
