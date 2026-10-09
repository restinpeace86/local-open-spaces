// [이랜드리테일 문화센터 강좌 리스트 수집](2026-10-09 사용자 캡처 기반)
// — 8번째 브랜드(Decision 028 5개 → AK플라자/스타필드로 6개 → 롯데
// 백화점으로 7개 → 이번이 8번째, scripts/migrations/2026-10-09-eland-
// retail-brand-and-category.sql).
//
// [지점 없이, LecTypeID 8개 × 요청 1번씩 — 다른 브랜드보다 가벼움](실측
// 확인) `StoreID`를 비우면 6개 지점 전체가 합쳐져서 나오고(지점 순회
// 불필요), `PageSize`를 크게(1000) 주면 페이지네이션 없이 한 응답에
// 전량이 다 온다. `LecTypeID` 다중값(콤마)은 0건으로 깨져서(실측 확인)
// 8개(B/C/D/F/J/K/L/M — 사용자 지시: "K 중도수강도 포함해... J도 뭐
// 일단은 포함시켜")를 각각 따로 조회해야 한다.
//
// [목록 응답이 이미 풍부함 — AK플라자/스타필드와 동일한 설계](toUnified
// ElandRetailRow 주석 참고) 상태/제목(연령 포함)/지점/요일/시간/수강료가
// 목록에 이미 있어 롯데백화점처럼 "뼈대만" 넣을 필요가 없다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { stampCollectedAt, mergeDetailEnrichment } from './lib/culture-club-common.mjs';
import { toUnifiedElandRetailRow } from './lib/culture-club-unified-row.mjs';
import { ELAND_LEC_TYPE_CODES, LARGE_PAGE_SIZE, parseLectureListResponse } from './lib/eland-retail-culture-club-parser.mjs';
import { sendDiscordNotification } from '../notify-discord.mjs';

loadEnv();

const SOURCE_KEY = 'ELAND_RETAIL_CULTURE_CLUB';
const LIST_URL = 'https://www.elandretail.com/m/culture/getLectureList.do';
const UPSERT_CHUNK_SIZE = 500;
const EXISTING_ID_PAGE_SIZE = 1000;
// [하루 1회 배치 — 다른 다수 브랜드와 동일한 관례](이 사이트는 별도 봇
// 차단 신호가 발견되지 않아 롯데백화점처럼 랜덤 다중시간 주기를 두지
// 않는다, 추측으로 과도한 보호 장치를 미리 만들지 않음 — 제3장 제5조)
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

async function fetchLecTypeAll(lecTypeId) {
  const res = await fetchWithTimeout(
    LIST_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CurrentPage: 1, PageSize: LARGE_PAGE_SIZE, StoreID: '', LecTypeID: lecTypeId, WeekDay: '', Teacher: '', LectureName: '', Status: '' }),
    },
    30000
  );
  if (!res.ok) {
    throw new Error(`이랜드리테일 문화센터 목록 조회 실패 (HTTP ${res.status}, LecTypeID=${lecTypeId})`);
  }
  const html = await res.text();
  return parseLectureListResponse(html);
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '이랜드리테일 문화센터 강좌 리스트 수집(수강대상 B/C/D/F/J/K/L/M)',
      period: 'daily',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

async function notifyBatchResult(args) {
  try {
    await sendDiscordNotification(args);
  } catch (err) {
    console.error(`⚠️ Discord 알림 전송 실패(배치 자체에는 영향 없음): ${err.message}`);
  }
}

// [상세수집으로 채워진 보강 컬럼 유실 방지](toUnifiedElandRetailRow
// 주석 참고) classroom/schedule_start_date/schedule_end_date/
// class_material_fee + raw_extra 몇 개를 읽어와 재실행 시 지우지 않게
// 병합한다.
async function fetchDetailEnrichmentByClassId(client) {
  const map = new Map();
  for (let from = 0; ; from += EXISTING_ID_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('source_class_id, raw_extra, detail_fetched_at, classroom, schedule_start_date, schedule_end_date, class_material_fee')
      .eq('brand', 'eland_retail')
      .range(from, from + EXISTING_ID_PAGE_SIZE - 1);
    if (error) throw new Error(`상세정보 조회 실패: ${error.message}`);
    for (const row of data) {
      map.set(row.source_class_id, { class_id: row.source_class_id, ...row });
    }
    if (data.length < EXISTING_ID_PAGE_SIZE) break;
  }
  return map;
}

