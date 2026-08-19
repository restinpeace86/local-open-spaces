// spec/map/kakao-map.md 2: autoload=false로 스크립트를 비동기 로드한 뒤
// kakao.maps.load()로 초기화가 완료된 시점을 보장한다.
let loadPromise: Promise<void> | null = null;

export function loadKakaoMapSdk(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('loadKakaoMapSdk는 브라우저 환경에서만 호출할 수 있습니다.'));
  }

  if (window.kakao?.maps) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;
    if (!appKey) {
      reject(new Error('NEXT_PUBLIC_KAKAO_MAP_API_KEY가 설정되지 않았습니다.'));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false&libraries=clusterer`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => reject(new Error('Kakao Map SDK 로드에 실패했습니다.'));

    document.head.appendChild(script);
  });

  return loadPromise;
}
