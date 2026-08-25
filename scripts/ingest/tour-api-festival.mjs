// Source 06: 한국관광공사 국문 관광정보 TourAPI 4.0 (searchFestival2)
// spec/data/data_sources.md #06 참조
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRawIngestData, upsertRowsSafeMerge } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { classifyTourApiFestival } from './lib/category-map.mjs';
import { deriveParentalTags, deriveBookingStatus } from './lib/ai-tagging.mjs';
import { extractSigunguName } from './adapters/lib/schema-mapper.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');

const BASE_URL = 'https://apis.data.go.kr/B551011/KorService2/searchFestival2';
// [전체 파이프라인 일괄 가동](2026-08-25): BaseCollectorAdapter를 쓰지 않는 레거시 구조라
// RAW 레이어/source/Safe UPSERT를 인라인으로 추가한다.
const SOURCE_KEY = 'TOUR_API_FESTIVAL';
const SOURCE = 'tourapi_4.0';

function todayYYYYMMDD() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

const PAGE_SIZE = 100;

async function fetchFestivalsPage(pageNo) {
  // Task 9-1-1에서 venue_name 백필을 위해 재실행하다 발견해 수정한 버그 2건(실측 확인):
  // (1) env.TOUR_API_KEY는 이미 URL-인코딩된 값인데 여기에 encodeURIComponent를 한 번 더 적용해
  //     이중 인코딩되어 SERVICE_KEY_IS_NOT_REGISTERED_ERROR(HTTP 403)가 났다 — 다른 모든 어댑터가
  //     쓰는 것과 동일하게 원본(디코딩) 키인 env.PUBLIC_DATA_API_KEY + encodeURIComponent 한 번으로
  //     통일한다.
  // (2) arrangeType: 'A'는 이 오퍼레이션에서 INVALID_REQUEST_PARAMETER_ERROR(arrangeType)를
  //     유발하는 잘못된 파라미터였다(실제 호출로 확인) — 유효한 값을 추측해 넣지 않고 파라미터
  //     자체를 제거한다(기본 정렬로 정상 응답되는 것을 실제 호출로 확인함).
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'local-open-spaces',
    _type: 'json',
    eventStartDate: todayYYYYMMDD(),
    numOfRows: String(PAGE_SIZE),
    pageNo: String(pageNo),
  });

  const url = `${BASE_URL}?serviceKey=${encodeURIComponent(env.PUBLIC_DATA_API_KEY)}&${params.toString()}`;
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

  const rawItems = json.response?.body?.items?.item ?? [];
  return {
    items: Array.isArray(rawItems) ? rawItems : [rawItems],
    totalCount: json.response?.body?.totalCount ?? 0,
  };
}

// Task 9-1-4(2026-08-22) 완결성 검증에서 발견: numOfRows=20 단발 호출만 있어 전국 축제 정보
// 전체(실측 totalCount=244건, eventStartDate=오늘 기준) 중 20건만 수집되고 있었다(페이지네이션
// 루프 부재). seoul-culture-events.mjs가 Task 8-4에서 겪었던 것과 동일한 유형의 완결성 문제 —
// 다른 TourAPI 계열 어댑터(kor-tour 등)가 이미 쓰는 것과 동일한 while 루프 패턴으로 통일한다.
async function fetchAllFestivals() {
  const items = [];
  let pageNo = 1;
  let totalCount = Infinity;

  while ((pageNo - 1) * PAGE_SIZE < totalCount) {
    const page = await fetchFestivalsPage(pageNo);
    totalCount = page.totalCount;
    items.push(...page.items);
    pageNo += 1;
  }

  return items;
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
    source: SOURCE,
    event_type: classifyTourApiFestival(),
    start_date: startDate,
    end_date: endDate,
    location: toPointWKT(lng, lat),
    thumbnail_url: item.firstimage || null,
    is_active: true,
    booking_status: bookingStatus,
    // Task 9-1-1: TourAPI searchFestival2에는 별도 장소명 필드가 없어(실측 확인) 주소(addr1)를
    // 장소 표시 대체 텍스트로 사용한다(추측 생성이 아닌 원본 실제 필드).
    venue_name: item.addr1 || null,
    // Task 9-1-3: 별도 구/지역명 필드가 없어(실측 확인) 주소(addr1)에서 시/군/구를 파싱한다.
    sigungu_name: extractSigunguName(item.addr1) ?? null,
    ...tags,
  };
}

async function main() {
  console.log(`▶ TourAPI 축제 정보 수집 시작 (dry-run: ${dryRun})`);
  const items = await fetchAllFestivals();
  console.log(`✅ TourAPI 호출 성공: ${items.length}건 수신`);

  const rows = items.map(mapToEventRow).filter(Boolean);
  console.log(`  → 좌표/일자 유효 데이터: ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  const client = createAdminClient();
  await upsertRawIngestData(
    client,
    SOURCE_KEY,
    items.filter((item) => item.contentid).map((item) => ({ sourceId: String(item.contentid), payload: item }))
  );
  const { count } = await upsertRowsSafeMerge(client, 'events', rows);
  console.log(`✅ Supabase events 테이블 upsert 완료: ${count}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
