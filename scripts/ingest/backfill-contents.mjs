// [수집기 본문(Contents) 필드 적재 보강 및 재수집 파이프라인 구축](2026-08-26)
//
// 기존에 raw_data/description이 비어 있는 채로 이미 적재된 events 행을 채운다. Safe Merge
// 원칙: raw_data/description 컬럼만 건드리고, 이미 채워진 행은 절대 덮어쓰지 않는다
// (`.is('raw_data', null)` 가드) — category_maj/category_min/category_min_source(특히
// MANUAL로 관리자가 확정한 값)는 이 스크립트가 다루는 컬럼이 아니라 원천적으로 유실될 수 없다.
//
// 소스별 방식이 다르다(실측 확인, docs/target-audience-analysis-report.md 0절 참고):
// - seoul_public_culture / gg_public: raw_ingest_data(RAW 레이어)에 원본이 이미 보존돼 있어
//   외부 API 재호출 없이 DB 안에서만 채운다(순수 백필).
// - tourapi_4.0: 목록 조회(searchFestival2) 원본에는 애초에 개요(overview) 필드가 없어
//   (실측 확인) 상세 조회(detailCommon2)를 실제로 재호출해야 한다(진짜 재수집).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

const env = loadEnv();

const PAGE_SIZE = 500;
const RAW_LOOKUP_BATCH_SIZE = 200;

// ---------- seoul_public_culture / gg_public 공용: raw_ingest_data에서 순수 백필 ----------
export function extractDescription(source, payload) {
  if (source === 'seoul_public_culture') {
    return [payload.PROGRAM, payload.ETC_DESC].map((v) => v?.trim()).filter(Boolean).join(' ') || null;
  }
  if (source === 'gg_public') {
    // API1(GGCULTUREVENTSTUS, GG_CULTURE_EVENT_ 접두)에는 설명 필드가 없다(실측 확인) —
    // DTCONT는 API2(GGCULFOUEVENSTM, GG_FOUNDATION_EVENT_ 접두)에만 있다.
    const raw = payload.DTCONT;
    return raw && raw.trim() && raw.trim() !== '-' ? raw.trim() : null;
  }
  return null;
}

async function backfillFromRawLayer(client, { eventsSource, rawIngestSource, externalIdToSourceId }) {
  let lastId = null;
  let scanned = 0;
  let filled = 0;
  let noRawFound = 0;

  for (;;) {
    let query = client
      .from('events')
      .select('id, external_id')
      .eq('source', eventsSource)
      .is('raw_data', null)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);
    if (lastId) query = query.gt('id', lastId);

    const { data, error } = await query;
    if (error) throw new Error(`${eventsSource} 스캔 실패: ${error.message}`);
    if (!data || data.length === 0) break;

    scanned += data.length;

    for (let i = 0; i < data.length; i += RAW_LOOKUP_BATCH_SIZE) {
      const batch = data.slice(i, i + RAW_LOOKUP_BATCH_SIZE);
      const sourceIdToEventId = new Map();
      for (const row of batch) {
        sourceIdToEventId.set(externalIdToSourceId(row.external_id), row.id);
      }

      const { data: rawRows, error: rawError } = await client
        .from('raw_ingest_data')
        .select('source_id, raw_payload')
        .eq('source', rawIngestSource)
        .in('source_id', [...sourceIdToEventId.keys()]);
      if (rawError) throw new Error(`raw_ingest_data(${rawIngestSource}) 조회 실패: ${rawError.message}`);

      const foundSourceIds = new Set();
      for (const rawRow of rawRows ?? []) {
        const eventId = sourceIdToEventId.get(rawRow.source_id);
        if (!eventId) continue;
        foundSourceIds.add(rawRow.source_id);

        const description = extractDescription(eventsSource, rawRow.raw_payload ?? {});
        const { error: updateError } = await client
          .from('events')
          .update({ raw_data: rawRow.raw_payload, description })
          .eq('id', eventId)
          .is('raw_data', null);
        if (updateError) throw new Error(`events(${eventId}) 업데이트 실패: ${updateError.message}`);
        filled += 1;
      }
      noRawFound += sourceIdToEventId.size - foundSourceIds.size;
    }

    lastId = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return { scanned, filled, noRawFound };
}

