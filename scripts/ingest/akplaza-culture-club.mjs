// [AK플라자 문화아카데미 강좌 리스트 수집](2026-10-09 사용자 캡처 요청
// 기반): project/decision-log.md Decision 028이 이미 5개 브랜드(이마트/
// 롯데마트/AK플라자/신세계/현대백화점)를 예정해 culture_club_classes.
// brand CHECK 제약에 'ak_plaza'가 포함돼 있었다(마이그레이션 변경 불필요).
//
// [지점 — 세션 기반, 다른 브랜드와 전혀 다른 구조](2026-10-09 실측 확인)
// `getPeltList_New`의 `store` 바디 파라미터는 완전히 무시된다(존재하지
// 않는 지점 코드를 넣어도 결과가 달라지지 않음) — 실제 지점은
// `/common/change_main_store`(POST, body `store=0N`)를 먼저 호출해
// 응답의 `Set-Cookie: JSESSIONID=...`를 세션으로 저장해야 하고, 이후
// `getPeltList_New` 호출은 그 세션에 저장된 지점 데이터를 그대로 돌려준다
// — 그래서 "여러 지점을 한 요청에" 또는 "지점 없이 전체"로 가져오는
// 방법이 없다(지점마다 세션 재설정 1회 + 목록조회 1회, 총 2요청씩 순회).
// 다만 지점이 롯데마트(60+)/신세계(12)/현대백화점(10)보다 훨씬 적은
// 4개뿐이라(akplaza-culture-club-parser.mjs의 AKPLAZA_STORES) 가볍다.
//
// [페이지네이션 — listSize를 크게 주면 한 번에 전체](실측 확인:
// listSize=1000으로 지점당 전체(최대 602건 관찰)를 한 번에 받음) — 신세계/
// 이마트식 "큰 페이지 1번" 패턴을 그대로 쓴다.
//
// [수강대상(main_cd) — 빈 값으로 한 번에, 사후 필터링](실측 확인: 다중값
// 콤마는 0건으로 깨지지만, 빈 값으로 보내면 Adult(1)/Baby(2)/Kids(3)/
// Family(4)/미사용(5) 전부가 한 응답에 섞여 나오고 각 행에 MAIN_CD
// 필드가 그대로 있다) — main_cd별로 따로 조회하지 않고 한 번만 받아
// AKPLAZA_MAIN_CODES(2/3/4)만 사후 필터링한다.
//
// [이미지 — 목록 응답 자체에 이미 있어 별도 상세수집 불필요](실측 확인)
// 상세 페이지(/course/detail)의 썸네일 블록은 사이트 자체가
// "<!-- 썸네일 임시제거 -->" 주석으로 꺼둔 상태라 상세 페이지에서는 이미지를
// 전혀 볼 수 없지만, 목록 응답의 THUMBNAIL_IMG를 image_dir과 조합하면
// 실제로 살아있는 이미지(200 OK)를 바로 받는다 — akplaza-culture-club-
// parser.mjs의 buildThumbnailUrl 참고. 별도 상세수집 스크립트
// (akplaza-culture-club-detail.mjs)는 이미지가 아니라 소개 텍스트
// (lect_info)만 채운다 — 그래서 이중 쓰기 방지(mergeDetailEnrichment)가
// class_intro 하나에만 필요하다.
//
// [마감(CLOSED) 제외 — 다른 브랜드와 동일한 정책](신세계/롯데마트에서
// 이미 확립된 정책을 동일하게 적용 — 추측이 아니라 기존 정책의 연장)
// 새로 마감된 강좌를 통합 테이블에 새로 쌓지 않는다 — openRows만 upsert
// 대상이고, closedClassIds는 "이미 저장돼 있던 강좌가 오늘 마감으로
// 바뀐 경우"를 찾아 상태만 갱신하는 데 쓴다(신규 insert 아님).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { stampCollectedAt, mergeDetailEnrichment } from './lib/culture-club-common.mjs';
import { toUnifiedAkplazaRow } from './lib/culture-club-unified-row.mjs';
import { AKPLAZA_STORES, AKPLAZA_MAIN_CODES, parseLectureListResponse, getLectureListTotalCount } from './lib/akplaza-culture-club-parser.mjs';
import { sendDiscordNotification } from '../notify-discord.mjs';

