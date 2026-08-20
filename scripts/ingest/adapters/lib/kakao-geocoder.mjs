// 원본 데이터에 좌표가 없고 주소/지역명 텍스트만 있는 소스를 위한 지오코딩 헬퍼.
// 카카오 REST API 키(KAKAO_REST_API_KEY)가 필요하다 — Kakao Developers 앱의
// [앱 키] 탭에서 확인 가능한 "REST API 키"이며, 지도 렌더링에 쓰는
// NEXT_PUBLIC_KAKAO_MAP_API_KEY(JavaScript 키, 도메인 제한)와는 다른 값이다.
const ADDRESS_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/address.json';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';

export function hasKakaoRestApiKey() {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

async function callKakaoLocal(url, query) {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) {
    throw new Error('KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다. (Kakao Developers > 앱 키 > REST API 키)');
  }

  const res = await fetch(`${url}?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Kakao 지오코딩 호출 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }

  return res.json();
}

// 주소 검색 우선 시도, 결과 없으면 키워드(장소명) 검색으로 폴백한다.
// (원본 데이터의 "서비스 지역" 값이 정식 주소일 때도, 국립공원명 같은 지명일 때도 있음)
export async function geocode(query) {
  if (!query) return null;

  const addressResult = await callKakaoLocal(ADDRESS_SEARCH_URL, query);
  const addressDoc = addressResult.documents?.[0];
  if (addressDoc) {
    return { lng: Number(addressDoc.x), lat: Number(addressDoc.y) };
  }

  const keywordResult = await callKakaoLocal(KEYWORD_SEARCH_URL, query);
  const keywordDoc = keywordResult.documents?.[0];
  if (keywordDoc) {
    return { lng: Number(keywordDoc.x), lat: Number(keywordDoc.y) };
  }

  return null;
}
