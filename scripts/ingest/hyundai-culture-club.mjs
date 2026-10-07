// [현대백화점 문화센터 강좌 리스트 수집](2026-10-08 사용자 제공 실제 네트워크
// 요청 캡처로 시작): "현대백화점꺼야 이어서해줘" — project/decision-log.md
// Decision 028이 이미 5개 브랜드(이마트/롯데마트/AK플라자/신세계/현대백화점)
// 를 예정해 culture_club_classes.brand CHECK 제약에 'hyundai'가 포함돼
// 있었다(마이그레이션 변경 불필요).
//
// [실측 확인 — 구조]
// - 목록 페이지(CT010100_L.do, POST, x-www-form-urlencoded)가 서버 렌더
//   HTML을 그대로 돌려준다(JSON 아님) — node-html-parser로 파싱한다
//   (lottemart-culture-club.mjs와 동일한 도구, 제5장 제4조).
// - 이마트(API)·롯데마트(목록에 이미지 없음, 상세 페이지 별도 수집)와
//   달리, 이 목록 자체에 썸네일 이미지가 이미 포함돼 있다(`<img src=
//   "완전한 절대 URL">`) — 별도 상세수집 스크립트가 필요 없다.
// - 지점(stCd)에 'ALL'을 넣으면 전 지점이 한 응답에 섞여 나온다(실측:
//   목동점/천호점/판교점/신촌점/울산점/킨텍스점/미아점 동시 확인) —
//   이마트의 64개 지점 순회, 롯데마트의 지점×대상×학기 조합 없이
//   "카테고리(keyword) × 페이지"만 돌면 전체를 수집할 수 있다.
// - 페이지네이션은 `page` 파라미터(1부터)로, 더 이상 강좌 카드가 없는
//   페이지에서 멈춘다.
//
// [수집 범위 — 사용자 확정](2026-10-08): 전체 12개 카테고리 중 "025(엄마랑
// 아가랑)"/"026(어린이 패밀리)" 2개만. "027(자녀교육 프리맘)"은 사용자
// 판단으로 제외("아기랑 같이가는 강좌 아니야" — 부모 대상 강의로 보임).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { stampCollectedAt } from './lib/culture-club-common.mjs';
import { toUnifiedHyundaiRow } from './lib/culture-club-unified-row.mjs';
import { parseCourseListPage, HYUNDAI_CATEGORY_CODES } from './lib/hyundai-culture-club-parser.mjs';
import { sendDiscordNotification } from '../notify-discord.mjs';

loadEnv();

const SOURCE_KEY = 'HYUNDAI_CULTURE_CLUB';
const LIST_URL = 'https://www.ehyundai.com/newCulture/CT/CT010100_L.do';
const UPSERT_CHUNK_SIZE = 500;
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
// [랜덤 시작 지연] 하루 1회 배치 — 다른 브랜드 배치들과 동일한 관례.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const PAGE_SIZE = 12; // 실제 사이트 기본값 그대로(실측 확인)
const MAX_PAGES_SAFETY = 500; // 무한루프 방지용 방어선(카테고리당 실제로는 150페이지 내외, 실측)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

async function fetchPage(categoryKeyword, page) {
  const body = new URLSearchParams({
    stCd: 'ALL',
    keyword: categoryKeyword,
    pageSize: String(PAGE_SIZE),
    page: String(page),
    // [수집 범위 — 날짜](2026-10-08 실측) 캡처된 요청의 기본값을 그대로
    // 쓴다 — 오늘부터 1년 뒤까지로 넓게 잡아, 날짜 필터 자체 때문에 신규
        // 강좌를 놓치는 일이 없게 한다.
    yearGubnSta: '2026',
    monthGubnSta: '10',
    dayGubnSta: '01',
    yearGubnEnd: '2027',
    monthGubnEnd: '10',
    dayGubnEnd: '31',
    orderGubn: 'status',
    promCrsKind: 'all',
    detailSearch: '0',
  });

  const res = await fetchWithTimeout(LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://www.ehyundai.com',
      Referer: 'https://www.ehyundai.com/newCulture/CT/CT010100_L.do',
    },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`현대백화점 문화센터 목록 조회 실패 (HTTP ${res.status}, keyword=${categoryKeyword}, page=${page})`);
  return res.text();
}

export async function fetchAllForCategory(categoryKeyword) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES_SAFETY; page += 1) {
    const html = await fetchPage(categoryKeyword, page);
    const pageItems = parseCourseListPage(html, categoryKeyword);
    if (pageItems.length === 0) break;
    items.push(...pageItems);
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
      description: '현대백화점 문화센터 강좌 리스트 수집(엄마랑 아가랑/어린이 패밀리 카테고리만)',
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

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 현대백화점 문화센터 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);
  const startedAt = Date.now();

  const allRows = [];
  for (const categoryKeyword of HYUNDAI_CATEGORY_CODES) {
    console.log(`  [${categoryKeyword}] 수집 시작`);
    const items = await fetchAllForCategory(categoryKeyword);
    allRows.push(...items);
    console.log(`  [${categoryKeyword}] ${items.length}건 수신`);
  }

  // 동일 class_id가 여러 카테고리 조회에 걸쳐 중복 수신될 가능성에 대비.
  const collectedAt = new Date().toISOString();
  const rows = stampCollectedAt([...new Map(allRows.map((row) => [row.class_id, row])).values()], collectedAt);
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false };
  }

  const client = createAdminClient();

  // [원본 스테이징 테이블 없이 바로 통합 테이블에 쓴다](toUnifiedHyundaiRow
  // 주석 참고) — 별도 상세수집 단계가 없어 이마트/롯데마트의 "이중 쓰기 시
  // 상세정보 유실" 버그 자체가 발생할 수 없는 구조다.
  let upsertedCount = 0;
  try {
    const unifiedRows = rows.map(toUnifiedHyundaiRow);
    for (let i = 0; i < unifiedRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = unifiedRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client.from('culture_club_classes').upsert(chunk, { onConflict: 'brand,source_class_id' });
      if (error) throw new Error(`culture_club_classes upsert 실패: ${error.message}`);
      upsertedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    await notifyBatchResult({
      title: '❌ [local-open-spaces] 현대백화점 컬처클럽 배치 실패',
      description: err.message.slice(0, 500),
      status: `${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
      color: 0xed4245,
    });
    throw err;
  }

  console.log(`✅ Supabase(culture_club_classes) upsert 완료: ${upsertedCount}건`);

  const byCategory = HYUNDAI_CATEGORY_CODES.reduce(
    (acc, code) => ({ ...acc, [code]: rows.filter((r) => r.category_keyword === code).length }),
    {}
  );
  await postPipelineLog(client, { status: 'OK', metaData: { count: upsertedCount, byCategory } });
  await notifyBatchResult({
    title: '✅ [local-open-spaces] 현대백화점 컬처클럽 배치 완료',
    description: `총 ${upsertedCount}건 수집/upsert (025: ${byCategory['025']}건, 026: ${byCategory['026']}건)`,
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
      console.error(`❌ 현대백화점 문화센터 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
