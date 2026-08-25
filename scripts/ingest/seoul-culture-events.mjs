// Source 05: 서울시 문화행사 정보 (data.seoul.go.kr culturalEventInfo)
// spec/data/data_sources.md #05 참조
import crypto from 'crypto';
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient, upsertRawIngestData, upsertRowsSafeMerge } from './lib/supabase-admin.mjs';
import { toPointWKT } from './lib/geometry.mjs';
import { classifySeoulCultureEvent } from './lib/category-map.mjs';
import { cleanText, deriveParentalTags, deriveBookingStatus } from './lib/ai-tagging.mjs';

const env = loadEnv();
// [전체 파이프라인 일괄 가동](2026-08-25): BaseCollectorAdapter를 쓰지 않는 레거시 구조라
// RAW 레이어/source/Safe UPSERT를 인라인으로 추가한다.
const SOURCE_KEY = 'SEOUL_CULTURE_EVENTS';
const SOURCE = 'seoul_public_culture';
const TARGET_TABLE = 'events';

// 원본 API에 안정적인 고유 ID 필드가 없어 TITLE+STRTDATE+PLACE 조합의 결정적 해시를
// external_id로 사용한다 (project/database_schema.md의 Upsert 기준 키 요건 충족 목적).
function buildExternalId(item) {
  const raw = `${item.TITLE}|${item.STRTDATE}|${item.PLACE}`;
  const hash = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16);
  return `SEOUL_CULTURE_${hash}`;
}

async function mapToEventRow(item, { apiKey }) {
  const lng = Number(item.LOT);
  const lat = Number(item.LAT);
  if (!lng || !lat || !item.STRTDATE || !item.END_DATE || !item.TITLE) return null;

  const title = cleanText(item.TITLE);
  const startDate = item.STRTDATE.slice(0, 10);
  const endDate = item.END_DATE.slice(0, 10);

  // ai-rule.md 5.1: 원본 API 응답의 실제 텍스트(이용대상/이용요금/프로그램 소개 등)를 근거로만 태깅한다.
  const tags = deriveParentalTags(JSON.stringify(item));
  const bookingStatus = deriveBookingStatus({
    isReservationRequired: false,
    reservationEndDate: null,
    startDate,
    endDate,
  });

  return {
    external_id: buildExternalId(item),
    title,
    source: SOURCE,
    event_type: await classifySeoulCultureEvent(item.CODENAME, { title, apiKey }),
    start_date: startDate,
    end_date: endDate,
    location: toPointWKT(lng, lat),
    thumbnail_url: item.MAIN_IMG || null,
    is_active: true,
    booking_status: bookingStatus,
    // Task 8-4 정밀 검증(2026-08-21)에서 발견: is_free가 어디에도 설정되지 않아 DB 컬럼 기본값으로
    // 전량 false(유료)가 되고 있었다 — 실측 결과 원본에 IS_FREE 필드('유료'/'무료')가 실제로 있고
    // 표본(1,000건)에서 무료 비율이 65.1%(651/1,000)에 달해 심각한 오탐이었다. 원본 필드를 그대로
    // 반영하되, '유료'/'무료' 둘 중 하나로 명확한 경우만 판별하고 그 외(빈 값 등)는 null(미기재)로
    // 남겨 유료로 임의 단정하지 않는다(space-card.md의 is_free null 처리 규약 준수).
    is_free: item.IS_FREE === '무료' ? true : item.IS_FREE === '유료' ? false : null,
    venue_name: item.PLACE || null, // Task 9-1-1: 실측 확인된 실제 장소명 필드
    // Task 9-1-3: 실측 확인된 실제 구 단위 지역명 필드(GUNAME). Task 9-1-12: 이 API는 서울만
    // 다루므로("서울시 문화행사 정보") 항상 "서울시 " 접두를 붙인다 — "동구"/"중구" 등 다른
    // 도시와 겹치는 구 이름의 단독 표기를 방지한다(사용자 지적, 추측 아닌 소스 자체 범위 확정).
    sigungu_name: item.GUNAME ? `서울시 ${item.GUNAME}` : null,
    ...tags,
  };
}

const PAGE_SIZE = 1000;

