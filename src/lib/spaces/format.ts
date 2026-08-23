import { normalizeSigunguProvince } from '@/lib/geo/korea-region-lookup';

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

// Task 9-1-3: 카드 UI의 위치 표기를 "[장소명] · [시/군/구]" 형태로 통일한다(EventCard/
// SpaceGridCard/HeroCarousel 공용, 예: "율동공원 야외무대 · 성남시 분당구"). 매 요청마다
// Haversine을 계산해 거리를 보여주던 방식(Task 9-1-1)을 걷어내고, 인덱싱된 sigungu_name
// 컬럼 값을 그대로 표시한다. sigunguName이 없는 경우(예: 아직 sigungu_name이 없는 실제
// 거리 기반 지역 도감 페이지의 NearbyItem)에는 distanceMeters가 주어졌을 때만 거리로 대체한다
// — 두 값 모두 없으면 장소명만, 장소명도 없으면 빈 문자열(placeholder 문구 없음).
// Task 9-6-8(2026-08-23): 인제스트 단계(schema-mapper.mjs)와 DB 마이그레이션으로 광역 지자체
// 접두를 이미 보완했지만, 표시 시점에도 한 번 더 normalizeSigunguProvince를 거쳐 혹시 남아있는
// (또는 향후 유입될) 접두 누락 값까지 방어적으로 보완한다 — 판별 불가능한 값은 그대로 둔다.
export function formatVenueLine(
  address: string | null,
  sigunguName?: string | null,
  distanceMeters?: number
): string {
  const parts: string[] = [];
  if (address) parts.push(address);
  if (sigunguName) {
    parts.push(normalizeSigunguProvince(sigunguName));
  } else if (typeof distanceMeters === 'number' && distanceMeters >= 0) {
    parts.push(formatDistance(distanceMeters));
  }
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
