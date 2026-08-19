// Source 04: 서울시 공공서비스예약 - 체육시설 (spec/data/data_sources.md #04)
// 목록 조회(ListPublicReservationSport) 응답에 예약 URL/좌표/접수기간이 모두 포함되어 있어
// 별도 상세 조회 없이 단일 호출로 수집 가능함을 확인함 (사용자 제공 샘플 URL로 실증)
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRows } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';

const env = loadEnv();
const dryRun = process.argv.includes('--dry-run');

const BASE = 'http://openapi.seoul.go.kr:8088';
const SERVICE_NAME = 'ListPublicReservationSport';
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

function toDateOnly(dateTimeStr) {
  // "2025-12-01 00:00:00.0" -> "2025-12-01"
  return dateTimeStr ? dateTimeStr.slice(0, 10) : null;
}

function mapToEventRow(item) {
  const lng = Number(item.X);
  const lat = Number(item.Y);
  if (!lng || !lat || !item.SVCID || !item.SVCNM || !item.SVCOPNBGNDT || !item.SVCOPNENDDT) {
    return null;
  }

  return {
    external_id: `SEOUL_RESERVATION_${item.SVCID}`,
    title: item.SVCNM,
    event_type: 'RESERVATION',
    start_date: toDateOnly(item.SVCOPNBGNDT),
    end_date: toDateOnly(item.SVCOPNENDDT),
    is_reservation_required: true,
    reservation_start_date: item.RCPTBGNDT || null,
    reservation_end_date: item.RCPTENDDT || null,
    reservation_url: item.SVCURL || null,
    location: toPointWKT(lng, lat),
    thumbnail_url: item.IMGURL || null,
    is_active: item.SVCSTATNM !== '접수마감' && item.SVCSTATNM !== '종료',
  };
}

async function main() {
  console.log(`▶ 서울시 공공서비스예약(체육시설) 수집 시작 (dry-run: ${dryRun})`);

  const client = dryRun ? null : createAdminClient();
  let startIdx = 1;
  let totalCount = Infinity;
  let totalUpserted = 0;
  const sample = [];

  while (startIdx <= totalCount) {
    const endIdx = startIdx + PAGE_SIZE - 1;
    const { items, totalCount: tc } = await fetchPage(startIdx, endIdx);
    totalCount = tc;

    const rows = items.map(mapToEventRow).filter(Boolean);

    if (dryRun) {
      sample.push(...rows.slice(0, 3 - sample.length));
    } else if (rows.length > 0) {
      const { count } = await upsertRows(client, 'events', rows);
      totalUpserted += count;
    }

    console.log(`  ${startIdx}~${endIdx}: ${items.length}건 수신 (전체 ${totalCount}건 중)`);
    startIdx += PAGE_SIZE;
  }

  if (dryRun) {
    console.log(JSON.stringify(sample, null, 2));
    console.log(`✅ dry-run 완료 (전체 ${totalCount}건 확인)`);
  } else {
    console.log(`✅ Supabase events 테이블 upsert 완료: 총 ${totalUpserted}건`);
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exitCode = 1;
});
