// [스팟/이벤트 상세 "주변 주차장/식당" 아코디언 — 도보거리 추정 폴백](2026-10-02 사용자
// 지시): Tmap 보행자 경로 API는 사용자가 "나중에 가입할게"라고 해서 아직 키가 없다
// (TMAP_API_KEY 미설정). 키가 없는 동안에도 기능이 멈추지 않도록(제5장 제11조 무중단
// 원칙) 직선거리 + 평균 보행속도 기반 추정치로 동작하고, 키가 등록되면
// /api/nearby/walking-distance가 자동으로 실제 Tmap 호출로 전환된다(이 폴백은 그대로
// 유지 — Tmap 호출 실패 시의 안전망으로도 쓰인다).
const AVERAGE_WALKING_SPEED_METERS_PER_SECOND = 1.1; // 시속 약 4km/h(성인 평균 도보 속도)
const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export function estimateWalkingDurationSeconds(distanceMeters: number): number {
  return Math.round(distanceMeters / AVERAGE_WALKING_SPEED_METERS_PER_SECOND);
}
