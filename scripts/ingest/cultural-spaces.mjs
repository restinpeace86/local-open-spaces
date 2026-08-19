// Source 03: 서울시 문화공간 정보 (spec/data/data_sources.md #03 대체 — 사용자 확인 서비스명)
// 주의: 응답 필드명 X_COORD/Y_COORD가 실제로는 위도/경도가 뒤바뀌어 있음을 실제 응답으로 확인함
// (X_COORD ≈ 37.x = 위도, Y_COORD ≈ 127.x = 경도). 필드명을 그대로 믿지 않고 값 범위로 검증함.
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRows } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');

const BASE = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'culturalSpaceInfo';
const PAGE_SIZE = 100;

async function fetchPage(startIdx, endIdx) {
  const url = `${BASE}/${env.SEOUL_OPEN_DATA_KEY}/json/${SERVICE_NAME}/${startIdx}/${endIdx}/`;
  const res = await fetch(url);
  const text = await res.text();

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${SERVICE_NAME} 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  const body = json[SERVICE_NAME];
  if (body?.RESULT?.CODE !== 'INFO-000') {
    throw new Error(`${SERVICE_NAME} 오류: ${body?.RESULT?.CODE} ${body?.RESULT?.MESSAGE}`);
  }

  return { items: body.row ?? [], totalCount: body.list_total_count ?? 0 };
}

function mapToOpenSpaceRow(item) {
  // 필드명과 실제 값이 뒤바뀌어 있어 값 범위로 위도/경도를 판별한다 (한국 위도 33~39, 경도 124~132).
  const a = Number(item.X_COORD);
  const b = Number(item.Y_COORD);
  const lat = a >= 30 && a <= 40 ? a : b;
  const lng = a >= 30 && a <= 40 ? b : a;

  if (!lng || !lat || !item.FAC_NAME || !item.NUM) return null;

  return {
    external_id: `CULTURE_SPACE_${item.NUM}`,
    source_type: 'CULTURE_FACILITY',
    name: item.FAC_NAME,
    category: 'CULTURE',
    address: item.ADDR || '',
    location: toPointWKT(lng, lat),
    is_free: item.ENTRFREE === '무료',
    operating_hours: item.OPENHOUR || null,
    info_url: item.HOMEPAGE || null,
    raw_data: item,
  };
}

async function main() {
  console.log(`▶ 서울시 문화공간 정보 수집 시작 (dry-run: ${dryRun})`);

  const client = dryRun ? null : createAdminClient();
  let startIdx = 1;
  let totalCount = Infinity;
  let totalUpserted = 0;
  const sample = [];

  while (startIdx <= totalCount) {
    const endIdx = startIdx + PAGE_SIZE - 1;
    const { items, totalCount: tc } = await fetchPage(startIdx, endIdx);
    totalCount = tc;

    const rows = items.map(mapToOpenSpaceRow).filter(Boolean);

    if (dryRun) {
      sample.push(...rows.slice(0, 3 - sample.length));
    } else if (rows.length > 0) {
      const { count } = await upsertRows(client, 'open_spaces', rows);
      totalUpserted += count;
    }

    console.log(`  ${startIdx}~${endIdx}: ${items.length}건 수신 (전체 ${totalCount}건 중)`);
    startIdx += PAGE_SIZE;
  }

  if (dryRun) {
    console.log(JSON.stringify(sample, null, 2));
    console.log(`✅ dry-run 완료 (전체 ${totalCount}건 확인)`);
  } else {
    console.log(`✅ Supabase open_spaces 테이블 upsert 완료: 총 ${totalUpserted}건`);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
