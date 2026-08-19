// spec/space/space-detail.md, spec/event/event-detail.md: 카카오맵 길찾기 연동
export function buildKakaoDirectionsUrl(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}
