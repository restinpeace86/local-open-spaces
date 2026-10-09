// [이랜드리테일 문화센터 상세정보 수집](2026-10-09) 목록 응답
// (getLectureList.do)이 상태/제목(연령 포함)/지점/요일/시간/수강료까지는
// 이미 주지만(신세계/AK플라자 수준), 재료비/교재비/전체정원/정확한
// 강좌기간(시작~종료일)/강좌개요(소개 텍스트)는 상세 페이지(/m/culture/
// culture04.do?storeid=...&semnum=...&lectypeid=...&seq=...)에만 있다
// (실측 확인, 로그인 없이도 공개 접근 가능). 그래서 이 브랜드는 롯데
// 백화점처럼 "뼈대만" 넣는 게 아니라, 목록 배치가 이미 핵심 필드를
// 채우고 이 상세수집이 나머지만 보강하는 — 다른 다수 브랜드(AK플라자/
// 스타필드)와 동일한 "목록 우선 + 상세 보강" 설계다.
//
// [강사명 — 목록/상세 둘 다 "전문강사" placeholder뿐](실측 확인) 실제
// 강사 개인명은 "강좌개요" 자유 텍스트 안에만 섞여 있어(예: "전문강사
// 이정민") 안정적으로 추출할 근거가 없다 — instructor_name은 null로
// 두고 지어내지 않는다(제3장 제5조).
//
// [node-html-parser 사용 — 안전함 확인](2026-10-09 실측 확인: 이 상세
// 페이지의 <table>은 1개뿐이고 th/td 11쌍이 전부 정상 파싱됨 — AK플라자
// 에서 겪은 table 파싱 버그가 재현되지 않음).
import { pathToFileURL } from 'url';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';

loadEnv();

const SOURCE_KEY = 'ELAND_RETAIL_CULTURE_CLUB_DETAIL';
const DOMAIN = 'https://www.elandretail.com';

function buildDetailUrl({ storeId, semNum, lecTypeId, seq }) {
  const query = new URLSearchParams({ storeid: storeId, semnum: semNum, lectypeid: lecTypeId, seq });
  return `${DOMAIN}/m/culture/culture04.do?${query.toString()}`;
}

const REQUEST_PACING_MIN_MS = 500;
const REQUEST_PACING_MAX_MS = 1200;
const MAX_STARTUP_DELAY_MS = 20 * 60 * 1000;
const PENDING_PAGE_SIZE = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

function buildThDdMap(root) {
  const map = new Map();
  for (const th of root.querySelectorAll('th')) {
    const key = th.text.trim();
    const td = th.nextElementSibling;
    if (key && td) map.set(key, td.text.replace(/\s+/g, ' ').trim());
  }
  return map;
}

