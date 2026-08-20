import proj4 from 'proj4';

// 행정안전부 LocalData 인허가 데이터의 좌표정보(X, Y)는 대부분 EPSG:5174
// (Korean 1985 / Central Belt, Bessel 타원체) 투영좌표계로 제공된다.
// WGS84(EPSG:4326) 위경도로 변환해야 지도/DB(GEOMETRY 4326)에 사용할 수 있다.
const EPSG_5174 =
  '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43';

proj4.defs('EPSG:5174', EPSG_5174);

export function convertEpsg5174ToWgs84(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const [lng, lat] = proj4('EPSG:5174', 'WGS84', [x, y]);
  return { lng, lat };
}
