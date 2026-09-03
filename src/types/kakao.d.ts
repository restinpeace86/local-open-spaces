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
    // Task 9-5-1(2026-08-22): 미니맵(mini-map.tsx)에서 콤팩트 위젯 모드일 때 확대/이동
    // 상호작용을 꺼두기 위해 추가 — 카카오 맵 JS SDK v2 공식 API에 실제로 존재하는 메서드다.
    setDraggable(draggable: boolean): void;
    setZoomable(zoomable: boolean): void;
    // [인앱 길찾기](2026-09-03): 출발지·경로·목적지가 모두 보이도록 뷰포트를 자동으로
    // 맞추기 위해 추가 — 공식 API에 실제로 존재하는 메서드다.
    setBounds(bounds: LatLngBounds): void;
  }

  // [인앱 길찾기](2026-09-03 사용자 지시): 경로 좌표를 지도 위에 선으로 그리기 위해 추가.
  class Polyline {
    constructor(options: {
      path: LatLng[];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
    });
    setMap(map: Map | null): void;
  }

  // [인앱 길찾기](2026-09-03 사용자 지시): 여러 좌표(출발지+경로 전체)를 한 화면에 담기
  // 위한 뷰포트 계산에 쓴다.
  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
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
      // Task 9-6-10(2026-08-23): 계층별(시/군→구/동→개별 마커) 클러스터링 튜닝에 사용 —
      // 카카오 맵 JS SDK v2 공식 API에 실제로 존재하는 옵션이다(격자 셀 픽셀 크기).
      gridSize?: number;
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
