// [이랜드리테일 지점 지오코딩](2026-10-09) culture_club_classes는 좌표를
// 직접 갖지 않고 store_code로 open_spaces를 참조하는데(Branch-First
// 위치 기준 검색), 이랜드리테일 지점도 다른 브랜드와 마찬가지로
// open_spaces에 등록하지 않으면 위치 기반 조회에서 아예 누락된다 —
// 신세계/현대백화점/AK플라자/스타필드/롯데백화점에서 실측으로 확인/
// 수정한 것과 동일한 구조적 공백을 처음부터 피하기 위해 목록 배치와
// 함께 바로 추가한다.
//
// [카테고리 — 아울렛문화센터 재사용](실측 확인) 스타필드/롯데백화점과
// 동일한 이유로 신설한 카테고리를 그대로 쓴다.
//
// [지점명 — culture02.do의 내부 명칭과 실제 건물명이 다름](실측 확인)
// culture02.do의 <select id="StoreID"> 옵션 텍스트(야탑/평촌아울렛/
// 강남패션/순천/부천/송파)는 문화센터 시스템 내부 명칭이고, 실제
// Kakao 지도 검색에 걸리는 건물명은 "NC백화점 OO점"(야탑/순천/부천/
// 송파) 또는 "뉴코아아울렛 OO점"(평촌/강남) — 하나의 규칙으로 일반화
// 되지 않아(2개 체인 혼용) 지점별로 실제 검색 쿼리와 표시용 이름을
// 명시한다(추측 금지, 제3장 제5조 — 전부 실측으로 확인한 값).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';

const env = loadEnv();
const SOURCE_KEY = 'ELAND_RETAIL_CULTURE_CLUB_STORES';
const CATEGORY_MIN = '아울렛문화센터';
const EXTERNAL_ID_PREFIX = 'ELAND_STORE_';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const REQUEST_PACING_MS = 200;

// [storeCode, 검색 쿼리, 표시용 이름 — 전부 실측 확인](위 파일 상단
// 주석 참고) 내부 명칭(강남패션/평촌아울렛)보다 실제 건물명이 사용자
// 에게 더 익숙하므로 표시용 이름은 건물명을 쓴다.
const ELAND_STORE_SEARCH_INFO = [
  ['8202', 'NC백화점 야탑점', 'NC백화점 야탑점'],
  ['8205', '뉴코아아울렛 평촌점', '뉴코아아울렛 평촌점'],
  ['8206', '뉴코아아울렛 강남점', '뉴코아아울렛 강남점'],
  ['8212', 'NC백화점 순천점', 'NC백화점 순천점'],
  ['8222', 'NC백화점 부천점', 'NC백화점 부천점'],
  ['8224', 'NC백화점 송파점', 'NC백화점 송파점'],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildSearchQuery([, query]) {
  return query;
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

export function buildOpenSpaceRow([storeCode, , displayName], geo, serviceCategoryId) {
  return {
    external_id: `${EXTERNAL_ID_PREFIX}${storeCode}`,
    source: 'eland_retail_culture_club',
    source_type: 'ELAND_RETAIL_CULTURE_CLUB_STORE',
    category: '아울렛',
    category_min: CATEGORY_MIN,
    service_category_id: serviceCategoryId,
    name: geo.placeName,
    display_name: displayName,
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
      description: '이랜드리테일 지점을 open_spaces(아울렛문화센터)로 지오코딩 등록',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 이랜드리테일 지점 지오코딩 수집 시작 (dry-run: ${dryRun})`);

  const client = createAdminClient();
  const serviceCategoryId = await fetchServiceCategoryId(client);
  console.log(`  → 지점 ${ELAND_STORE_SEARCH_INFO.length}개(service_category_id=${serviceCategoryId})`);

  const rows = [];
  const failed = [];
  for (const store of ELAND_STORE_SEARCH_INFO) {
    const [storeCode, , displayName] = store;
    let geo;
    try {
      geo = await geocodeStore(store);
    } catch (err) {
      failed.push({ storeCode, displayName, reason: err.message });
      console.error(`⚠️ ${storeCode}(${displayName}) 지오코딩 실패: ${err.message}`);
      await sleep(REQUEST_PACING_MS);
      continue;
    }

    if (!geo) {
      failed.push({ storeCode, displayName, reason: 'NOT_FOUND' });
      console.error(`⚠️ ${storeCode}(${displayName}) 검색 결과 없음`);
    } else {
      console.log(`  ${storeCode}(${displayName}) → ${geo.placeName} | ${geo.address}`);
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
    metaData: { total: ELAND_STORE_SEARCH_INFO.length, success: rows.length, failed: failed.length, failedStores: failed },
  });

  return { sourceKey: SOURCE_KEY, count: rows.length, failed: failed.length, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 이랜드리테일 지점 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
