// [롯데백화점 지점 지오코딩](2026-10-09) culture_club_classes는 좌표를
// 직접 갖지 않고 store_code로 open_spaces를 참조하는데(Branch-First
// 위치 기준 검색), 롯데백화점 지점도 다른 브랜드와 마찬가지로 open_spaces
// 에 등록하지 않으면 위치 기반 조회에서 아예 누락된다 — 신세계/현대백화점
// /AK플라자/스타필드에서 실측으로 확인/수정한 것과 동일한 구조적 공백을
// 처음부터 피하기 위해 목록 배치와 함께 바로 추가한다.
//
// [카테고리 — 백화점문화센터 재사용](실측 확인) 롯데백화점은 현대백화점/
// 신세계/AK플라자와 동일하게 진짜 "백화점"이라 기존 category_min을 그대로
// 쓴다 — 새 카테고리/RPC 변경 불필요.
//
// [지점명 — 31개, 일부는 "롯데백화점" 접두사를 붙이면 안 됨](실측 확인)
// "타임빌라스 수원"/"롯데몰광명점"은 이미 완전한 고유명(롯데그룹의 다른
// 하위 브랜드)이라 "롯데백화점"을 앞에 붙이면 엉뚱한 장소가 매칭될 수
// 있다 — 신세계의 "이미 브랜드명이 포함되면 중복 안 붙임"과 동일한
// 함정 회피 패턴.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { LOTTE_DEPARTMENT_STORES } from './lib/lotte-department-culture-club-parser.mjs';

const env = loadEnv();
const SOURCE_KEY = 'LOTTE_DEPARTMENT_CULTURE_CLUB_STORES';
const CATEGORY_MIN = '백화점문화센터';
const EXTERNAL_ID_PREFIX = 'LOTTEDEPT_STORE_';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const REQUEST_PACING_MS = 200;

// [이미 완전한 고유명인 지점](위 파일 상단 주석 참고) — "롯데백화점"을
// 붙이지 않고 그대로 검색한다.
const STANDALONE_BRAND_NAMES = new Set(['타임빌라스 수원', '롯데몰광명점']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildSearchQuery([, storeName]) {
  if (STANDALONE_BRAND_NAMES.has(storeName)) return storeName;
  return `롯데백화점 ${storeName}`;
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

export function buildOpenSpaceRow([storeCode, storeName], geo, serviceCategoryId) {
  return {
    external_id: `${EXTERNAL_ID_PREFIX}${storeCode}`,
    source: 'lotte_department_culture_club',
    source_type: 'LOTTE_DEPARTMENT_CULTURE_CLUB_STORE',
    category: '백화점',
    category_min: CATEGORY_MIN,
    service_category_id: serviceCategoryId,
    name: geo.placeName,
    display_name: STANDALONE_BRAND_NAMES.has(storeName) ? storeName : `롯데백화점 ${storeName}`,
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
    throw new Error(`service_categories에서 '문화시설/${CATEGORY_MIN}' 조회 실패: ${error?.message ?? 'NOT_FOUND'}`);
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
      description: '롯데백화점 지점을 open_spaces(백화점문화센터)로 지오코딩 등록',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 롯데백화점 지점 지오코딩 수집 시작 (dry-run: ${dryRun})`);

  const client = createAdminClient();
  const serviceCategoryId = await fetchServiceCategoryId(client);
  console.log(`  → 지점 ${LOTTE_DEPARTMENT_STORES.length}개(service_category_id=${serviceCategoryId})`);

  const rows = [];
  const failed = [];
  for (const store of LOTTE_DEPARTMENT_STORES) {
    const [storeCode, storeName] = store;
    let geo;
    try {
      geo = await geocodeStore(store);
    } catch (err) {
      failed.push({ storeCode, storeName, reason: err.message });
      console.error(`⚠️ ${storeCode}(${storeName}) 지오코딩 실패: ${err.message}`);
      await sleep(REQUEST_PACING_MS);
      continue;
    }

    if (!geo) {
      failed.push({ storeCode, storeName, reason: 'NOT_FOUND' });
      console.error(`⚠️ ${storeCode}(${storeName}) 검색 결과 없음`);
    } else {
      console.log(`  ${storeCode}(${storeName}) → ${geo.placeName} | ${geo.address}`);
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
    metaData: { total: LOTTE_DEPARTMENT_STORES.length, success: rows.length, failed: failed.length, failedStores: failed },
  });

  return { sourceKey: SOURCE_KEY, count: rows.length, failed: failed.length, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 롯데백화점 지점 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
