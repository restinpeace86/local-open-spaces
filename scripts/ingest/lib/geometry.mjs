// PostGIS geometry(Point, 4326) 컬럼은 PostgREST를 통해 EWKT 문자열로 입력 가능
export function toPointWKT(lng, lat) {
  return `SRID=4326;POINT(${lng} ${lat})`;
}
