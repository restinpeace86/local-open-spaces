// 카카오 로컬 키워드 장소 검색(https://dapi.kakao.com/v2/local/search/keyword.json).
// Task 9-6-5(2026-08-23): VWorld는 도로명/지번 주소 전용 지오코더라 "고양아람누리 아람마슬"
// 같은 시설명/건물명 단독 텍스트는 찾지 못한다(실측 확인, Task 9-6-3 참고) — 카카오 키워드
// 장소 검색은 실제 등록된 장소(POI)명으로 검색 가능해 이런 케이스의 2차 폴백으로 쓴다.
//
// 실측 확인(2026-08-23): NEXT_PUBLIC_KAKAO_MAP_API_KEY(카카오맵 JS SDK 전용 키)로 이 REST
// 엔드포인트를 호출하면 401 "KA Header is required"로 거부된다 — 반드시 별도 발급된
// KAKAO_REST_API_KEY(REST API 키)가 필요하다(Task 9-6-3에서 이미 확인한 제약, 이번에 키가
// 발급돼 해소됨).
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

export function hasKakaoApiKey() {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

// 검색 결과가 없으면 null(추측하지 않음). 여러 건이 검색되면 카카오가 이미 관련도순으로
// 정렬해 반환하므로(공식 문서 기준) 첫 번째 결과를 채택한다.
export async function geocodeKeyword(query) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  const url = `${KEYWORD_SEARCH_URL}?${new URLSearchParams({ query }).toString()}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${apiKey}` } });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kakao 키워드 검색 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const doc = json.documents?.[0];
  if (!doc) return null;

  return { lng: Number(doc.x), lat: Number(doc.y), placeName: doc.place_name };
}