// [비활성(현장문의/마감/온라인 접수마감) 제외 — 다른 브랜드와 동일한
// 정책](위 파일 상단 주석 참고) 새로 비활성화된 강좌를 통합 테이블에
// 새로 쌓지 않는다.
export function splitOpenAndClosedRows(rows) {
  const openRows = rows.filter((r) => r.normalized_status !== 'CLOSED');
  const closedClassIds = rows.filter((r) => r.normalized_status === 'CLOSED').map((r) => r.class_id);
  return { openRows, closedClassIds };
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 이랜드리테일 문화센터 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);
  const startedAt = Date.now();

  const allRows = [];
  for (const lecTypeId of ELAND_LEC_TYPE_CODES) {
    const items = await fetchLecTypeAll(lecTypeId);
    allRows.push(...items);
    console.log(`  [${lecTypeId}] ${items.length}건 수신`);
    await sleep(randomPacingDelay());
  }

  const collectedAt = new Date().toISOString();
  const rows = stampCollectedAt([...new Map(allRows.map((row) => [row.class_id, row])).values()], collectedAt);
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);
  console.log(`  비활성 상태(현장문의/마감/온라인 접수마감) 제외: ${closedClassIds.length}건 — 저장 대상 ${openRows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(openRows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: openRows.length, upserted: false };
  }

  const client = createAdminClient();

  let upsertedCount = 0;
  let closedCount = 0;
  try {
    const enrichmentByClassId = await fetchDetailEnrichmentByClassId(client);
    const unifiedRows = mergeDetailEnrichment(openRows, enrichmentByClassId).map(toUnifiedElandRetailRow);
    for (let i = 0; i < unifiedRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = unifiedRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client.from('culture_club_classes').upsert(chunk, { onConflict: 'brand,source_class_id' });
      if (error) throw new Error(`culture_club_classes upsert 실패: ${error.message}`);
      upsertedCount += chunk.length;
    }

    for (let i = 0; i < closedClassIds.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = closedClassIds.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client
        .from('culture_club_classes')
        .update({ raw_status: '마감', normalized_status: 'CLOSED' })
        .eq('brand', 'eland_retail')
        .in('source_class_id', chunk);
      if (error) throw new Error(`culture_club_classes 비활성 상태 갱신 실패: ${error.message}`);
      closedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    await notifyBatchResult({
      title: '❌ [local-open-spaces] 이랜드리테일 컬처클럽 배치 실패',
      description: err.message.slice(0, 500),
      status: `${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
      color: 0xed4245,
    });
    throw err;
  }

  console.log(`✅ Supabase(culture_club_classes) upsert 완료: ${upsertedCount}건, 비활성 갱신 시도: ${closedCount}건`);

  const byLecType = ELAND_LEC_TYPE_CODES.reduce(
    (acc, code) => ({ ...acc, [code]: openRows.filter((r) => r.target_code === code).length }),
    {}
  );
  await postPipelineLog(client, { status: 'OK', metaData: { count: upsertedCount, closedCount, byLecType } });
  await notifyBatchResult({
    title: '✅ [local-open-spaces] 이랜드리테일 컬처클럽 배치 완료',
    description: `총 ${upsertedCount}건 수집/upsert, 비활성 갱신 시도 ${closedCount}건 (${Object.entries(byLecType)
      .map(([code, count]) => `${code} ${count}건`)
      .join(', ')})`,
    status: `${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
    color: 0x5865f2,
  });

  return { sourceKey: SOURCE_KEY, count: upsertedCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run({ dryRun }))
    .catch((err) => {
      console.error(`❌ 이랜드리테일 문화센터 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