// ---------- tourapi_4.0: raw_ingest_data 백필 + detailCommon2 실제 재호출로 overview 보강 ----------
const DETAIL_URL = 'https://apis.data.go.kr/B551011/KorService2/detailCommon2';
const DETAIL_PACING_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOverview(contentId) {
  const params = new URLSearchParams({
    MobileOS: 'ETC',
    MobileApp: 'local-open-spaces',
    _type: 'json',
    contentId: String(contentId),
  });
  const url = `${DETAIL_URL}?serviceKey=${encodeURIComponent(env.PUBLIC_DATA_API_KEY)}&${params.toString()}`;

  try {
    const res = await fetchWithTimeout(url);
    const text = await res.text();
    if (!res.ok) return null;
    const json = JSON.parse(text);
    if (json.response?.header?.resultCode !== '0000') return null;
    const item = json.response?.body?.items?.item;
    const detail = Array.isArray(item) ? item[0] : item;
    return detail?.overview?.trim() || null;
  } catch {
    return null;
  }
}

async function backfillTourApiFestival(client) {
  const { data, error } = await client.from('events').select('id, external_id').eq('source', 'tourapi_4.0').is('raw_data', null);
  if (error) throw new Error(`tourapi_4.0 스캔 실패: ${error.message}`);

  let scanned = 0;
  let filled = 0;
  let noRawFound = 0;
  let overviewFound = 0;

  for (const row of data ?? []) {
    scanned += 1;
    const contentId = row.external_id.replace(/^TOUR_API_/, '');

    const { data: rawRows, error: rawError } = await client
      .from('raw_ingest_data')
      .select('raw_payload')
      .eq('source', 'TOUR_API_FESTIVAL')
      .eq('source_id', contentId)
      .limit(1);
    if (rawError) throw new Error(`raw_ingest_data(TOUR_API_FESTIVAL) 조회 실패: ${rawError.message}`);

    const payload = rawRows?.[0]?.raw_payload;
    if (!payload) {
      noRawFound += 1;
      continue;
    }

    const overview = await fetchOverview(contentId);
    await sleep(DETAIL_PACING_MS);
    if (overview) overviewFound += 1;

    const { error: updateError } = await client
      .from('events')
      .update({ raw_data: overview ? { ...payload, overview } : payload, description: overview })
      .eq('id', row.id)
      .is('raw_data', null);
    if (updateError) throw new Error(`events(${row.id}) 업데이트 실패: ${updateError.message}`);
    filled += 1;
  }

  return { scanned, filled, noRawFound, overviewFound };
}

export async function backfillContents({ dryRun = false } = {}) {
  const client = createAdminClient();

  if (dryRun) {
    console.log('dry-run: 실제 UPDATE 없이 대상 건수만 집계합니다.');
    const results = {};
    for (const src of ['seoul_public_culture', 'gg_public', 'tourapi_4.0']) {
      const { count } = await client.from('events').select('*', { count: 'exact', head: true }).eq('source', src).is('raw_data', null);
      results[src] = { pendingCount: count };
    }
    return results;
  }

  console.log('▶ seoul_public_culture 백필 중...');
  const seoulResult = await backfillFromRawLayer(client, {
    eventsSource: 'seoul_public_culture',
    rawIngestSource: 'SEOUL_CULTURE_EVENTS',
    externalIdToSourceId: (externalId) => externalId,
  });
  console.log('  scanned:', seoulResult.scanned, '| filled:', seoulResult.filled, '| raw 없음:', seoulResult.noRawFound);

  console.log('▶ gg_public 백필 중...');
  const ggResult = await backfillFromRawLayer(client, {
    eventsSource: 'gg_public',
    rawIngestSource: 'GG_CULTURE_EVENTS',
    externalIdToSourceId: (externalId) => externalId,
  });
  console.log('  scanned:', ggResult.scanned, '| filled:', ggResult.filled, '| raw 없음:', ggResult.noRawFound);

  console.log('▶ tourapi_4.0 백필 중(개요 재수집 포함)...');
  const tourResult = await backfillTourApiFestival(client);
  console.log(
    '  scanned:', tourResult.scanned,
    '| filled:', tourResult.filled,
    '| raw 없음:', tourResult.noRawFound,
    '| overview 확보:', tourResult.overviewFound
  );

  return { seoul_public_culture: seoulResult, gg_public: ggResult, 'tourapi_4.0': tourResult };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  backfillContents({ dryRun })
    .then((result) => {
      console.log('\n=== 최종 결과 ===');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error('❌', err.message);
      process.exitCode = 1;
    });
}
