export {};

// tests/e2e/support/mocks.ts의 Kakao SDK 스텁이 window에 노출하는 호출 기록 - 지도 자동 줌/클러스터링 검증용.
declare global {
  interface Window {
    __kakaoTestState?: {
      setBoundsCalls: unknown[];
      addMarkersCalls: number[];
      setLevelCalls: number[];
    };
  }
}