// "2026.12.07~2027.02.22" → { startDate: '2026-12-07', endDate: '2027-02-22' }.
export function parseDotDateRange(text) {
  if (typeof text !== 'string') return { startDate: null, endDate: null };
  const match = /(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(text);
  if (!match) return { startDate: null, endDate: null };
  const [, y1, m1, d1, y2, m2, d2] = match;
  return { startDate: `${y1}-${m1}-${d1}`, endDate: `${y2}-${m2}-${d2}` };
}

// "15명" → 15, "40000원" → 40000.
export function parseLeadingNumber(text) {
  if (typeof text !== 'string') return null;
  const match = /(\d+)/.exec(text);
  return match ? Number(match[1]) : null;
}

// "강좌개요" <details><summary> 바로 다음 본문 텍스트(실측 확인: summary
// 텍스트가 details.text에 그대로 포함돼 있어 앞에서 잘라낸다).
export function parseClassIntro(root) {
  const details = root.querySelectorAll('details.comm-togg');
  const introDetails = details.find((d) => d.querySelector('summary')?.text.trim() === '강좌개요');
  if (!introDetails) return null;
  const summaryText = introDetails.querySelector('summary').text.trim();
  const fullText = introDetails.text.replace(/\s+/g, ' ').trim();
  const bodyText = fullText.startsWith(summaryText) ? fullText.slice(summaryText.length).trim() : fullText;
  return bodyText || null;
}

export function parseDetailHtml(html) {
  const root = parse(html);
  const thTd = buildThDdMap(root);
  const { startDate: scheduleStartDate, endDate: scheduleEndDate } = parseDotDateRange(thTd.get('강좌기간'));

  return {
    classroom: thTd.get('강의실') ?? null,
    schedule_start_date: scheduleStartDate,
    schedule_end_date: scheduleEndDate,
    capacity: parseLeadingNumber(thTd.get('전체정원')),
    class_material_fee: parseLeadingNumber(thTd.get('재료비')),
    textbook_fee: parseLeadingNumber(thTd.get('교재비')),
    first_class_supplies: thTd.get('첫 시간 준비물') ?? null,
    class_intro: parseClassIntro(root),
  };
}

async function fetchDetailHtml(params) {
  const url = buildDetailUrl(params);
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}, class_id=${params.seq})`);
  return res.text();
}

async function fetchAllPendingRows(client) {
  const allRows = [];
  for (let from = 0; ; from += PENDING_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('id, source_class_id, raw_extra')
      .eq('brand', 'eland_retail')
      .eq('is_excluded', false)
      .is('detail_fetched_at', null)
      .range(from, from + PENDING_PAGE_SIZE - 1);
    if (error) throw new Error(`수집 대상 조회 실패: ${error.message}`);
    allRows.push(...data);
    if (data.length < PENDING_PAGE_SIZE) break;
  }
  return allRows;
}

async function postPipelineLog(client, { status, errorMessage = null, metaData = null }) {
  try {
    const { error } = await client.from('pipeline_logs').insert({
      agent_name: SOURCE_KEY,
      status,
      error_message: errorMessage,
      meta_data: metaData,
      description: '이랜드리테일 문화센터 상세정보(강의실/강좌기간/정원/재료비/교재비/소개) 1회성 수집',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 이랜드리테일 문화센터 상세정보 수집 시작 (dry-run: ${dryRun})`);

  const client = createAdminClient();
  const pendingRows = await fetchAllPendingRows(client);
  console.log(`  → 상세정보 미수집 ${pendingRows.length}건 발견`);

  if (dryRun) {
    return { sourceKey: SOURCE_KEY, count: pendingRows.length, upserted: false };
  }

  let successCount = 0;
  const errors = [];

  for (const row of pendingRows) {
    try {
      // class_id 포맷: "{storeId}_{semNum}_{lecTypeId}_{seq}"(eland-retail-
      // culture-club-parser.mjs의 복합 키).
      const [storeId, semNum, lecTypeId, seq] = row.source_class_id.split('_');
      if (!storeId || !semNum || !lecTypeId || !seq) {
        throw new Error(`class_id 형식이 예상과 다름: ${row.source_class_id}`);
      }

      const html = await fetchDetailHtml({ storeId, semNum, lecTypeId, seq });
      const detail = parseDetailHtml(html);

      const { error: updateError } = await client
        .from('culture_club_classes')
        .update({
          classroom: detail.classroom,
          schedule_start_date: detail.schedule_start_date,
          schedule_end_date: detail.schedule_end_date,
          class_material_fee: detail.class_material_fee,
          raw_extra: {
            ...row.raw_extra,
            capacity: detail.capacity,
            textbook_fee: detail.textbook_fee,
            first_class_supplies: detail.first_class_supplies,
            class_intro: detail.class_intro,
          },
          detail_fetched_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (updateError) throw new Error(updateError.message);

      successCount += 1;
    } catch (err) {
      errors.push({ classId: row.source_class_id, message: err.message });
      console.error(`⚠️ ${row.source_class_id} 상세정보 수집 실패(계속 진행): ${err.message}`);
    }

    await sleep(randomPacingDelay());
  }

  console.log(`✅ 상세정보 수집 완료: 성공 ${successCount}건 / 실패 ${errors.length}건`);
  await postPipelineLog(client, {
    status: errors.length > 0 && successCount === 0 ? 'FAILED' : 'OK',
    errorMessage: errors.length > 0 ? `${errors.length}건 실패(예: ${errors[0]?.classId})` : null,
    metaData: { pending: pendingRows.length, success: successCount, failed: errors.length },
  });

  return { sourceKey: SOURCE_KEY, count: successCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run({ dryRun }))
    .catch((err) => {
      console.error(`❌ 이랜드리테일 문화센터 상세정보 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
