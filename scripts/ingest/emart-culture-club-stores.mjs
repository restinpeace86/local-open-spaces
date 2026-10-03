// [대형마트 문화센터 신규 표준중분류](2026-10-03 사용자 지시): "현재 이마트 무슨지점
// 다 나와있는데.. 이거 위치 같은거 있어? 있으면 해당 이마트점에 대하여 open_spaces에
// 문화시설 대분류에 '대형마트문화센터'로 해당 스팟들 넣어줘" — emart_culture_club_classes
// 테이블(강좌 데이터)에는 store_code/store_name/store_center만 있고 좌표/주소가 전혀
// 없다(실측 확인) — 카카오 로컬 키워드 장소 검색으로 직접 지오코딩해 open_spaces에
// 등록한다.
//
// [지오코딩 전략 — 실측으로 확정] 단순 "이마트 {지점명}점" 템플릿만으로는 부족하다:
// 1. 트레이더스/스타필드/스타필드시티는 "이마트"가 아니라 별도 브랜드 — store_center
//    필드로 분기해 올바른 브랜드명을 붙인다.
// 2. "이마트트레이더스연산"처럼 이름 자체에 브랜드가 이미 섞인 경우도 있다.
// 3. "천안(쌍용)"/"포항(인덕)"처럼 괄호로 지역을 보조 표기한 경우, 괄호를 제거하고
//    검색해야 실제 지점명과 맞는다(괄호를 그대로 넣거나 공백으로 풀면 오히려 실패/
//    오매칭이 잦았다 — 실측 확인).
// 4. 카카오 키워드 검색에 category_group_code=MT1(대형마트) 필터를 거는 게 필수다 —
//    필터 없이는 "이마트24"(편의점), 입점 브랜드 매장(폴햄키즈, 아프리카안경 등),
//    심지어 전혀 무관한 "LG유플러스 이마트사거리점" 같은 걸 1순위로 잘못 매칭하는
//    사례가 다수 실측 확인됐다.
// 5. 그래도 MT1 필터만으로 못 찾는 경우가 있다 — "경산"은 MT1 검색 결과가 아예
//    없거나(완전히 다른 도시 "반야월"로 엉뚱하게 매칭) 실제로는 "스타필드마켓
//    경산점"이 정답인데 카카오 분류상 MT1이 아니라 "복합쇼핑몰"로 등록돼 있었다
//    (실측 확인) — 이런 알려진 예외만 수동 오버라이드 쿼리를 둔다(추측이 아니라
//    실제 조사로 확정된 값).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';

const env = loadEnv();
const SOURCE_KEY = 'EMART_CULTURE_CLUB_STORES';
const CATEGORY_MIN = '대형마트문화센터';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const REQUEST_PACING_MS = 200;

// [실측 확인된 예외 — MT1 필터로 못 찾거나 완전히 다른 곳으로 잘못 매칭되는 경우]
const MANUAL_QUERY_OVERRIDES = {
  // MT1 필터 시 "반야월"(대구, 완전 다른 도시)로 오매칭됨 — 실제로는 "이마트"가
  // 아니라 "스타필드마켓"으로 브랜드가 바뀐 지점이라 displayName도 함께 override.
  935: { query: '스타필드마켓 경산점', skipMt1Filter: true, displayName: '스타필드마켓 경산점' },
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildSearchQuery(store) {
  const override = MANUAL_QUERY_OVERRIDES[store.store_code];
  if (override) return override;

  const name = store.store_name;
  const noParen = name.replace(/\([^)]*\)/, '').trim();

  if (store.store_center === 'starfieldcity') return { query: `${noParen}점`, skipMt1Filter: false };
  if (store.store_center === 'starfield') return { query: `스타필드 ${noParen.replace('스타필드', '')}점`, skipMt1Filter: false };
  if (name.startsWith('이마트트레이더스')) return { query: name.replace('이마트트레이더스', '트레이더스 ') + '점', skipMt1Filter: false };
  if (name.startsWith('트레이더스')) return { query: name.replace('트레이더스', '트레이더스 ') + '점', skipMt1Filter: false };
  return { query: `이마트 ${noParen}점`, skipMt1Filter: false };
}

