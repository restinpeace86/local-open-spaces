import type { Page } from '@playwright/test';
import type { NearbyItem } from '@/lib/spaces/get-nearby';

// implementation/todo.md: 실 Supabase PostGIS RPC / Kakao Maps SDK 네트워크 호출은
// Zero-Cost 원칙(project/decision-log.md Decision 001) 및 결정론적 테스트를 위해
// Playwright route 가로채기로 완전히 대체한다. 실제 API 키/도메인 화이트리스트 없이도
// 로컬/CI 모두 동일하게 동작한다.

export const TEST_CENTER = { lat: 37.5665, lng: 126.978 };
export const TEST_LOCATION = { ...TEST_CENTER, address_name: 'E2E 테스트 위치' };

function isoDateOffset(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeEventItem(
  now: Date,
  overrides: Partial<NearbyItem> & Pick<NearbyItem, 'id' | 'name' | 'distance_meters'>
): NearbyItem {
  return {
    category: 'FESTIVAL',
    item_type: 'EVENT',
    lat: TEST_CENTER.lat + 0.001,
    lng: TEST_CENTER.lng + 0.001,
    address: '서울 어딘가',
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: false,
    operating_hours: null,
    is_free: false,
    info_url: null,
    is_kids_friendly: false,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: null,
    booking_status: null,
    ...overrides,
  };
}

// spec/common/search.md 'Quick Filters': 3개 칩(키즈/무료/오늘·주말)의 AND 스크리닝 결과가
// 카드 뱃지 및 리스트 노출과 100% 일치하는지 검증하기 위한 결정론적 픽스처.
// 실행 시점(오늘 날짜) 기준으로 상대 계산하여 실행일과 무관하게 항상 동일한 결과를 보장한다.
export function buildFixtureItems(now: Date = new Date()): NearbyItem[] {
  return [
    makeEventItem(now, {
      id: 'fixture-kids-free-today',
      name: '키즈 무료 체험 마당',
      distance_meters: 120,
      category: 'FESTIVAL',
      is_free: true,
      is_kids_friendly: true,
      is_reservation_required: false,
      start_date: isoDateOffset(now, -1),
      end_date: isoDateOffset(now, 10),
    }),
    makeEventItem(now, {
      id: 'fixture-adult-paid-today',
      name: '성인 유료 팝업 전시',
      distance_meters: 300,
      category: 'POPUP',
      is_free: false,
      is_kids_friendly: false,
      is_reservation_required: false,
      start_date: isoDateOffset(now, 0),
      end_date: isoDateOffset(now, 5),
    }),
    makeEventItem(now, {
      id: 'fixture-infant-free-today',
      name: '영유아 무료 체험 프로그램',
      distance_meters: 450,
      category: 'EXHIBITION',
      is_free: true,
      is_kids_friendly: false,
      target_age_group: '영유아',
      is_reservation_required: false,
      start_date: isoDateOffset(now, -2),
      end_date: isoDateOffset(now, 7),
    }),
    makeEventItem(now, {
      id: 'fixture-reservation-required-paid',
      name: '예약 필수 유료 공연',
      distance_meters: 600,
      category: 'PERFORMANCE',
      is_free: false,
      is_kids_friendly: false,
      is_reservation_required: true,
      start_date: isoDateOffset(now, 0),
      end_date: isoDateOffset(now, 3),
    }),
    makeEventItem(now, {
      id: 'fixture-elementary-paid-future',
      name: '초등 대상 유료 강좌',
      distance_meters: 800,
      category: 'CULTURE',
      is_free: false,
      is_kids_friendly: false,
      target_age_group: '초등',
      is_reservation_required: false,
      start_date: isoDateOffset(now, 30),
      end_date: isoDateOffset(now, 40),
    }),
  ];
}

const KAKAO_SDK_STUB = `
(function () {
  var state = { setBoundsCalls: [], addMarkersCalls: [], setLevelCalls: [] };
  window.__kakaoTestState = state;

  function LatLng(lat, lng) {
    return { getLat: function () { return lat; }, getLng: function () { return lng; } };
  }

  function makeBounds(center, radiusMeters) {
    var latOffset = (radiusMeters || 1000) / 111000;
    var lngOffset = (radiusMeters || 1000) / 88000;
    return {
      getNorthEast: function () { return LatLng(center.lat + latOffset, center.lng + lngOffset); },
      getSouthWest: function () { return LatLng(center.lat - latOffset, center.lng - lngOffset); },
    };
  }

  function Map(container, opts) {
    var level = opts.level || 5;
    var center = { lat: opts.center.getLat(), lng: opts.center.getLng() };
    var listeners = {};
    return {
      setBounds: function (bounds) { state.setBoundsCalls.push(bounds); },
      getBounds: function () { return makeBounds(center, 5000); },
      getCenter: function () { return LatLng(center.lat, center.lng); },
      setCenter: function (latlng) { center = { lat: latlng.getLat(), lng: latlng.getLng() }; },
      getLevel: function () { return level; },
      setLevel: function (l) { level = l; state.setLevelCalls.push(l); },
      relayout: function () {},
      panTo: function () {},
      __addListener: function (event, cb) {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      },
      __removeListener: function (event, cb) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter(function (l) { return l !== cb; });
      },
    };
  }

  function Circle(opts) {
    var center = { lat: opts.center.getLat(), lng: opts.center.getLng() };
    var radius = opts.radius;
    return {
      setMap: function () {},
      setPosition: function (latlng) { center = { lat: latlng.getLat(), lng: latlng.getLng() }; },
      setRadius: function (r) { radius = r; },
      getBounds: function () { return makeBounds(center, radius); },
    };
  }

  function CustomOverlay() {
    return { setMap: function () {}, setPosition: function () {} };
  }

  function MarkerClusterer() {
    return {
      clear: function () {},
      addMarkers: function (markers) { state.addMarkersCalls.push(markers.length); },
    };
  }

  function Marker() { return { setMap: function () {} }; }
  function MarkerImage() { return {}; }
  function Size() { return {}; }
  function Point() { return {}; }

  window.kakao = {
    maps: {
      load: function (cb) { cb(); },
      Map: Map,
      LatLng: LatLng,
      Circle: Circle,
      CustomOverlay: CustomOverlay,
      MarkerClusterer: MarkerClusterer,
      Marker: Marker,
      MarkerImage: MarkerImage,
      Size: Size,
      Point: Point,
      event: {
        addListener: function (target, event, cb) {
          if (target && target.__addListener) target.__addListener(event, cb);
        },
        removeListener: function (target, event, cb) {
          if (target && target.__removeListener) target.__removeListener(event, cb);
        },
      },
    },
  };
})();
`;

type PreparePageOptions = {
  items?: NearbyItem[];
  userLocation?: { lat: number; lng: number; address_name: string } | null;
};

// tests/e2e/core-scenarios.spec.ts 전용: 위치 온보딩을 건너뛰고, RPC/Kakao SDK를 결정론적 픽스처로 대체한 뒤 '/'로 이동한다.
export async function preparePage(page: Page, options: PreparePageOptions = {}): Promise<void> {
  const { items = buildFixtureItems(), userLocation = TEST_LOCATION } = options;

  if (userLocation) {
    await page.addInitScript((location) => {
      window.localStorage.setItem('user_location', JSON.stringify(location));
    }, userLocation);
  }

  await page.route('**/dapi.kakao.com/v2/maps/sdk.js**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: KAKAO_SDK_STUB })
  );

  await page.route('**/rest/v1/rpc/get_nearby_spaces_and_events**', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(items),
    });
  });

  await page.goto('/');
}
