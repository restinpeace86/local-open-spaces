export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// Task 9-1-1: 카드 UI의 위치 표기를 "[장소명] · [거리]" 형태로 통일한다(EventCard/SpaceGridCard/
// HeroCarousel 공용). address가 없으면 거리만, 거리가 없으면(distance_meters < 0) 장소명만 보여준다
// — "장소 정보 없음" 같은 placeholder 문구는 쓰지 않는다.
export function formatVenueLine(address: string | null, distanceMeters: number): string {
  const parts: string[] = [];
  if (address) parts.push(address);
  if (distanceMeters >= 0) parts.push(formatDistance(distanceMeters));
  return parts.join(' · ');
}

export function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) return null;
  if (startDate === endDate) return startDate;
  return `${startDate} ~ ${endDate}`;
}

export function formatDateTime(dateTimeStr: string | null): string | null {
  if (!dateTimeStr) return null;
  const date = new Date(dateTimeStr);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
