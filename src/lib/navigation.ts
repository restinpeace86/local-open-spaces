// Task 9-5-1(2026-08-22): 네이버 지도 길안내 URL 연동.
// 공식 문서(guide.ncloud-docs.com/docs/maps-url-scheme, WebSearch/WebFetch로 직접 확인함) 기준:
// - 목적지(dlat/dlng)는 필수, 출발지(slat/slng/sname)는 선택 — 없으면 네이버 지도 앱이 자체
//   GPS 위치를 출발지로 쓴다. 이 함수는 우리 서비스가 이미 알고 있는 유저 위치(전역 설정 또는
//   기기 GPS)를 슬랏에 넘겨 "내 위치 ➔ 목적지" 경로가 앱을 열자마자 바로 뜨도록 한다.
// - appname은 "Android: applicationId, iOS: 번들 ID, 웹 페이지: 웹 페이지의 URL"이라고 명시돼
//   있어, 우리는 웹 서비스이므로 호출 시점의 페이지 origin을 그대로 쓴다.
// - PC/앱 미설치 환경 전용 대체(웹) URL은 네이버 공식 문서에도 명시돼 있지 않음(직접 확인) —
//   임의로 웹 대체 URL을 만들어내지 않는다(추측 금지). 모바일에서 앱이 설치돼 있으면 그대로
//   열리고, 그 외 환경은 네이버 측 스킴 설계상 알려진 한계로 남는다.
export type Coordinates = { lat: number; lng: number };

export function buildNaverMapDirectionsUrl(
  destination: Coordinates & { name: string },
  origin?: Coordinates | null,
  appOrigin?: string
): string {
  const resolvedAppOrigin = appOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');

  const params = new URLSearchParams({
    dlat: String(destination.lat),
    dlng: String(destination.lng),
    dname: destination.name,
    appname: resolvedAppOrigin,
  });

  if (origin) {
    params.set('slat', String(origin.lat));
    params.set('slng', String(origin.lng));
    params.set('sname', '내 위치');
  }

  return `nmap://route/car?${params.toString()}`;
}

// [농장 및 전체 스팟 상세 바텀시트 네이버 딥링크 연동](2026-08-29 사용자 지시): 공식
// 홈페이지가 없는 스팟(특히 신규 농어촌체험휴양마을/농촌교육농장 — is_free/reservation_url/
// affiliate_url이 전부 없어 기존 3분류 CTA가 빈칸이 되는 경우가 많음)에서도 "예약하거나
// 세부 정보를 확인"할 방법이 필요하다는 요청.
//
// 위 buildNaverMapDirectionsUrl과 동일한 근거(guide.ncloud-docs.com/docs/maps-url-scheme,
// WebFetch로 직접 확인)로, 이 문서는 길찾기(`nmap://route`) 외에 검색 전용 스킴도 정의한다:
// `nmap://search?query=`(검색어로 찾기)와 `nmap://place?lat=&lng=&name=`(좌표에 마커 표시).
// 후자는 정확한 좌표에 핀만 찍을 뿐 네이버 플레이스의 리뷰·영업정보·예약 버튼이 있는
// "장소 상세 페이지"로 반드시 연결된다는 보장이 없다 — "예약하거나 세부 정보를 확인"이라는
// 목적에는 이름(+주소)으로 검색해 실제 플레이스 리스팅을 찾아주는 `search` 스킴이 더
// 부합한다(요청사항의 "이름과 주소를 조합" 문구와도 일치). 주소를 함께 붙이는 이유는 동명
// 장소가 다른 지역에도 있을 때 검색 정확도를 높이기 위함이다(요청사항 그대로).
export function buildNaverPlaceSearchUrl(
  spot: { name: string; address?: string | null },
  appOrigin?: string
): string {
  const resolvedAppOrigin = appOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const query = [spot.name, spot.address].filter(Boolean).join(' ');

  const params = new URLSearchParams({ query, appname: resolvedAppOrigin });
  return `nmap://search?${params.toString()}`;
}
