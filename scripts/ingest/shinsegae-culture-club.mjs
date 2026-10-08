// [신세계 아카데미 문화센터 강좌 리스트 수집](2026-10-08, implementation/
// todo.md 개선사항2 사용자 캡처 요청): "신세계 문화센터의 url이야 이것도
// 다른 문화센터처럼 주기적으로 데이터 가져오기 위한 연동 작업 점검해줘."
//
// [실측 확인 — 구조] 엔드포인트(POST sacademy.shinsegae.com/sdotcom/web/
// HP0010P0/getLectList.do, x-www-form-urlencoded)는 서버 렌더 HTML이 아니라
// JSON을 직접 돌려준다(파싱 불필요, lib/shinsegae-culture-club-parser.mjs
// 참고) — 현대백화점(HTML)보다도 더 가볍다.
//
// [다중값 요청 — storeCode/targetCode 둘 다 불가, 실측 확인] 사용자가
// 캡처한 요청은 storeCode/rcptStat/targetCode를 전부 공백으로 묶어 보냈지만
// (브라우저가 "전체 선택" 상태를 그렇게 직렬화한 것으로 보임), 실제로
// 재현하면 storeCode/targetCode는 공백이든 콤마든 다중값을 넣는 순간
// totalCount=0으로 깨진다(롯데마트와 동일한 서버 측 제약) — 지점 12개 ×
// 수강대상(targetCode) 3개를 전부 단건으로 순회해야 한다.
//
// [rcptStat만 예외] 빈 값으로 보내면 PR(접수전)/RT(접수중)/RC(접수마감)/
// ST(대기등록) 전부의 합집합을 한 번에 돌려주고(실측: 개별 합과 정확히
// 일치), 응답의 lectStat 필드로 각 행의 실제 상태를 그대로 알 수 있다 —
// 지점×대상 조합마다 상태별로 또 나눠 조회할 필요가 없다(한 번만 조회).
//
// [targetCode 라벨 — C1만 확정](사용자 제공 캡처, reference/sinsegae.png)
// B1/B2는 라벨 미확정, 코드값만 보존한다(추측 금지, 제3장 제5조).
//
// [학기(schSmstCode) — 확정된 값만 사용] 사용자가 캡처한 당시의 기본값
// 'S3'(가을학기)만 쓴다. 다른 학기 코드(겨울 등)는 드롭다운이 JS로 동적
// 생성돼 정적 분석으로 확정할 수 없었다 — 추측으로 더 추가하지 않는다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { stampCollectedAt } from './lib/culture-club-common.mjs';
import { toUnifiedShinsegaeRow } from './lib/culture-club-unified-row.mjs';
import {
  SHINSEGAE_STORES,
  SHINSEGAE_TARGET_CODES,
  parseLectureListResponse,
  getLectureListTotalCount,
} from './lib/shinsegae-culture-club-parser.mjs';
import { sendDiscordNotification } from '../notify-discord.mjs';

loadEnv();

const SOURCE_KEY = 'SHINSEGAE_CULTURE_CLUB';
const LIST_URL = 'https://sacademy.shinsegae.com/sdotcom/web/HP0010P0/getLectList.do';
const SCHOOL_SEMESTER_CODE = 'S3';
const UPSERT_CHUNK_SIZE = 500;
const REQUEST_PACING_MIN_MS = 1000;
const REQUEST_PACING_MAX_MS = 1500;
// [랜덤 시작 지연] 하루 1회 배치 — 다른 브랜드 배치들과 동일한 관례.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const MAX_PAGES_SAFETY = 500; // 무한루프 방지용 방어선

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

async function fetchPage(storeCode, targetCode, page) {
  const body = new URLSearchParams({
    ordKey: '',
    curPage: String(page),
    vipUseFlag: '',
    prmStoreCode: '',
    prmYearCode: '',
    prmSmstCode: '',
    prmLectCode: '',
    yearCode: '',
    smstCode: '',
    sttlmBtnYn: 'Y',
    adminFlag: '',
    autoSeachYn: 'Y',
    search: 'Y',
    storeCode,
    onOffCode: '',
    onlineStoreCode: '',
    lectGrType: '',
    lectGrCode: '',
    schSmstCode: SCHOOL_SEMESTER_CODE,
    rcptStat: '', // [실측] 빈 값 = 전체 상태 합집합(위 주석 참고) — 사후에 normalizeShinsegaeStatus로 분류.
    dayCode: '',
    lectTimeCode: '',
    targetCode,
    tchName: '',
    lectName: '',
    srchCndCd: '01',
    srchWrd: '',
  });

  const res = await fetchWithTimeout(LIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Origin: 'https://sacademy.shinsegae.com',
      Referer: 'https://sacademy.shinsegae.com/sdotcom/web/HP0010P0/HP0010P0.do',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`신세계 아카데미 목록 조회 실패 (HTTP ${res.status}, storeCode=${storeCode}, targetCode=${targetCode}, page=${page})`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`신세계 아카데미 응답이 JSON이 아닙니다(storeCode=${storeCode}, targetCode=${targetCode}): ${text.slice(0, 300)}`);
  }
}

