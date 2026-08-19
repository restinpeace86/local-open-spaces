// Source 05: 서울시 문화행사 정보 (data.seoul.go.kr culturalEventInfo)
// spec/data/data_sources.md #05 참조
import crypto from 'crypto';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRows } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { classifySeoulCultureEvent } from './lib/category-map.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');

async function fetchCultureEvents({ startIdx = 1, endIdx = 20 } = {}) {
  const url = `http://openapi.seoul.go.kr:8088/${env.SEOUL_OPEN_DATA_KEY}/json/culturalEventInfo/${startIdx}/${endIdx}/`;
  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`서울 열린데이터광장 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`서울 열린데이터광장 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  const result = json.culturalEventInfo?.RESULT ?? json.RESULT;
  if (result && result.CODE !== 'INFO-000') {
    throw new Error(`서울 열린데이터광장 에러 응답: ${result.CODE} ${result.MESSAGE}`);
  }

  return json.culturalEventInfo?.row ?? [];
}

// 원본 API에 안정적인 고유 ID 필드가 없어 TITLE+STRTDATE+PLACE 조합의 결정적 해시를
// external_id로 사용한다 (project/database_schema.md의 Upsert 기준 키 요건 충족 목적).
function buildExternalId(item) {
  const raw = `${item.TITLE}|${item.STRTDATE}|${item.PLACE}`;
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  return `SEOUL_CULTURE_${hash}`;
}

function mapToEventRow(item) {
  const lng = Number(item.LOT);
  const lat = Number(item.LAT);
  if (!lng || !lat || !item.STRTDATE || !item.END_DATE || !item.TITLE) return null;

  return {
    external_id: buildExternalId(item),
    title: item.TITLE,
    event_type: classifySeoulCultureEvent(item.CODENAME),
    start_date: item.STRTDATE.slice(0, 10),
    end_date: item.END_DATE.slice(0, 10),
    location: toPointWKT(lng, lat),
    thumbnail_url: item.MAIN_IMG || null,
    is_active: true,
  };
}

async function main() {
  console.log(`▶ 서울시 문화행사 정보 수집 시작 (dry-run: ${dryRun})`);
  const items = await fetchCultureEvents({ startIdx: 1, endIdx: 20 });
  console.log(`✅ 서울 열린데이터광장 호출 성공: ${items.length}건 수신`);

  const rows = items.map(mapToEventRow).filter(Boolean);
  console.log(`  → 좌표/일자 유효 데이터: ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  const client = createAdminClient();
  const { count } = await upsertRows(client, 'events', rows);
  console.log(`✅ Supabase events 테이블 upsert 완료: ${count}건`);
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
