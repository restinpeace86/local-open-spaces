// [롯데마트 지점 지오코딩](2026-10-07 사용자 지시, project/decision-log.md
// Decision 028 연장): 문화센터 통합 화면에 "본인 위치 기준으로 가까운 것부터"
// 정렬을 넣기 위해, 이마트와 동일하게(emart-culture-club-stores.mjs 참고)
// 롯데마트 60개 지점도 카카오 로컬 키워드 장소 검색으로 지오코딩해
// open_spaces(대형마트문화센터, 이마트와 같은 category_min)에 등록한다. 같은
// category_min을 쓰므로 기존 "가까운 순" RPC(get_nearby_spaces_and_events)
// 인프라를 추가 변경 없이 그대로 재사용할 수 있다.
//
// [MAXX 지점 — 실측 확인] "MAXX영등포점"처럼 라벨에 'MAXX'가 붙은 지점은
// 정식 브랜드명이 "롯데마트맥스"다(이마트의 트레이더스/스타필드처럼 별도
// 서브 브랜드) — 일반 "롯데마트 {지점명}"으로 검색하면 안 된다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';

const env = loadEnv();
const SOURCE_KEY = 'LOTTEMART_CULTURE_CLUB_STORES';
const CATEGORY_MIN = '대형마트문화센터';
const KEYWORD_SEARCH_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const REQUEST_PACING_MS = 200;

// [실측 확인된 예외] MT1(대형마트) 필터로도 못 찾거나 잘못 매칭되는 경우.
// 처음엔 비워두고, 실제 실행 결과를 보고 확정된 예외만 추가한다(추측으로
// 미리 채우지 않음, 제3장 제5조 — emart-culture-club-stores.mjs와 동일한
// 방식).
const MANUAL_QUERY_OVERRIDES = {};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [실측으로 발견한 버그] store_name("고양점" 등)에 이미 "점"이 포함돼 있어,
// 여기서 "점"을 추가로 붙이면 "고양점점"처럼 중복돼 검색이 전부 실패했다
// (최초 dry-run에서 60개 중 52개가 "검색 결과 없음"으로 나와 발견 — 실제로는
// "롯데마트 고양점"만으로 바로 정확히 매칭됐다). "점"을 다시 붙이지 않는다.
export function buildSearchQuery(store) {
  const override = MANUAL_QUERY_OVERRIDES[store.store_code];
  if (override) return override;

  if (store.store_name.startsWith('MAXX')) {
    return { query: `롯데마트맥스 ${store.store_name.replace('MAXX', '')}`, skipMt1Filter: false };
  }
  return { query: `롯데마트 ${store.store_name}`, skipMt1Filter: false };
}

export function buildDisplayName(store) {
  const override = MANUAL_QUERY_OVERRIDES[store.store_code];
  if (override?.displayName) return override.displayName;

  if (store.store_name.startsWith('MAXX')) return `롯데마트맥스 ${store.store_name.replace('MAXX', '')}`;
  return `롯데마트 ${store.store_name}`;
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
    const { data, error } = await client.from('lottemart_culture_club_classes').select('store_code, store_name').range(from, from + 999);
    if (error) throw new Error(`지점 목록 조회 실패: ${error.message}`);
    allRows.push(...data);
    if (data.length < 1000) break;
  }

  const byCode = new Map();
  for (const row of allRows) byCode.set(row.store_code, row);
  return [...byCode.values()].sort((a, b) => a.store_code.localeCompare(b.store_code));
}

export function buildOpenSpaceRow(store, geo, serviceCategoryId) {
  return {
    external_id: `LOTTEMART_STORE_${store.store_code}`,
    source: 'lottemart_culture_club',
    source_type: 'LOTTEMART_CULTURE_CLUB_STORE',
    category: '대형마트',
    category_min: CATEGORY_MIN,
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
  const { data, error } = await client.from('service_categories').select('id').eq('parent_category', '문화시설').eq('category_name', CATEGORY_MIN).single();
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
      description: '롯데마트 문화센터 지점을 open_spaces(대형마트문화센터)로 지오코딩 등록',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 롯데마트 문화센터 지점 지오코딩 수집 시작 (dry-run: ${dryRun})`);

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
    return { sourceKey: SOURCE_KEY, count: rows.length, failed: failed.length, upserted: false, rows };
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
    console.error(`❌ 롯데마트 문화센터 지점 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
