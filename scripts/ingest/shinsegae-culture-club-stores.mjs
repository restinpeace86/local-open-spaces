// [신세계 아카데미 지점 지오코딩](2026-10-08 사용자 지적): "문화센터 화면...
// 이 탭에서 아직 신세계 문화센터꺼는 안보이는데?" — 원인 실측 확인:
// culture_club_classes는 좌표를 직접 갖지 않고 store_code로 open_spaces
// (EMART_STORE_*/LOTTEMART_STORE_*)를 참조하는데, 신세계 아카데미 지점은
// open_spaces에 전혀 등록돼 있지 않아 위치 기준 검색(Branch-First)의
// 지점 후보 목록에 신세계가 아예 들어갈 수 없었다 — 어떤 브랜드 필터를
// 고르든 base pool 자체에 신세계 강좌가 포함되지 못하는 구조적 공백.
// emart-culture-club-stores.mjs와 동일한 설계(제5장 제4조 기존 구조
// 우선) — 카카오 로컬 키워드 장소 검색으로 지오코딩해 open_spaces에
// 등록한다. 차이점: 이마트는 MT1(대형마트) 카테고리 필터가 있었지만,
// 백화점에 해당하는 공식 카테고리 코드가 카카오 로컬 API 목록에 없어
// (추측 금지, 제3장 제5조) 필터 없이 순수 키워드 검색만 쓴다 — 백화점은
// 지점명 자체가 충분히 구체적(예: "신세계백화점 강남점")이라 오매칭
// 위험이 낮다(실측으로 확인).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { SHINSEGAE_STORES } from './lib/shinsegae-culture-club-parser.mjs';

const env = loadEnv();
const SOURCE_KEY = 'SHINSEGAE_CULTURE_CLUB_STORES';
const CATEGORY_MIN = '백화점문화센터';
const EXTERNAL_ID_PREFIX = 'SHINSEGAE_STORE_';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const REQUEST_PACING_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [쿼리 구성 — 실측으로 두 가지 함정을 발견](2026-10-08):
// 1. "타임스퀘어 & ON"처럼 온라인 통합 표기가 섞인 지점명은 실제 오프라인
//    매장 상호("타임스퀘어점")만으로 검색해야 한다(실측 확인 — "& ON"이
//    그대로 들어가면 검색 결과가 아예 없음).
// 2. "강남점"/"마산점"처럼 이름 자체에 이미 "점"이 붙어있는 경우, 무조건
//    "점"을 덧붙이면 "강남점점"이 돼 검색이 깨지거나(결과 없음) 전혀
//    엉뚱한 곳("뉴코아아울렛강남점")이 1순위로 매칭된다(실측 확인) —
//    이미 "점"으로 끝나면 더 붙이지 않는다. "대구신세계"/"대전신세계"처럼
//    이름에 이미 "신세계"가 들어있으면 "신세계백화점"을 중복으로 앞에
//    붙이지 않는다.
export function buildSearchQuery(store) {
  if (store.storeCode === '01') return '신세계백화점 본점';
  const cleanName = store.storeName.replace(/\s*&\s*ON\s*$/, '').trim();
  const suffix = cleanName.endsWith('점') ? '' : '점';
  if (cleanName.includes('신세계')) return `${cleanName}${suffix}`;
  return `신세계백화점 ${cleanName}${suffix}`;
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
    source: 'shinsegae_culture_club',
    source_type: 'SHINSEGAE_CULTURE_CLUB_STORE',
    category: '백화점',
    category_min: CATEGORY_MIN,
    service_category_id: serviceCategoryId,
    name: geo.placeName,
    display_name: `신세계 ${store.storeName}`,
    address: geo.address,
    location: toPointWKT(geo.lng, geo.lat),
    location_precision: 'EXACT',
    is_free: true,
    operating_hours: null,
    info_url: null,
  };
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
      description: '신세계 아카데미 지점을 open_spaces(백화점문화센터)로 지오코딩 등록',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 신세계 아카데미 지점 지오코딩 수집 시작 (dry-run: ${dryRun})`);

  const client = createAdminClient();
  const serviceCategoryId = await fetchServiceCategoryId(client);
  const stores = SHINSEGAE_STORES.map(([storeCode, storeName]) => ({ storeCode, storeName }));
  console.log(`  → 지점 ${stores.length}개(service_category_id=${serviceCategoryId})`);

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
    console.error(`❌ 신세계 아카데미 지점 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
