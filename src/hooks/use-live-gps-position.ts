'use client';

import { useEffect, useState } from 'react';

// [실시간 위치 싱크 + 바텀시트 GPS 거리순 정렬](2026-09-08 사용자 지시, todo.md
// 개선사항3-1·3-3): 두 기능(GPS Sync 팝업, 바텀시트 리스트 정렬) 모두 "사용자의
// 현재 실제 GPS 좌표"가 필요하다 — 이 훅으로 뽑아내 중복 없이 공유한다(제5장
// 제4조 기존 구조 우선). 사용자가 명시적으로 요청한 동작이 아닌 백그라운드
// 조회라 권한 거부/실패 시에도 에러를 노출하지 않고 조용히 null로 남는다(제5장
// 제11조).
export function useLiveGpsPosition() {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // 권한 거부/타임아웃 — 조용히 무시(호출부는 null을 기존 폴백 기준으로 쓴다).
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  }, []);

  return position;
}