loadEnv();

const SOURCE_KEY = 'AKPLAZA_CULTURE_CLUB';
const BASE_URL = 'https://culture.akplaza.com';
const CHANGE_STORE_URL = `${BASE_URL}/common/change_main_store`;
const LIST_URL = `${BASE_URL}/course/getPeltList_New`;
const LIST_PAGE_SIZE = 1000; // [실측] listSize를 크게 주면 페이지네이션 없이 지점 전체를 한 번에 받음
const UPSERT_CHUNK_SIZE = 500;
const EXISTING_ID_PAGE_SIZE = 1000;
const REQUEST_PACING_MIN_MS = 500;
const REQUEST_PACING_MAX_MS = 1000;
// [랜덤 시작 지연] 하루 1회 배치 — 다른 브랜드 배치들과 동일한 관례.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// [세션 쿠키 — change_main_store의 Set-Cookie에서 JSESSIONID만 추출]
// 이후 getPeltList_New 호출에 그대로 Cookie 헤더로 실어 보내야 그 지점의
// 데이터가 나온다(실측 확인 — Node 전역 fetch로 재현).
async function changeMainStore(storeCode) {
  const res = await fetchWithTimeout(CHANGE_STORE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ store: storeCode }).toString(),
  });
  if (!res.ok) throw new Error(`지점 전환 실패 (HTTP ${res.status}, store=${storeCode})`);
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error(`지점 전환 응답에 세션 쿠키가 없음(store=${storeCode})`);
  return setCookie.split(';')[0];
}

