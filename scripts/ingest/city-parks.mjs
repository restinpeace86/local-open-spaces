// Source 01: 전국 도시공원 정보 표준데이터 (data.go.kr tn_pubr_public_cty_park_info_api)
// spec/data/data_sources.md #01 참조
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRows } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { deriveParentalTags } from './lib/ai-tagging.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');
const maxPagesArg = process.argv.find((a) => a.startsWith('--max-pages='));
const maxPages = maxPagesArg ? Number(maxPagesArg.split('=')[1]) : Infinity;

const BASE_URL = 'http://api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api';
const PAGE_SIZE = 100;

async function fetchPage(pageNo) {
  const url = `${BASE_URL}?serviceKey=${encodeURIComponent(env.PUBLIC_DATA_API_KEY)}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`전국 도시공원 정보 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  if (json.header?.resultCode !== '00') {
    throw new Error(`API 에러 응답: ${json.header?.resultCode} ${json.header?.resultMsg}`);
  }

  const items = json.body?.items?.item ?? [];
  return {
    items: Array.isArray(items) ? items : [items],
    totalCount: json.body?.totalCount ?? 0,
  };
}

function mapToOpenSpaceRow(item) {
  const lng = Number(item.longitude);
  const lat = Number(item.latitude);
  if (!lng || !lat || !item.parkNm || !item.manageNo) return null;

  // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트(주요시설/안내 등)를 근거로만 태깅한다.
  const tags = deriveParentalTags(JSON.stringify(item));

  return {
    external_id: `CITY_PARK_${item.manageNo}`,
    source_type: 'PARK_API',
    name: item.parkNm,
    category: 'PARK',
    address: item.rdnmadr || item.lnmadr || '',
    location: toPointWKT(lng, lat),
    is_free: true,
    operating_hours: null,
    info_url: null,
    raw_data: item,
    ...tags,
  };
}

async function main() {
  console.log(`▶ 전국 도시공원 정보 수집 시작 (dry-run: ${dryRun}, max-pages: ${maxPages})`);

  const client = dryRun ? null : createAdminClient();
  let pageNo = 1;
  let totalUpserted = 0;
  let totalCount = Infinity;
  const sample = [];

  while (pageNo <= Math.min(maxPages, Math.ceil(totalCount / PAGE_SIZE))) {
    const { items, totalCount: tc } = await fetchPage(pageNo);
    totalCount = tc;
    const rows = items.map(mapToOpenSpaceRow).filter(Boolean);

    if (dryRun) {
      sample.push(...rows.slice(0, 3 - sample.length));
    } else if (rows.length > 0) {
      const { count } = await upsertRows(client, 'open_spaces', rows);
      totalUpserted += count;
    }

    console.log(`  페이지 ${pageNo}: ${items.length}건 수신 (전체 ${totalCount}건 중)`);
    pageNo += 1;
  }

  if (dryRun) {
    console.log(JSON.stringify(sample, null, 2));
    console.log(`✅ dry-run 완료 (전체 ${totalCount}건 중 ${maxPages}페이지 확인)`);
  } else {
    console.log(`✅ Supabase open_spaces 테이블 upsert 완료: 총 ${totalUpserted}건`);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
