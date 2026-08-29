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

// [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 직전 작업에서 추가했던
// "공식 홈페이지가 없으면 이름+주소로 네이버 검색 딥링크를 만들어 보여주는" 폴백
// (buildNaverPlaceSearchUrl)을 완전히 제거했다 — 이제 그 자리는 자체 간편 예약/신청 폼
// (ReservationRequestModal, POST /api/reservations)이 대신한다. 유저를 외부 앱/사이트로
// 내보내지 않고 우리 서비스 안에서 신청 접수까지 끝내기 위함이다.
