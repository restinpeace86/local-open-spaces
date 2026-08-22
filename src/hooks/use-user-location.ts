'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getStoredUserLocation,
  setStoredUserLocation,
  UserLocation,
} from '@/lib/location/user-location-storage';

// 기본 위치: 서울시청 (위치 미설정 시 폴백)
export const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };

// implementation/todo.md Phase 2: LocalStorage(`user_location`) 기반 비로그인 위치 온보딩
// 최초 진입 시 저장된 위치가 없으면 온보딩 모달을 노출하고, 확정 시 즉시 LocalStorage에 반영한다.
export function useUserLocation() {
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredUserLocation();
    setUserLocation(stored);
    setIsOnboardingOpen(!stored);
  }, []);

  const confirmLocation = useCallback((location: UserLocation) => {
    setStoredUserLocation(location);
    setUserLocation(location);
    setIsOnboardingOpen(false);
  }, []);

  const openOnboarding = useCallback(() => setIsOnboardingOpen(true), []);
  const closeOnboarding = useCallback(() => setIsOnboardingOpen(false), []);

  return {
    center: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : DEFAULT_CENTER,
    addressName: userLocation?.address_name ?? null,
    // Task 9-1-3: 온보딩 확정 시 딱 한 번 계산해 저장한 값을 그대로 읽는다(재계산 없음).
    sigunguName: userLocation?.sigungu_name ?? null,
    isOnboardingOpen,
    confirmLocation,
    openOnboarding,
    closeOnboarding,
  };
}