// Task 8-4 완결성 검증(2026-08-21)에서 발견: main()이 fetchCultureEvents({ startIdx: 1, endIdx: 20 })를
// 단발로만 호출해 list_total_count(실측 19,508건) 중 20건만 수집되고 있었다(페이지네이션 루프 부재).
// 실제 호출로 페이지당 1,000건까지 정상 응답됨을 확인해(culturalEventInfo/1/1000/ → 1000건 수신)
// 전체 목록을 끝까지 순회하도록 수정한다.
async function fetchAllCultureEvents() {
  const items = [];
  let startIdx = 1;
  let totalCount = Infinity;

  while (startIdx <= totalCount) {
    const endIdx = startIdx + PAGE_SIZE - 1;
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

    const body = json.culturalEventInfo;
    const result = body?.RESULT ?? json.RESULT;
    if (result && result.CODE !== 'INFO-000') {
      throw new Error(`서울 열린데이터광장 에러 응답: ${result.CODE} ${result.MESSAGE}`);
    }

    totalCount = body?.list_total_count ?? 0;
    items.push(...(body?.row ?? []));
    startIdx += PAGE_SIZE;
  }

  return items;
}

// [배치 자동화 및 로깅 체계 확정](2026-08-25): run-daily.mjs가 직접 import해서 호출할 수
// 있도록 main()을 재사용 가능한 run() 함수로 분리하고, 반환값을 BaseCollectorAdapter.run()과
// 동일한 형태로 맞췄다.
export async function run({ dryRun = false } = {}) {
  console.log(`▶ 서울시 문화행사 정보 수집 시작 (dry-run: ${dryRun})`);
  const items = await fetchAllCultureEvents();
  console.log(`✅ 서울 열린데이터광장 호출 성공: ${items.length}건 수신`);

  // Task 8-4 완결성 검증(2026-08-21)에서 발견: Promise.all로 19,508건 전체를 동시에 처리하면
  // SEOUL_CODENAME_MAP에 없는 CODENAME(전체의 약 8.65%, 실측 표본 2,000건 기준 173건)마다
  // classifyEventTypeWithAI가 Gemini를 호출하는데, 이게 최대 수천 건 동시 호출로 몰려
  // HTTP 429(rate limit)가 나고 전부 ETC로 떨어지는 원인이었다. 순차 처리로 바꿔 계속되는
  // 동시 호출 폭주를 없앤다(ai-rule.md 4.1의 "AI 불확실 시 ETC" 자체는 정상 설계이나,
  // 판단 불가가 아니라 요청 폭주로 인한 429는 막을 수 있는 문제라 순차 처리로 개선한다).
  const rows = [];
  for (const item of items) {
    const row = await mapToEventRow(item, { apiKey: env.GEMINI_API_KEY });
    if (row) rows.push(row);
  }
  console.log(`  → 좌표/일자 유효 데이터: ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return {
      sourceKey: SOURCE_KEY,
      targetTable: TARGET_TABLE,
      source: SOURCE,
      count: rows.length,
      upserted: false,
      rawCount: items.length,
      rawArchivedCount: undefined,
    };
  }

  const client = createAdminClient();
  const rawResult = await upsertRawIngestData(
    client,
    SOURCE_KEY,
    items.map((item) => ({ sourceId: buildExternalId(item), payload: item }))
  );
  const { count, duplicateWithinBatch = 0, mergedWithExisting = 0 } = await upsertRowsSafeMerge(client, TARGET_TABLE, rows);
  console.log(`✅ Supabase events 테이블 upsert 완료: ${count}건`);
  return {
    sourceKey: SOURCE_KEY,
    targetTable: TARGET_TABLE,
    source: SOURCE,
    count,
    upserted: true,
    rawCount: items.length,
    rawArchivedCount: rawResult.count,
    safeMergeCount: duplicateWithinBatch + mergedWithExisting,
    errorCount: Math.max(0, items.length - count),
  };
}

// CLI 진입점 — Windows에서는 process.argv[1]이 백슬래시 경로라 import.meta.url(file:// URL)과
// 문자열로 직접 비교하면 항상 false가 된다(실측 확인) — pathToFileURL로 변환해 비교한다.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun }).catch((err) => {
    console.error('❌', err.message);
    process.exitCode = 1;
  });
}
