// [롯데백화점 문화센터 강좌 리스트 수집](2026-10-09 사용자 캡처 기반):
// "이거 롯데마트꺼랑 다른거가?" — culture.lotteshopping.com은 이미
// 수집 중인 롯데마트(culture.lottemart.com)와 완전히 다른 도메인/조직의
// 별개 시스템이다. 7번째 브랜드(Decision 028 5개 → 2026-10-09 AK플라자/
// 스타필드로 6개 → 이번이 7번째, scripts/migrations/2026-10-09-lotte-
// department-brand.sql).
//
// [대분류 2개 × 요청 1번씩, 총 2번의 HTTP 요청으로 전량 수집 — 다른
// 브랜드보다 압도적으로 가벼움](실측 확인) `brchCdList`/`mdclsCtegryCd`
// 를 비우면 전체 지점/소분류가 합쳐져서 나오고, `listCnt`를 크게(10000)
// 주면 페이지네이션 없이 한 응답에 전량이 다 온다(실측: 영유아 6,709건을
// 정말로 한 번에 수신, 7.5MB/5초) — 지점 순회/세션/페이지네이션이 전혀
// 필요 없다.
//
// [목록은 "뼈대"만 — 상세수집이 핵심 데이터를 채움](2026-10-09 사용자
// 지시: "상세꺼가 중요해") toUnifiedLotteDepartmentRow 주석 참고.
//
// [⚠️ 봇 차단/NetFunnel 대기열 리스크 — 4~6시간 랜덤 주기로 완화](2026-
// 10-09 사용자 승인: "4~6시간...내에서 랜덤하게") 이 사이트는 홈페이지에
// Incapsula(WAF)+NetFunnel(대기열) 보호가 걸려있다(실측 확인: 지금은
// list.ajax/view.do 요청이 그 챌린지 없이 바로 응답하지만, 나중에 정책이
// 바뀌어 막힐 수 있다). 랜덤 시작 지연(MAX_STARTUP_DELAY_MS)과 요청 간
// 랜덤 pacing으로 "기계적인 패턴"을 최소화하고, looksLikeListBotBlocked()가
// 응답 이상을 감지하면 "봇 차단 의심"이라고 명시한 에러를 던져 디스코드
// 실패 알림에 그대로 드러나게 한다(사용자 지시: "차단 정책이 바뀌면
// 나한테 알려줘서 내가 인지할수있게해줘").
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { stampCollectedAt, mergeDetailEnrichment } from './lib/culture-club-common.mjs';
import { toUnifiedLotteDepartmentRow } from './lib/culture-club-unified-row.mjs';
import {
  LOTTE_DEPARTMENT_LARGE_CATEGORY_CODES,
  LARGE_LIST_CNT,
  looksLikeListBotBlocked,
  parseLectureListResponse,
} from './lib/lotte-department-culture-club-parser.mjs';
import { sendDiscordNotification } from '../notify-discord.mjs';

loadEnv();

const SOURCE_KEY = 'LOTTE_DEPARTMENT_CULTURE_CLUB';
const LIST_URL = 'https://culture.lotteshopping.com/search/list.ajax';
const UPSERT_CHUNK_SIZE = 500;
const EXISTING_ID_PAGE_SIZE = 1000;
// [4~6시간 랜덤 주기 — 사용자 승인](2026-10-09) Windows 작업 스케줄러는
// 5시간 간격(기준값)으로 트리거하고, 이 랜덤 시작 지연(최대 60분)이
// 실제 실행 시각을 흔들어 효과적으로 4~6시간 범위를 만든다.
const MAX_STARTUP_DELAY_MS = 60 * 60 * 1000;
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 2000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

async function fetchLargeCategoryAll(lrclsCtegryCd) {
  const body = new URLSearchParams({
    type: 'category',
    lrclsCtegryCd,
    mdclsCtegryCd: '',
    smclsCtegryCd: '',
    brchCdList: '',
    yyList: '',
    lectClCdList: '',
    lectStatCdList: '',
    stDaywCdList: '',
    timeTypeList: '',
    amtTypeList: '',
    stAmt: '',
    endAmt: '',
    childBday: '',
    mvgDsplyUseYn: '',
    lectStDtm: '',
    lectEndDtm: '',
    q: '',
    orderSet: 'C',
    pageIndex: '1',
    initIndex: '1',
    listCnt: String(LARGE_LIST_CNT),
    favourite: '',
  });

  const res = await fetchWithTimeout(
    LIST_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      body: body.toString(),
    },
    30000
  );
  if (!res.ok) {
    throw new Error(`롯데백화점 문화센터 목록 조회 실패 (HTTP ${res.status}, lrclsCtegryCd=${lrclsCtegryCd})`);
  }
  const html = await res.text();
  if (looksLikeListBotBlocked(html)) {
    throw new Error(
      `⚠️ 롯데백화점 응답이 예상과 다름 — 봇 차단 또는 사이트 정책 변경 의심(lrclsCtegryCd=${lrclsCtegryCd})`
    );
  }
  return parseLectureListResponse(html);
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '롯데백화점 문화센터 강좌 리스트 수집(대분류 영유아/아동만)',
      period: null,
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

