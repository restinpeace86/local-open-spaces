// implementation/todo.md Phase 2: LocalStorage 기반 비로그인 위치 설정 온보딩
export type UserLocation = {
  lat: number;
  lng: number;
  address_name: string;
  // Task 9-1-3: 위치를 "설정하는 시점"(온보딩 모달 확정 시) 딱 한 번 계산해 저장한다.
  // 홈 피드를 불러올 때마다(요청마다) 주소 문자열을 재파싱하지 않기 위함 — 저장된 값을
  // 그대로 읽어서 쓴다. 위치 확정 이전(구버전 저장값 등)이라 값이 없으면 null.
  sigungu_name: string | null;
};

const STORAGE_KEY = 'user_location';

export function getStoredUserLocation(): UserLocation | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<UserLocation>;
    if (
      typeof parsed.lat !== 'number' ||
      typeof parsed.lng !== 'number' ||
      typeof parsed.address_name !== 'string'
    ) {
      return null;
    }

    return {
      lat: parsed.lat,
      lng: parsed.lng,
      address_name: parsed.address_name,
      sigungu_name: typeof parsed.sigungu_name === 'string' ? parsed.sigungu_name : null,
    };
  } catch {
    return null;
  }
}

export function setStoredUserLocation(location: UserLocation): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
}
