// [스마트서울맵(서울시 지도정보 플랫폼) 콘텐츠 리스트 API 클라이언트](2026-10-01
// 사용자 지시): "데이터 수집 파이프라인 만들자" — 기존 배치(run-daily.mjs/
// run-monthly.mjs)와 완전 별도 파이프라인으로 둔다(제5장 제4조 공용 유틸만
// 재사용, 소스 목록엔 등록 안 함).
//
// [API 스펙] reference/MGIS_ApplicationServer_Doc(OpenAPIV5).pdf 4.2 콘텐츠
// 리스트 조회: GET /public/themes/contents/ko — 좌표(coord_x/coord_y) + 반경
// (distance, 미터) 기반 검색이라 "테마 전체 목록"을 받으려면 중심좌표를 고정하고
// 반경을 충분히 크게 잡아야 한다.
//
// [반경 300km 채택 근거](2026-10-01 실측): "서울로 떠나는 캠핑" 테마(17건)를
// 서울시청 좌표(126.9780, 37.5665) 기준으로 조회했을 때, 반경 30km에서는 9건,
// 100km에서도 11건만 잡혔고 함평(전남, 약 250km)까지 포함된 전국 단위 콘텐츠라
// 300km에서야 17/17건 전부 잡혔다 — 서울 전용 테마만 있다고 가정하지 않는다
// (제3장 제5조 추측 금지, 실측 기반 기본값).
import { fetchWithTimeout } from '../lib/fetch-with-timeout.mjs';

const SEOUL_CITY_HALL = { lng: 126.978, lat: 37.5665 };
export const SMART_SEOUL_MAP_DEFAULT_DISTANCE_M = 300000;
const PAGE_SIZE = 2000;

export function buildSmartSeoulMapContentsUrl(apiKey, { themeId, pageNo = 1, distance = SMART_SEOUL_MAP_DEFAULT_DISTANCE_M }) {
  const params = new URLSearchParams({
    page_size: String(PAGE_SIZE),
    page_no: String(pageNo),
    coord_x: String(SEOUL_CITY_HALL.lng),
    coord_y: String(SEOUL_CITY_HALL.lat),
    distance: String(distance),
    search_type: '0',
    search_name: '',
    theme_id: themeId,
    content_id: '',
    subcate_id: '',
  });
  return `https://map.seoul.go.kr/openapi/v5/${apiKey}/public/themes/contents/ko?${params.toString()}`;
}

async function fetchContentsPage(apiKey, { themeId, pageNo, distance }) {
  const url = buildSmartSeoulMapContentsUrl(apiKey, { themeId, pageNo, distance });
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    throw new Error(`스마트서울맵 콘텐츠 리스트 조회 실패 (HTTP ${res.status}, theme_id=${themeId})`);
  }
  const json = await res.json();
  if (json.header?.resultCode !== '200') {
    throw new Error(`스마트서울맵 에러 응답 (theme_id=${themeId}): ${JSON.stringify(json.header)}`);
  }
  return {
    items: json.body ?? [],
    totalCount: Number(json.header?.TOTAL_COUNT ?? 0),
    pageCount: Number(json.header?.PAGE_COUNT ?? 1),
  };
}

// 한 테마의 전체 콘텐츠를 페이지네이션으로 전량 조회한다. page_size(2000)보다
// 적은 테마는 1회 호출로 끝난다(이번 5개 테마 중 최대가 655건이라 실제로는
// 전부 1페이지).
export async function fetchAllSmartSeoulMapContents(apiKey, themeId, { distance = SMART_SEOUL_MAP_DEFAULT_DISTANCE_M } = {}) {
  const all = [];
  let pageNo = 1;
  let pageCount = 1;
  do {
    // eslint-disable-next-line no-await-in-loop
    const { items, pageCount: nextPageCount } = await fetchContentsPage(apiKey, { themeId, pageNo, distance });
    all.push(...items);
    pageCount = nextPageCount;
    pageNo += 1;
  } while (pageNo <= pageCount);
  return all;
}
