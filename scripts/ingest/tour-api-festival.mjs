// Source 06: 한국관광공사 국문 관광정보 TourAPI 4.0 (searchFestival2)
// spec/data/data_sources.md #06 참조
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRows } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { classifyTourApiFestival } from './lib/category-map.mjs';
import { deriveParentalTags, deriveBookingStatus } from './lib/ai-tagging.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchFestivals({ numOfRows = 20, pageNo = 1 } = {}) {
  // data.go.kr serviceKey는 이미 URL-인코딩된 값으로 발급되는 경우가 많아
  // URLSearchParams로 재인코딩하면 이중 인코딩되어 인증에 실패한다.
  // serviceKey만 원본 그대로 붙이고 나머지 파라미터만 인코딩한다.
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'local-open-spaces',
    _type: 'json',
    eventStartDate: todayYYYYMMDD(),
    numOfRows: String(numOfRows),
    pageNo: String(pageNo),
    arrangeType: 'A',
  });

  const url = `${BASE_URL}?serviceKey=${encodeURIComponent(env.TOUR_API_KEY)}&${params.toString()}`;
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`TourAPI 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`TourAPI 응답이 JSON이 아닙니다 (서비스키 오류 가능성): ${text.slice(0, 300)}`);
  }

  const header = json.response?.header;
  if (header?.resultCode !== '0000') {
    throw new Error(`TourAPI 에러 응답: ${header?.resultCode} ${header?.resultMsg}`);
  }

  const items = json.response?.body?.items?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

function mapToEventRow(item) {
  const lng = Number(item.mapx);
  const lat = Number(item.mapy);
  if (!lng || !lat || !item.eventstartdate || !item.eventenddate) return null;

  const startDate = `${item.eventstartdate.slice(0, 4)}-${item.eventstartdate.slice(4, 6)}-${item.eventstartdate.slice(6, 8)}`;
  const endDate = `${item.eventenddate.slice(0, 4)}-${item.eventenddate.slice(4, 6)}-${item.eventenddate.slice(6, 8)}`;

  // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트(개요/주소 등)를 근거로만 태깅한다.
  const tags = deriveParentalTags(JSON.stringify(item));
  const bookingStatus = deriveBookingStatus({
    isReservationRequired: false,
    reservationEndDate: null,
    startDate,
    endDate,
  });

  return {
    external_id: `TOUR_API_${item.contentid}`,
    title: item.title,
    event_type: classifyTourApiFestival(),
    start_date: startDate,
    end_date: endDate,
    location: toPointWKT(lng, lat),
    thumbnail_url: item.firstimage || null,
    is_active: true,
    booking_status: bookingStatus,
    ...tags,
  };
}

async function main() {
  console.log(`▶ TourAPI 축제 정보 수집 시작 (dry-run: ${dryRun})`);
  const items = await fetchFestivals({ numOfRows: 20 });
  console.log(`✅ TourAPI 호출 성공: ${items.length}건 수신`);

  const rows = items.map(mapToEventRow).filter(Boolean);
  console.log(`  → 좌표/일자 유효 데이터: ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  const client = createAdminClient();
  const { count } = await upsertRows(client, 'events', rows);
  console.log(`✅ Supabase events 테이블 upsert 완료: ${count}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
