// [스타필드 지점 지오코딩](2026-10-09) culture_club_classes는 좌표를
// 직접 갖지 않고 store_code로 open_spaces를 참조하는데(Branch-First
// 위치 기준 검색), 스타필드 지점도 다른 브랜드와 마찬가지로 open_spaces
// 에 등록하지 않으면 위치 기반 조회에서 아예 누락된다(2026-10-08 신세계
// /현대백화점에서 실측으로 확인/수정한 것과 동일한 구조적 공백 —
// implementation/2026-10-08-culture-club-department-store-visibility-
// fix.md 참고, 처음부터 같은 실수를 반복하지 않기 위해 목록 배치와 함께
// 바로 추가한다).
// shinsegae-culture-club-stores.mjs/akplaza-culture-club-stores.mjs와
// 동일한 설계(제5장 제4조 기존 구조 우선).
//
// [지점 목록 — 3개뿐](starfield-culture-club-parser.mjs STARFIELD_STORES)
// 고양/수원/운정. "스타필드"라는 접두사가 지점마다 다르다(운정만
// "스타필드 빌리지") — 실측 확인(/mcm/selectStoreList.do의 storeFullNm:
// 고양="<span>스타필드</span>고양", 운정="<span><span>스타필드</span>
// 빌리지</span>운정") 하나의 규칙으로 일반화하지 않고 지점별로 명시한다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';

const env = loadEnv();
const SOURCE_KEY = 'STARFIELD_CULTURE_CLUB_STORES';
const CATEGORY_MIN = '쇼핑몰문화센터';
const EXTERNAL_ID_PREFIX = 'STARFIELD_STORE_';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const REQUEST_PACING_MS = 200;

// [지점명 — 실측 확인된 공식 표기](storeFullNm 그대로) Kakao 검색
// 쿼리와 화면 표시용 display_name 둘 다 이 표기를 그대로 쓴다.
const STARFIELD_STORE_NAMES = [
  ['01', '스타필드 고양'],
  ['02', '스타필드 수원'],
  ['03', '스타필드 빌리지 운정'],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildSearchQuery([, fullName]) {
  return fullName;
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

export function buildOpenSpaceRow([storeCode, fullName], geo, serviceCategoryId) {
  return {
    external_id: `${EXTERNAL_ID_PREFIX}${storeCode}`,
    source: 'starfield_culture_club',
    source_type: 'STARFIELD_CULTURE_CLUB_STORE',
    category: '쇼핑몰',
    category_min: CATEGORY_MIN,
    service_category_id: serviceCategoryId,
    name: geo.placeName,
    display_name: fullName,
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
      `service_categories에서 '문화시설/${CATEGORY_MIN}' 조회 실패 — 마이그레이션(2026-10-09-starfield-brand-and-category.sql)이 적용됐는지 확인 필요: ${error?.message ?? 'NOT_FOUND'}`
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
      description: '스타필드 지점을 open_spaces(쇼핑몰문화센터)로 지오코딩 등록',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 스타필드 지점 지오코딩 수집 시작 (dry-run: ${dryRun})`);

  const client = createAdminClient();
  const serviceCategoryId = await fetchServiceCategoryId(client);
  console.log(`  → 지점 ${STARFIELD_STORE_NAMES.length}개(service_category_id=${serviceCategoryId})`);

  const rows = [];
  const failed = [];
  for (const store of STARFIELD_STORE_NAMES) {
    const [storeCode, fullName] = store;
    let geo;
    try {
      geo = await geocodeStore(store);
    } catch (err) {
      failed.push({ storeCode, fullName, reason: err.message });
      console.error(`⚠️ ${storeCode}(${fullName}) 지오코딩 실패: ${err.message}`);
      await sleep(REQUEST_PACING_MS);
      continue;
    }

    if (!geo) {
      failed.push({ storeCode, fullName, reason: 'NOT_FOUND' });
      console.error(`⚠️ ${storeCode}(${fullName}) 검색 결과 없음`);
    } else {
      console.log(`  ${storeCode}(${fullName}) → ${geo.placeName} | ${geo.address}`);
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
    metaData: { total: STARFIELD_STORE_NAMES.length, success: rows.length, failed: failed.length, failedStores: failed },
  });

  return { sourceKey: SOURCE_KEY, count: rows.length, failed: failed.length, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error(`❌ 스타필드 지점 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
