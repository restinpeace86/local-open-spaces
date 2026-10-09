// [스타필드 문화센터(클래스콕) 강좌 리스트 수집](2026-10-09 사용자 캡처
// 기반): "스타필드쪽도 3개 데이터 넣을까하는데" → 상세 페이지 조사 후
// "그렇게 진행하자"로 구현 확정.
//
// [6번째 브랜드 — Decision 028 확장](2026-10-09) Decision 028은 5개
// 브랜드(이마트/롯데마트/AK플라자/신세계/현대백화점)까지만 예정했었다 —
// culture_club_classes.brand CHECK 제약과 get_culture_club_store_
// coordinates() RPC(쇼핑몰문화센터 category_min 추가)를 scripts/
// migrations/2026-10-09-starfield-brand-and-category.sql로 확장했다
// (사용자 명시적 승인, 임의 결정 아님).
//
// [지점 — 완전 무상태(stateless), 다른 브랜드보다 더 간단함](실측 확인,
// lib/starfield-culture-club-parser.mjs 상단 주석 참고) 고정 쿠키 헤더
// 하나(STATIC_STORE_COOKIE)만 달고 storeCd 바디 파라미터만 바꾸면 되며,
// AK플라자의 change_main_store 같은 "세션 먼저 설정" 단계가 전혀 없다.
//
// [수강대상(lctrTrgCtgryCd) — 2(어린이)/3(영유아)만, 다중값/빈값 트릭
// 둘 다 불가](실측 확인) 지점(3) × 대상(2) = 6개 조합을 전부 따로
// 조회해야 한다(신세계와 동일한 전체 순회 구조).
//
// [페이지네이션 — 고정 20건, lctrTotCnt로 총 페이지 계산](실측 확인)
// recordsPerPage 파라미터는 무시된다.
//
// [이미지 — 목록 응답 자체에 이미 있어 별도 상세수집 불필요](실측 확인:
// thumbnailImgPath가 완전한 URL) 별도 상세수집 스크립트(starfield-
// culture-club-detail.mjs)는 소개 텍스트만 책임진다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { stampCollectedAt, mergeDetailEnrichment } from './lib/culture-club-common.mjs';
import { toUnifiedStarfieldRow } from './lib/culture-club-unified-row.mjs';
import {
  STARFIELD_STORES,
  STARFIELD_TARGET_CODES,
  STATIC_STORE_COOKIE,
  RECORDS_PER_PAGE,
  parseLectureListResponse,
  getLectureListTotalCount,
} from './lib/starfield-culture-club-parser.mjs';
import { sendDiscordNotification } from '../notify-discord.mjs';

loadEnv();

const SOURCE_KEY = 'STARFIELD_CULTURE_CLUB';
const LIST_URL = 'https://www.classkok.com/mlt/selectLctrList.do';
const UPSERT_CHUNK_SIZE = 500;
const EXISTING_ID_PAGE_SIZE = 1000;
const REQUEST_PACING_MIN_MS = 500;
const REQUEST_PACING_MAX_MS = 1000;
// [랜덤 시작 지연] 하루 1회 배치 — 다른 브랜드 배치들과 동일한 관례.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const MAX_PAGES_SAFETY = 500; // 무한루프 방지용 방어선
// [수집 범위 — 날짜](현대백화점과 동일한 관례) 오늘부터 1년 뒤까지
// 넓게 잡아 날짜 필터 때문에 신규 강좌를 놓치는 일이 없게 한다.
const SEARCH_WINDOW_DAYS = 365;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

function formatDotDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function buildSearchWindow(now) {
  const end = new Date(now.getTime() + SEARCH_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { srchBeginDt: formatDotDate(now), srchTrmntDt: formatDotDate(end) };
}

async function fetchPage(storeCode, targetCtgryCd, page, { srchBeginDt, srchTrmntDt }) {
  const body = new URLSearchParams({
    lctrTrgCtgryCd: targetCtgryCd,
    lctrDivnCtgryCd: '',
    currentPageNo: String(page),
    viewType: 'thumbnail',
    srchKeyword: '',
    srchBeginDt,
    srchTrmntDt,
    chkTkcrsDywk: '',
    selBeginTme: '00',
    selTrmntTme: '24',
    chkTmcnt: '',
    chkAcptSt: '',
    chkPfmco: '',
    chkTkcrsAmt: '',
    storeCd: storeCode,
  });

  const res = await fetchWithTimeout(LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: STATIC_STORE_COOKIE,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`스타필드 문화센터 목록 조회 실패 (HTTP ${res.status}, storeCd=${storeCode}, lctrTrgCtgryCd=${targetCtgryCd}, page=${page})`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`스타필드 응답이 JSON이 아닙니다(storeCd=${storeCode}, lctrTrgCtgryCd=${targetCtgryCd}): ${text.slice(0, 300)}`);
  }
}

