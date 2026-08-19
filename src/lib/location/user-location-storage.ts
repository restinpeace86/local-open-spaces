// implementation/todo.md Phase 2: LocalStorage 기반 비로그인 위치 설정 온보딩
export type UserLocation = {
  lat: number;
  lng: number;
  address_name: string;
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

    return { lat: parsed.lat, lng: parsed.lng, address_name: parsed.address_name };
  } catch {
    return null;
  }
}

export function setStoredUserLocation(location: UserLocation): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
}
