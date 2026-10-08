// [현대백화점 지점 지오코딩](2026-10-08 사용자 지적으로 발견한 동일 버그 —
// 신세계 아카데미와 똑같은 원인): culture_club_classes는 좌표를 직접 갖지
// 않고 store_code로 open_spaces를 참조하는데, 현대백화점 지점도 신세계와
// 마찬가지로 open_spaces에 전혀 등록돼 있지 않았다 — 위치 기준 검색
// (Branch-First)의 지점 후보에 현대백화점이 아예 들어갈 수 없는 구조적
// 공백(사용자가 신세계만 지적했지만, 현대백화점도 2026-10-08에 같은 날
// 추가된 브랜드라 동일한 공백이 있었다 — 발견한 김에 함께 고친다).
// shinsegae-culture-club-stores.mjs와 동일한 설계(제5장 제4조).
//
// [지점 목록 — 실측] 전용 지점 목록 API가 없어(Decision 029, 아직 미지원)
// 신세계처럼 미리 확정된 상수가 없다 — 이미 수집된 culture_club_classes
// 데이터 자체에서 실제로 등장한 store_code/store_name 조합을 그대로
// 쓴다(emart-culture-club-stores.mjs의 fetchDistinctStores와 동일한 방식).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';

const env = loadEnv();
const SOURCE_KEY = 'HYUNDAI_CULTURE_CLUB_STORES';
const CATEGORY_MIN = '백화점문화센터';
const EXTERNAL_ID_PREFIX = 'HYUNDAI_STORE_';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const REQUEST_PACING_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [쿼리 구성 — 신세계와 동일한 함정 회피](2026-10-08 실측) 이름이 이미
// "점"으로 끝나면 중복으로 더 붙이지 않는다("가든파이브"만 예외 — "점"이
// 없는 유일한 이름).
export function buildSearchQuery(store) {
  const suffix = store.storeName.endsWith('점') ? '' : '점';
  return `현대백화점 ${store.storeName}${suffix}`;
}

async function searchKeyword(query) {
  const params = { query, size: '5' };
  const url = `${KEYWORD_SEARCH_URL}?${new URLSearchParams(params)}`;
  const res = await fetchWithTimeout(url, { headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` } });
  if (!res.ok) {
    throw new Error(`Kakao 키워드 검색 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const json = await res.json();
  return json.documents ?? [];
}

export async function geocodeStore(store) {
  if (!env.KAKAO_REST_API_KEY) {
    throw new Error('KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const docs = await searchKeyword(buildSearchQuery(store));
  const doc = docs[0];
  if (!doc) return null;

  return {
    placeName: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    lng: Number(doc.x),
    lat: Number(doc.y),
  };
}

export function buildOpenSpaceRow(store, geo, serviceCategoryId) {
  return {
    external_id: `${EXTERNAL_ID_PREFIX}${store.storeCode}`,
    source: 'hyundai_culture_club',
    source_type: 'HYUNDAI_CULTURE_CLUB_STORE',
    category: '백화점',
    category_min: CATEGORY_MIN,
    service_category_id: serviceCategoryId,
    name: geo.placeName,
    display_name: `현대백화점 ${store.storeName}`,
    address: geo.address,
    location: toPointWKT(geo.lng, geo.lat),
    location_precision: 'EXACT',
    is_free: true,
    operating_hours: null,
    info_url: null,
  };
}

async function fetchDistinctStores(client) {
  const allRows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('store_code, store_name')
      .eq('brand', 'hyundai')
      .range(from, from + 999);
    if (error) throw new Error(`지점 목록 조회 실패: ${error.message}`);
    allRows.push(...data);
    if (data.length < 1000) break;
  }

  const byCode = new Map();
  for (const row of allRows) byCode.set(row.store_code, row.store_name);
  return [...byCode.entries()].map(([storeCode, storeName]) => ({ storeCode, storeName })).sort((a, b) => a.storeCode.localeCompare(b.storeCode));
}

async function fetchServiceCategoryId(client) {
  const { data, error } = await client
    .from('service_categories')
    .select('id')
    .eq('parent_category', '문화시설')
    .eq('category_name', CATEGORY_MIN)
    .single();
  if (error || !data) {
    throw new Error(
      `service_categories에서 '문화시설/${CATEGORY_MIN}' 조회 실패 — 마이그레이션(2026-10-08-department-store-culture-center-category.sql)이 적용됐는지 확인 필요: ${error?.message ?? 'NOT_FOUND'}`
    );
  }
  return data.id;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '현대백화점 지점을 open_spaces(백화점문화센터)로 지오코딩 등록',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 현대백화점 지점 지오코딩 수집 시작 (dry-run: ${dryRun})`);

  const client = createAdminClient();
  const serviceCategoryId = await fetchServiceCategoryId(client);
  const stores = await fetchDistinctStores(client);
  console.log(`  → 지점 ${stores.length}개 발견 (service_category_id=${serviceCategoryId})`);

  const rows = [];
  const failed = [];
  for (const store of stores) {
    let geo;
    try {
      geo = await geocodeStore(store);
    } catch (err) {
      failed.push({ storeCode: store.storeCode, storeName: store.storeName, reason: err.message });
      console.error(`⚠️ ${store.storeCode}(${store.storeName}) 지오코딩 실패: ${err.message}`);
      await sleep(REQUEST_PACING_MS);
      continue;
    }

    if (!geo) {
      failed.push({ storeCode: store.storeCode, storeName: store.storeName, reason: 'NOT_FOUND' });
      console.error(`⚠️ ${store.storeCode}(${store.storeName}) 검색 결과 없음`);
    } else {
      console.log(`  ${store.storeCode}(${store.storeName}) → ${geo.placeName} | ${geo.address}`);
      rows.push(buildOpenSpaceRow(store, geo, serviceCategoryId));
    }
    await sleep(REQUEST_PACING_MS);
  }

  console.log(`✅ 지오코딩 완료: 성공 ${rows.length}건 / 실패 ${failed.length}건`);

  if (dryRun) {
    return { sourceKey: SOURCE_KEY, count: rows.length, failed: failed.length, upserted: false };
  }

  if (rows.length > 0) {
    const { error } = await client.from('open_spaces').upsert(rows, { onConflict: 'external_id' });
    if (error) {
      await postPipelineLog(client, { status: 'FAILED', errorMessage: error.message.slice(0, 500) });
      throw new Error(`open_spaces upsert 실패: ${error.message}`);
    }
  }

  console.log(`✅ Supabase(open_spaces) upsert 완료: ${rows.length}건`);
  await postPipelineLog(client, {
    status: failed.length > 0 ? 'FAILED' : 'OK',
    errorMessage: failed.length > 0 ? `${failed.length}건 지오코딩 실패: ${failed.map((f) => f.storeCode).join(',')}` : null,
    metaData: { total: stores.length, success: rows.length, failed: failed.length, failedStores: failed },
  });

  return { sourceKey: SOURCE_KEY, count: rows.length, failed: failed.length, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 현대백화점 지점 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
