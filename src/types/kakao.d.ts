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
    getLevel(): number;
    getBounds(): LatLngBounds;
    setBounds(bounds: LatLngBounds): void;
  }

  class LatLngBounds {
    getSouthWest(): LatLng;
    getNorthEast(): LatLng;
  }

  class Circle {
    constructor(options: {
      center: LatLng;
      radius: number;
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
    });
    setMap(map: Map | null): void;
    setPosition(latlng: LatLng): void;
    setRadius(radius: number): void;
    getBounds(): LatLngBounds;
  }

  class CustomOverlay {
    constructor(options: {
      position: LatLng;
      content: string | HTMLElement;
      zIndex?: number;
      xAnchor?: number;
      yAnchor?: number;
    });
    setMap(map: Map | null): void;
    setPosition(latlng: LatLng): void;
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
    function removeListener(target: unknown, type: string, handler: (...args: unknown[]) => void): void;
  }

  namespace MarkerClusterer {
    // constructor는 아래 클래스 선언으로 대체
  }

  class MarkerClusterer {
    constructor(options: {
      map: Map;
      averageCenter?: boolean;
      minLevel?: number;
      markers?: Marker[];
      styles?: Record<string, string>[];
    });
    addMarkers(markers: Marker[]): void;
    clear(): void;
  }

  function load(callback: () => void): void;
}

// Kakao Geocoding/Places API(libraries=services): 주소 검색 및 좌표→주소 역geocoding에 사용
declare namespace kakao.maps.services {
  enum Status {
    OK = 'OK',
    ZERO_RESULT = 'ZERO_RESULT',
    ERROR = 'ERROR',
  }

  interface RegionAddress {
    address_name: string;
    region_1depth_name: string;
    region_2depth_name: string;
    region_3depth_name: string;
  }

  interface Coord2AddressResult {
    address: RegionAddress | null;
  }

  class Geocoder {
    coord2Address(
      lng: number,
      lat: number,
      callback: (result: Coord2AddressResult[], status: Status) => void
    ): void;
  }

  interface PlacesSearchResultItem {
    place_name: string;
    address_name: string;
    road_address_name: string;
    x: string;
    y: string;
  }

  class Places {
    keywordSearch(
      keyword: string,
      callback: (result: PlacesSearchResultItem[], status: Status) => void
    ): void;
  }
}

interface Window {
  kakao: typeof kakao;
}
