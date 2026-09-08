'use client';

import { useEffect, useState } from 'react';
import { haversineDistanceMeters } from '@/lib/geo/haversine';
import { reverseGeocodeAddress } from '@/lib/kakao/geocode';
import { extractSigunguName } from '@/lib/spaces/extract-district';
import { UserLocation } from '@/lib/location/user-location-storage';
import { useLiveGpsPosition } from '@/hooks/use-live-gps-position';

// [실시간 위치 싱크(GPS Sync 팝업)](2026-09-08 사용자 지시, todo.md 개선사항3-3):
// "유저가 사전에 설정한 동네와 현재 실제 GPS 위치 간에 유의미한 차이가 감지될
// 경우, '현재 위치({동네 이름})로 위치를 변경할까요?' 형태의 팝업을 띄우고,
// 수락 시 기본 위치 설정을 현재 GPS 기준으로 업데이트합니다." — "유의미한 차이"의
// 구체적 임계값은 지시문에 명시되지 않았다. 동/읍/면 하나를 넘어서는 이동만
// 감지하고(같은 동네 안에서의 도보/차량 이동에는 반응하지 않음) 오탐이 잦지
// 않도록 2km를 보수적인 기본값으로 채택한다(제3장 제5조 추측 금지 — 근거 없는
// 정밀한 숫자를 지어내는 대신, 판단 기준과 이유를 명시적으로 남긴다).
export const GPS_SYNC_SIGNIFICANT_DISTANCE_METERS = 2000;

export function useGpsSyncCheck(
  configuredCenter: { lat: number; lng: number } | null,
  isOnboardingOpen: boolean
) {
  const livePosition = useLiveGpsPosition();
  const [suggestion, setSuggestion] = useState<UserLocation | null>(null);
  // 한 번 평가했으면(제안했든 안 했든) 같은 세션에서 다시 평가하지 않는다 —
  // 매번 거리를 재보고 팝업을 다시 띄우면 성가시다.
  const [hasEvaluated, setHasEvaluated] = useState(false);

  useEffect(() => {
    // 온보딩이 열려 있으면(아직 동네 설정 전) 비교 기준 자체가 없다. livePosition이
    // 아직 안 왔으면(권한 응답 대기 중 또는 거부) 기다린다 — 거부된 경우는
    // useLiveGpsPosition이 영원히 null을 유지하므로 이 검사도 영원히 보류된다(팝업
    // 없이 조용히 끝남, 에러 노출 없음).
    if (!configuredCenter || isOnboardingOpen || hasEvaluated || !livePosition) return;
    setHasEvaluated(true);

    const distanceMeters = haversineDistanceMeters(configuredCenter, livePosition);
    if (distanceMeters < GPS_SYNC_SIGNIFICANT_DISTANCE_METERS) return;

    reverseGeocodeAddress(livePosition.lat, livePosition.lng)
      .then((addressName) => {
        setSuggestion({
          lat: livePosition.lat,
          lng: livePosition.lng,
          address_name: addressName,
          sigungu_name: extractSigunguName(addressName),
        });
      })
      .catch(() => {
        // 역지오코딩 실패 시 "{동네 이름}"을 채울 수 없어 팝업 자체를 띄우지
        // 않는다 — 추측으로 이름을 지어내지 않는다(제3장 제5조).
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuredCenter?.lat, configuredCenter?.lng, isOnboardingOpen, hasEvaluated, livePosition]);

  function dismiss() {
    setSuggestion(null);
  }

  return { suggestion, dismiss };
}