export async function fetchAllForStoreAndTarget(storeCode, targetCtgryCd, window) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES_SAFETY; page += 1) {
    const json = await fetchPage(storeCode, targetCtgryCd, page, window);
    const pageItems = parseLectureListResponse(json, targetCtgryCd);
    items.push(...pageItems);
    const total = getLectureListTotalCount(json);
    if (items.length >= total || pageItems.length === 0) break;
    await sleep(randomPacingDelay());
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
      description: '스타필드 문화센터(클래스콕) 강좌 리스트 수집(수강대상 어린이/영유아만)',
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
// 파일 상단 주석 참고) starfield-culture-club-detail.mjs가 통합 테이블에
// 직접 채워둔 raw_extra.class_intro를, 이 메인 배치가 raw_extra를 새로
// 만들면서 지우지 않도록 미리 읽어와 mergeDetailEnrichment()로 합친다.
async function fetchDetailEnrichmentByClassId(client) {
  const map = new Map();
  for (let from = 0; ; from += EXISTING_ID_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('source_class_id, raw_extra, detail_fetched_at')
      .eq('brand', 'starfield')
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

// [마감(WD/대기불가) 제외 — 다른 브랜드와 동일한 정책](AK플라자/신세계/
// 롯데마트에서 이미 확립된 정책의 연장) 새로 마감된 강좌를 통합 테이블에
// 새로 쌓지 않는다 — openRows만 upsert 대상이고, closedClassIds는
// "이미 저장돼 있던 강좌가 오늘 WD로 바뀐 경우"를 찾아 상태만 갱신하는
// 데 쓴다(신규 insert 아님).
export function splitOpenAndClosedRows(rows) {
  const openRows = rows.filter((r) => r.raw_status !== 'WD');
  const closedClassIds = rows.filter((r) => r.raw_status === 'WD').map((r) => r.class_id);
  return { openRows, closedClassIds };
}

export async function run({ dryRun = false, now = new Date() } = {}) {
  console.log(`▶ 스타필드 문화센터(클래스콕) 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);
  const startedAt = Date.now();
  const window = buildSearchWindow(now);

  const allRows = [];
  for (const [storeCode, storeName] of STARFIELD_STORES) {
    for (const targetCtgryCd of STARFIELD_TARGET_CODES) {
      const items = await fetchAllForStoreAndTarget(storeCode, targetCtgryCd, window);
      allRows.push(...items);
      console.log(`  [${storeName}/${targetCtgryCd}] ${items.length}건 수신`);
      await sleep(randomPacingDelay());
    }
  }

  const collectedAt = new Date().toISOString();
  const rows = stampCollectedAt([...new Map(allRows.map((row) => [row.class_id, row])).values()], collectedAt);
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);
  console.log(`  대기불가(WD) 제외: ${closedClassIds.length}건 — 저장 대상 ${openRows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(openRows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: openRows.length, upserted: false };
  }

  const client = createAdminClient();

  let upsertedCount = 0;
  let closedCount = 0;
  try {
    const enrichmentByClassId = await fetchDetailEnrichmentByClassId(client);
    const unifiedRows = mergeDetailEnrichment(openRows, enrichmentByClassId).map(toUnifiedStarfieldRow);
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
        .update({ raw_status: 'WD', normalized_status: 'CLOSED' })
        .eq('brand', 'starfield')
        .in('source_class_id', chunk);
      if (error) throw new Error(`culture_club_classes 마감 갱신 실패: ${error.message}`);
      closedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    await notifyBatchResult({
      title: '❌ [local-open-spaces] 스타필드 컬처클럽 배치 실패',
      description: err.message.slice(0, 500),
      status: `${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
      color: 0xed4245,
    });
    throw err;
  }

  console.log(`✅ Supabase(culture_club_classes) upsert 완료: ${upsertedCount}건, 마감 갱신 시도: ${closedCount}건`);

  const byStore = STARFIELD_STORES.reduce(
    (acc, [storeCode, storeName]) => ({ ...acc, [storeName]: openRows.filter((r) => r.store_code === storeCode).length }),
    {}
  );
  await postPipelineLog(client, { status: 'OK', metaData: { count: upsertedCount, closedCount, byStore } });
  await notifyBatchResult({
    title: '✅ [local-open-spaces] 스타필드 컬처클럽 배치 완료',
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
      console.error(`❌ 스타필드 문화센터 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
