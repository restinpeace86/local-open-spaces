// spec/map/kakao-map.md 4.1: 기본 핀 대신 카테고리별로 구분되는 커스텀 마커를 사용한다.
// implementation/todo.md: 파란 반경 서클(fill #3b82f6) 위에서도 핀이 묻히지 않도록 외곽은
// 보색 대비의 코랄-레드오렌지 계열로 통일하고, 카테고리 구분은 중앙 도트 색상으로 유지한다.
export function buildMarkerSvgDataUrl(color: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <defs>
        <linearGradient id="pin-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FF5722" />
          <stop offset="100%" stop-color="#FF3D00" />
        </linearGradient>
        <filter id="pin-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-color="#000000" flood-opacity="0.4" />
        </filter>
      </defs>
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z" fill="url(#pin-fill)" stroke="white" stroke-width="2" filter="url(#pin-shadow)"/>
      <circle cx="14" cy="14" r="5" fill="${color}" stroke="white" stroke-width="1"/>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