export async function fetchAllForStoreAndTarget(storeCode, targetCode) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES_SAFETY; page += 1) {
    const json = await fetchPage(storeCode, targetCode, page);
    const pageItems = parseLectureListResponse(json, targetCode);
    items.push(...pageItems);
    if (page === 1 && getLectureListTotalCount(json) === 0) break;
    if (pageItems.length === 0) break;
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
      description: '신세계 아카데미 문화센터 강좌 리스트 수집(수강대상 B1/B2/C1 — 위드맘/대디/패밀리/키즈 계열)',
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
  console.log(`▶ 신세계 아카데미 문화센터 강좌 리스트 수집 시작 (dry-run: ${dryRun})`);
  const startedAt = Date.now();

  const allRows = [];
  for (const [storeCode, storeName] of SHINSEGAE_STORES) {
    for (const targetCode of SHINSEGAE_TARGET_CODES) {
      const items = await fetchAllForStoreAndTarget(storeCode, targetCode);
      allRows.push(...items);
      console.log(`  [${storeName}/${targetCode}] ${items.length}건 수신`);
      await sleep(randomPacingDelay());
    }
  }

  // 동일 강좌가 수강대상 조합 중복에 걸릴 가능성에 대비(실측상 흔치는 않음 —
  // 한 강좌가 여러 대상 코드에 동시 노출되는 경우가 있다면 마지막 값으로 합친다).
  const collectedAt = new Date().toISOString();
  const rows = stampCollectedAt([...new Map(allRows.map((row) => [row.class_id, row])).values()], collectedAt);
  console.log(`✅ 전체 수신 ${allRows.length}건, 중복 제거 후 ${rows.length}건`);

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    return { sourceKey: SOURCE_KEY, count: rows.length, upserted: false };
  }

  const client = createAdminClient();

  // [원본 스테이징 테이블 없이 바로 통합 테이블에 쓴다](toUnifiedShinsegaeRow
  // 주석 참고) — 현대백화점과 동일하게 별도 상세수집 단계가 없는 구조다.
  let upsertedCount = 0;
  try {
    const unifiedRows = rows.map(toUnifiedShinsegaeRow);
    for (let i = 0; i < unifiedRows.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = unifiedRows.slice(i, i + UPSERT_CHUNK_SIZE);
      const { error } = await client.from('culture_club_classes').upsert(chunk, { onConflict: 'brand,source_class_id' });
      if (error) throw new Error(`culture_club_classes upsert 실패: ${error.message}`);
      upsertedCount += chunk.length;
    }
  } catch (err) {
    await postPipelineLog(client, { status: 'FAILED', errorMessage: err.message.slice(0, 500) });
    await notifyBatchResult({
      title: '❌ [local-open-spaces] 신세계 아카데미 컬처클럽 배치 실패',
      description: err.message.slice(0, 500),
      status: `${((Date.now() - startedAt) / 1000).toFixed(1)}초`,
      color: 0xed4245,
    });
    throw err;
  }

  console.log(`✅ Supabase(culture_club_classes) upsert 완료: ${upsertedCount}건`);

  const byTarget = SHINSEGAE_TARGET_CODES.reduce(
    (acc, code) => ({ ...acc, [code]: rows.filter((r) => r.target_code === code).length }),
    {}
  );
  await postPipelineLog(client, { status: 'OK', metaData: { count: upsertedCount, byTarget } });
  await notifyBatchResult({
    title: '✅ [local-open-spaces] 신세계 아카데미 컬처클럽 배치 완료',
    description: `총 ${upsertedCount}건 수집/upsert (B1: ${byTarget.B1}건, B2: ${byTarget.B2}건, C1: ${byTarget.C1}건)`,
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
      console.error(`❌ 신세계 아카데미 문화센터 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