async function searchKeyword(query, { mt1 } = {}) {
  const params = { query, size: '5' };
  if (mt1) params.category_group_code = 'MT1';
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

  const { query, skipMt1Filter } = buildSearchQuery(store);

  let docs = skipMt1Filter ? [] : await searchKeyword(query, { mt1: true });
  if (docs.length === 0) {
    await sleep(REQUEST_PACING_MS);
    docs = await searchKeyword(query);
  }

  const doc = docs[0];
  if (!doc) return null;

  return {
    placeName: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    lng: Number(doc.x),
    lat: Number(doc.y),
  };
}

async function fetchDistinctStores(client) {
  const allRows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from('emart_culture_club_classes')
      .select('store_code, store_name, store_center')
      .range(from, from + 999);
    if (error) throw new Error(`지점 목록 조회 실패: ${error.message}`);
    allRows.push(...data);
    if (data.length < 1000) break;
  }

  const byCode = new Map();
  for (const row of allRows) byCode.set(row.store_code, row);
  return [...byCode.values()].sort((a, b) => a.store_code.localeCompare(b.store_code));
}

// [display_name 브랜드 버그 수정 — 실측 확인](2026-10-03) 첫 실행 결과를 직접
// 조회해보니 트레이더스/스타필드 지점에도 "이마트"가 무조건 붙어
// ("이마트 트레이더스킨텍스점" 같은 이상한 이름) 있었다 — buildSearchQuery와
// 동일한 브랜드 분기를 display_name에도 적용해야 한다.
export function buildDisplayName(store) {
  const override = MANUAL_QUERY_OVERRIDES[store.store_code];
  if (override?.displayName) return override.displayName;

  const noParen = store.store_name.replace(/\([^)]*\)/, '').trim();

  if (store.store_center === 'starfieldcity') return `${noParen}점`;
  if (store.store_center === 'starfield') return `스타필드 ${noParen.replace('스타필드', '')}점`;
  if (store.store_name.startsWith('이마트트레이더스')) return `트레이더스 ${noParen.replace('이마트트레이더스', '')}점`;
  if (store.store_name.startsWith('트레이더스')) return `트레이더스 ${noParen.replace('트레이더스', '')}점`;
  return `이마트 ${noParen}점`;
}

export function buildOpenSpaceRow(store, geo, serviceCategoryId) {
  return {
    external_id: `EMART_STORE_${store.store_code}`,
    source: 'emart_culture_club',
    source_type: 'EMART_CULTURE_CLUB_STORE',
    category: '대형마트',
    category_min: CATEGORY_MIN,
    // [노출중분류 누락 버그 수정 — 실측 확인](2026-10-03 사용자 지시: "스팟픽에는
    // 노출중분류가 있는것들만 보여줘야해.. 이런 노출중분류는 없을텐데?") —
    // service_category_id를 안 채우면 category_min만 있고 실제로는 스팟픽에
    // 노출되지 않는다(노출 중분류 미지정 상태) — 첫 실행 때 이 필드를 빠뜨려
    // 64건 전부 null로 들어갔던 걸 사용자가 직접 지적해 발견했다.
    service_category_id: serviceCategoryId,
    name: geo.placeName,
    display_name: buildDisplayName(store),
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
      `service_categories에서 '문화시설/${CATEGORY_MIN}' 조회 실패 — 마이그레이션(2026-10-03-emart-store-category-registration.sql)이 적용됐는지 확인 필요: ${error?.message ?? 'NOT_FOUND'}`
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
      description: '이마트 컬처클럽 지점을 open_spaces(대형마트문화센터)로 지오코딩 등록',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 이마트 컬처클럽 지점 지오코딩 수집 시작 (dry-run: ${dryRun})`);

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
      failed.push({ storeCode: store.store_code, storeName: store.store_name, reason: err.message });
      console.error(`⚠️ ${store.store_code}(${store.store_name}) 지오코딩 실패: ${err.message}`);
      await sleep(REQUEST_PACING_MS);
      continue;
    }

    if (!geo) {
      failed.push({ storeCode: store.store_code, storeName: store.store_name, reason: 'NOT_FOUND' });
      console.error(`⚠️ ${store.store_code}(${store.store_name}) 검색 결과 없음`);
    } else {
      console.log(`  ${store.store_code}(${store.store_name}) → ${geo.placeName} | ${geo.address}`);
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
    console.error(`❌ 이마트 컬처클럽 지점 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