// [상세수집으로 채워진 구조화 컬럼 유실 방지](toUnifiedLotteDepartmentRow
// 주석 참고) 다른 브랜드는 raw_extra.class_intro 하나만 읽어오면 됐지만,
// 이 브랜드는 상세수집이 채우는 컬럼이 많아 그만큼 더 많이 읽어와야
// 한다.
async function fetchDetailEnrichmentByClassId(client) {
  const map = new Map();
  for (let from = 0; ; from += EXISTING_ID_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select(
        'source_class_id, raw_extra, detail_fetched_at, instructor_name, classroom, class_fee, class_day, schedule_days_code, start_time, end_time, schedule_start_date, schedule_end_date, total_sessions, min_age_months, max_age_months'
      )
      .eq('brand', 'lotte_department')
      .range(from, from + EXISTING_ID_PAGE_SIZE - 1);
    if (error) throw new Error(`상세정보 조회 실패: ${error.message}`);
    for (const row of data) {
      map.set(row.source_class_id, { class_id: row.source_class_id, ...row });
    }
    if (data.length < EXISTING_ID_PAGE_SIZE) break;
  }
  return map;
}

// [지점문의/접수마감/접수불가/강의종료/접수예정 제외 — 다른 브랜드와
// 동일한 정책](위 파일 상단 주석 참고) 새로 닫힌/비활성 강좌를 통합
// 테이블에 새로 쌓지 않는다.
export function splitOpenAndClosedRows(rows) {
  const openRows = rows.filter((r) => r.normalized_status !== 'CLOSED');
  const closedClassIds = rows.filter((r) => r.normalized_status === 'CLOSED').map((r) => r.class_id);
  return { openRows, closedClassIds };
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 롯데백화점 문화센터 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);
  const startedAt = Date.now();

  const allRows = [];
  for (const lrclsCtegryCd of LOTTE_DEPARTMENT_LARGE_CATEGORY_CODES) {
    const { items, totalCount } = await fetchLargeCategoryAll(lrclsCtegryCd);
    allRows.push(...items);
    console.log(`  [대분류 ${lrclsCtegryCd}] 총 ${totalCount}건 중 ${items.length}건 파싱`);
    if (items.length < totalCount) {
      console.warn(`⚠️ 대분류 ${lrclsCtegryCd}: 파싱 건수(${items.length})가 총건수(${totalCount})보다 적음 — listCnt 확대 필요할 수 있음`);
    }
    await sleep(randomPacingDelay());
  }

  const collectedAt = new Date().toISOString();
  const rows = stampCollectedAt([...new Map(allRows.map((row) => [row.class_id, row])).values()], collectedAt);
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  const { openRows, closedClassIds } = splitOpenAndClosedRows(rows);
  console.log(`  비활성 상태(지점문의/접수마감/접수불가/강의종료/접수예정) 제외: ${closedClassIds.length}건 — 저장 대상 ${openRows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(openRows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: openRows.length, upserted: false };
  }

  const client = createAdminClient();

  let upsertedCount = 0;
  let closedCount = 0;
  try {
    const enrichmentByClassId = await fetchDetailEnrichmentByClassId(client);
    const unifiedRows = mergeDetailEnrichment(openRows, enrichmentByClassId).map(toUnifiedLotteDepartmentRow);
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
        .update({ raw_status: '접수마감', normalized_status: 'CLOSED' })
        .eq('brand', 'lotte_department')
        .in('source_class_id', chunk);
      if (error) throw new Error(`culture_club_classes 비활성 상태 갱신 실패: ${error.message}`);
      closedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    await notifyBatchResult({
      title: '❌ [local-open-spaces] 롯데백화점 컬처클럽 배치 실패',
      description: err.message.slice(0, 500),
      status: `${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
      color: 0xed4245,
    });
    throw err;
  }

  console.log(`✅ Supabase(culture_club_classes) upsert 완료: ${upsertedCount}건, 비활성 갱신 시도: ${closedCount}건`);

  await postPipelineLog(client, { status: 'OK', metaData: { count: upsertedCount, closedCount } });
  await notifyBatchResult({
    title: '✅ [local-open-spaces] 롯데백화점 컬처클럽 배치 완료',
    description: `총 ${upsertedCount}건 수집/upsert, 비활성 갱신 시도 ${closedCount}건`,
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
      console.error(`❌ 롯데백화점 문화센터 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
