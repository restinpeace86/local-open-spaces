'use client';

import { useEffect, useState } from 'react';

// 기본 위치: 서울시청 (위치 권한 거부/미지원 시 폴백)
export const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

export function useUserLocation() {
  const [location, setLocation] = useState(DEFAULT_CENTER);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        // 위치 권한 거부/실패 시 기본 위치 유지
      },
      { timeout: 5000 }
    );
  }, []);

  return location;
}
