// Kakao Maps SDK v2는 공식 타입 패키지를 제공하지 않아 이 프로젝트에서 실제로
// 사용하는 API 표면만 최소 타입으로 선언한다.
declare namespace kakao.maps {
  class LatLng {
    constructor(lat: number, lng: number);
    getLat(): number;
    getLng(): number;
  }

  class Map {
    constructor(container: HTMLElement, options: { center: LatLng; level: number });
    setCenter(latlng: LatLng): void;
    panTo(latlng: LatLng): void;
    getCenter(): LatLng;
    relayout(): void;
    setLevel(level: number): void;
  }

  class MarkerImage {
    constructor(src: string, size: Size, options?: { offset?: Point });
  }

  class Size {
    constructor(width: number, height: number);
  }

  class Point {
    constructor(x: number, y: number);
  }

  class Marker {
    constructor(options: { position: LatLng; image?: MarkerImage; map?: Map });
    setMap(map: Map | null): void;
    getPosition(): LatLng;
  }

  namespace event {
    function addListener(target: unknown, type: string, handler: (...args: unknown[]) => void): void;
  }

  namespace MarkerClusterer {
    // constructor는 아래 클래스 선언으로 대체
  }

  class MarkerClusterer {
    constructor(options: { map: Map; averageCenter?: boolean; minLevel?: number; markers?: Marker[] });
    addMarkers(markers: Marker[]): void;
    clear(): void;
  }

  function load(callback: () => void): void;
}

interface Window {
  kakao: typeof kakao;
}