async function fetchListForStore(sessionCookie) {
  const body = new URLSearchParams({
    page: '1',
    sort_type: '',
    listSize: String(LIST_PAGE_SIZE),
    search_name: '',
    main_cd: '',
    sect_cd: '',
    yoil: '0000000',
    subject_fg: '',
    month_val: '',
  });
  const res = await fetchWithTimeout(LIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: sessionCookie },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`AK플라자 목록 조회 실패 (HTTP ${res.status})`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`AK플라자 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }
}

export async function fetchAllForStore(storeCode) {
  const sessionCookie = await changeMainStore(storeCode);
  await sleep(randomPacingDelay());
  const json = await fetchListForStore(sessionCookie);
  const items = parseLectureListResponse(json);
  const totalCount = getLectureListTotalCount(json);
  if (items.length < totalCount) {
    // [실측상 listSize=1000이면 늘 한 번에 다 받았지만, 혹시 그보다 더 많아지면
    // 조용히 일부만 수집하는 사고를 막기 위한 방어적 경고] 페이지네이션을 추가로
    // 구현하지 않고 경고만 남긴다 — 무리하게 추측으로 재시도 로직을 만들지 않음.
    console.warn(`⚠️ store=${storeCode}: listCnt(${totalCount})가 수신 건수(${items.length})보다 많음 — listSize 확대 필요할 수 있음`);
  }
  return items;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: 'AK플라자 문화아카데미 강좌 리스트 수집(수강대상 Baby/Kids/Family 3종)',
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

// [소개 텍스트(class_intro) 유실 방지 — 이중 쓰기 버그 처음부터 피함](위
// 파일 상단 주석 참고) akplaza-culture-club-detail.mjs가 통합 테이블에
// 직접 채워둔 raw_extra.class_intro를, 이 메인 배치가 raw_extra를 새로
// 만들면서 지우지 않도록 미리 읽어와 mergeDetailEnrichment()로 합친다.
async function fetchDetailEnrichmentByClassId(client) {
  const map = new Map();
  for (let from = 0; ; from += EXISTING_ID_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('source_class_id, raw_extra, detail_fetched_at')
      .eq('brand', 'ak_plaza')
      .range(from, from + EXISTING_ID_PAGE_SIZE - 1);
    if (error) throw new Error(`상세정보 조회 실패: ${error.message}`);
    for (const row of data) {
      map.set(row.source_class_id, {
        class_id: row.source_class_id,
        class_intro: row.raw_extra?.class_intro ?? null,
        detail_fetched_at: row.detail_fetched_at,
      });
    }
    if (data.length < EXISTING_ID_PAGE_SIZE) break;
  }
  return map;
}

// [마감 제외 — 신세계/롯데마트와 동일한 정책](위 파일 상단 주석 참고)
export function splitOpenAndClosedRows(rows) {
  const openRows = rows.filter((r) => r.raw_status !== '마감');
  const closedClassIds = rows.filter((r) => r.raw_status === '마감').map((r) => r.class_id);
  return { openRows, closedClassIds };
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ AK플라자 문화아카데미 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);
  const startedAt = Date.now();

  const allRows = [];
  for (const [storeCode, storeName] of AKPLAZA_STORES) {
    const items = await fetchAllForStore(storeCode);
    const withStoreName = items.map((item) => ({ ...item, store_name: storeName }));
    // [수강대상 — Adult(1)/미사용(5) 제외](akplaza-culture-club-parser.mjs
    // AKPLAZA_MAIN_CODES 주석 참고) 목록은 전체를 한 번에 받고 여기서
    // 사후 필터링한다.
    const inScope = withStoreName.filter((item) => AKPLAZA_MAIN_CODES.includes(item.main_cd));
    allRows.push(...inScope);
    console.log(`  [${storeName}] 전체 ${items.length}건 수신, 수강대상 필터 후 ${inScope.length}건`);
    await sleep(randomPacingDelay());
  }

  const collectedAt = new Date().toISOString();
  const rows = stampCollectedAt([...new Map(allRows.map((row) => [row.class_id, row])).values()], collectedAt);
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);
  console.log(`  마감 제외: ${closedClassIds.length}건 — 저장 대상 ${openRows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(openRows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: openRows.length, upserted: false };
  }

  const client = createAdminClient();

  let upsertedCount = 0;
  let closedCount = 0;
  try {
    const enrichmentByClassId = await fetchDetailEnrichmentByClassId(client);
    const unifiedRows = mergeDetailEnrichment(openRows, enrichmentByClassId).map(toUnifiedAkplazaRow);
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
        .eq('brand', 'ak_plaza')
        .in('source_class_id', chunk);
      if (error) throw new Error(`culture_club_classes 마감 갱신 실패: ${error.message}`);
      closedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    await notifyBatchResult({
      title: '❌ [local-open-spaces] AK플라자 컬처클럽 배치 실패',
      description: err.message.slice(0, 500),
      status: `${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
      color: 0xed4245,
    });
    throw err;
  }

  console.log(`✅ Supabase(culture_club_classes) upsert 완료: ${upsertedCount}건, 마감 갱신 시도: ${closedCount}건`);

  const byStore = AKPLAZA_STORES.reduce(
    (acc, [storeCode, storeName]) => ({ ...acc, [storeName]: openRows.filter((r) => r.store_code === storeCode).length }),
    {}
  );
  await postPipelineLog(client, { status: 'OK', metaData: { count: upsertedCount, closedCount, byStore } });
  await notifyBatchResult({
    title: '✅ [local-open-spaces] AK플라자 컬처클럽 배치 완료',
    description: `총 ${upsertedCount}건 수집/upsert, 마감 갱신 시도 ${closedCount}건 (${Object.entries(byStore)
      .map(([name, count]) => `${name} ${count}건`)
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
      console.error(`❌ AK플라자 문화아카데미 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
