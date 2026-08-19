import { loadKakaoMapSdk } from '@/lib/kakao/load-kakao-sdk';

export type PlaceSearchResult = {
  addressName: string;
  lat: number;
  lng: number;
};

// implementation/todo.md Phase 2: GPS 좌표를 동네 이름(시/구/동)으로 역변환한다.
export async function reverseGeocodeAddress(lat: number, lng: number): Promise<string> {
  await loadKakaoMapSdk();

  return new Promise((resolve, reject) => {
    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.coord2Address(lng, lat, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK && result[0]?.address) {
        const region = result[0].address;
        const addressName = [region.region_1depth_name, region.region_2depth_name, region.region_3depth_name]
          .filter(Boolean)
          .join(' ');
        resolve(addressName || region.address_name);
      } else {
        reject(new Error('현재 위치의 동네 이름을 확인할 수 없습니다.'));
      }
    });
  });
}

// implementation/todo.md Phase 2: 동네/주소 직접 검색 지원 (Kakao Places 키워드 검색)
export async function searchPlaceKeyword(keyword: string): Promise<PlaceSearchResult[]> {
  await loadKakaoMapSdk();

  return new Promise((resolve, reject) => {
    const places = new window.kakao.maps.services.Places();
    places.keywordSearch(keyword, (result, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        resolve(
          result.map((item) => ({
            addressName: item.place_name
              ? `${item.place_name} (${item.road_address_name || item.address_name})`
              : item.address_name,
            lat: Number(item.y),
            lng: Number(item.x),
          }))
        );
      } else if (status === window.kakao.maps.services.Status.ZERO_RESULT) {
        resolve([]);
      } else {
        reject(new Error('동네/주소 검색에 실패했습니다.'));
      }
    });
  });
}
