// [롯데백화점 문화센터 상세정보 수집](2026-10-09 사용자 지시: "상세꺼가
// 중요해.. 상세데이터도 확인해보자") — 실측 확인 결과 이 브랜드는 다른
// 브랜드와 달리 **상세 페이지가 목록보다 훨씬 구조화된 진짜 데이터**를
// 갖고 있다: 목록 카드는 "요일 HH:MM~HH:MM, 총 N회" 식의 느슨한 텍스트
// 뿐이지만(그리고 "세부 일정 선택"처럼 아예 요일/시간이 없는 경우도
// 있음), 상세 페이지(/application/search/view.do?brchCd=...&yy=...&
// lectSmsterCd=...&lectCd=...)는 <dt>/<dd> 쌍으로 지점/강좌구분/학기/
// **강사명(개인 강사 이름)**/강의기간/강의시간/강의횟수·정원/**강의실**/
// 수강료/자녀연령/대상구분/접수기간/문의처를 전부 명확하게 제공한다.
//
// [그래서 이 브랜드만 다른 설계 — 상세수집이 핵심 구조화 컬럼을 채움]
// 다른 6개 브랜드(AK플라자/신세계/스타필드 등)는 상세수집이 소개 텍스트
// (class_intro)만 1회성으로 채우고 나머지는 전부 목록 배치가 책임졌다.
// 이 브랜드는 목록이 너무 느슨해서(강사명 없음, 강의실 없음, 자녀연령도
// 일부만) 상세수집이 요일/시간/강사명/강의실/연령/수강료/소개 텍스트까지
// 책임진다 — lotte-department-culture-club.mjs(목록 배치)는 지점/상태/
// 제목/이미지/식별자만 채운 "뼈대" 행을 넣고, 이 스크립트가 나머지를
// 덧씌운다(merge, raw_extra 통째로 덮어쓰지 않음 — 다른 브랜드와 동일한
// "이중 쓰기 방지" 원칙).
//
// [세션/쿠키 불필요 — 완전 공개 페이지](실측 확인) GET 요청만으로 200 +
// 정상 콘텐츠.
//
// [node-html-parser 사용 — 안전함 확인](2026-10-09 실측 확인: 이 상세
// 페이지엔 <table>이 전혀 없어 AK플라자에서 겪은 table 파싱 버그가
// 재현되지 않는다, div/dl 구조라 정상 동작 확인).
import { pathToFileURL } from 'url';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { parseAgeRangeToMonths } from './lib/age-range-parser.mjs';
import { normalizeDaysToCodes } from './lib/schedule-normalizer.mjs';
import { looksLikeDetailBotBlocked } from './lib/lotte-department-culture-club-parser.mjs';

loadEnv();

const SOURCE_KEY = 'LOTTE_DEPARTMENT_CULTURE_CLUB_DETAIL';
const DOMAIN = 'https://culture.lotteshopping.com';

function buildDetailUrl({ brchCd, yy, lectSmsterCd, lectCd }) {
  const query = new URLSearchParams({ brchCd, yy, lectSmsterCd, lectCd });
  return `${DOMAIN}/application/search/view.do?${query.toString()}`;
}

const REQUEST_PACING_MIN_MS = 500;
const REQUEST_PACING_MAX_MS = 1200;
// [랜덤 지연](다른 상세 스크립트와 동일한 관례) — 4~6시간 주기 배치라 1회
// 실행 범위에선 넉넉하게 최대 20분.
const MAX_STARTUP_DELAY_MS = 20 * 60 * 1000;
const PENDING_PAGE_SIZE = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// [dt/dd 맵 구성](실측 확인: 13개 키가 전부 고유함 — 중복/모호함 없음)
function buildDtDdMap(root) {
  const map = new Map();
  for (const dt of root.querySelectorAll('dt')) {
    const key = dt.text.trim();
    const dd = dt.nextElementSibling;
    if (key && dd) map.set(key, dd.text.replace(/\s+/g, ' ').trim());
  }
  return map;
}

// "2026.09.08 ~ 2026.09.08" → { startDate: '2026-09-08', endDate: '2026-09-08' }.
export function parseDotDateRange(text) {
  if (typeof text !== 'string') return { startDate: null, endDate: null };
  const match = /(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/.exec(text);
  if (!match) return { startDate: null, endDate: null };
  const [, y1, m1, d1, y2, m2, d2] = match;
  return { startDate: `${y1}-${m1}-${d1}`, endDate: `${y2}-${m2}-${d2}` };
}

// "(수) 11:20~12:00" → { day: '수', startTime: '1120', endTime: '1200' }.
export function parseDayTimeRange(text) {
  if (typeof text !== 'string') return { day: null, startTime: null, endTime: null };
  const match = /\(([가-힣])\)\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return { day: null, startTime: null, endTime: null };
  const [, day, h1, mi1, h2, mi2] = match;
  return { day, startTime: `${h1.padStart(2, '0')}${mi1}`, endTime: `${h2.padStart(2, '0')}${mi2}` };
}

// "12,000원" → 12000.
export function parseFeeAmount(text) {
  if (typeof text !== 'string') return null;
  const digits = text.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// "1회/12명" → { sessions: 1, capacity: 12 }.
export function parseSessionsAndCapacity(text) {
  if (typeof text !== 'string') return { sessions: null, capacity: null };
  const match = /(\d+)\s*회\s*\/\s*(\d+)\s*명/.exec(text);
  if (!match) return { sessions: null, capacity: null };
  return { sessions: Number(match[1]), capacity: Number(match[2]) };
}

// "강좌소개" 바로 다음 .info_img_txt 텍스트(실측 확인).
export function parseClassIntro(root) {
  const subTits = root.querySelectorAll('p.sub_tit');
  const introTit = subTits.find((p) => p.text.trim() === '강좌소개');
  const div = introTit?.nextElementSibling;
  if (!div || div.getAttribute('class')?.includes('info_img_txt') !== true) return null;
  const text = div.text.replace(/\s+/g, ' ').trim();
  return text || null;
}

export function parseDetailHtml(html) {
  const root = parse(html);
  const dtDd = buildDtDdMap(root);
  const { startDate: scheduleStartDate, endDate: scheduleEndDate } = parseDotDateRange(dtDd.get('강의기간'));
  const { day, startTime, endTime } = parseDayTimeRange(dtDd.get('강의시간'));
  const { sessions, capacity } = parseSessionsAndCapacity(dtDd.get('강의횟수/정원'));
  const { minAgeMonths, maxAgeMonths } = parseAgeRangeToMonths(dtDd.get('자녀연령'));
  const { startDate: registerStartDate, endDate: registerEndDate } = parseDotDateRange(dtDd.get('접수기간'));

  return {
    instructor_name: dtDd.get('강사명') ?? null,
    classroom: dtDd.get('강의실') ?? null,
    class_fee: parseFeeAmount(dtDd.get('수강료')),
    class_day: day ? [day] : null,
    schedule_days_code: day ? normalizeDaysToCodes([day]) : null,
    start_time: startTime,
    end_time: endTime,
    schedule_start_date: scheduleStartDate,
    schedule_end_date: scheduleEndDate,
    total_sessions: sessions,
    min_age_months: minAgeMonths,
    max_age_months: maxAgeMonths,
    lect_gubun: dtDd.get('강좌구분') ?? null,
    target_gubun: dtDd.get('대상구분') ?? null,
    capacity,
    register_start_date: registerStartDate,
    register_end_date: registerEndDate,
    contact_phone: dtDd.get('문의처') ?? null,
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
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}, class_id=${params.lectCd})`);
  const html = await res.text();
  if (looksLikeDetailBotBlocked(html)) {
    throw new Error('⚠️ 롯데백화점 상세 페이지 응답이 예상과 다름 — 봇 차단 또는 사이트 정책 변경 의심');
  }
  return html;
}

async function fetchAllPendingRows(client) {
  const allRows = [];
  for (let from = 0; ; from += PENDING_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('id, source_class_id, raw_extra')
      .eq('brand', 'lotte_department')
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
      description: '롯데백화점 문화센터 상세정보(요일/시간/강사명/강의실/연령/소개) 1회성 수집 — source_class_id당 한 번만',
      period: null,
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 롯데백화점 문화센터 상세정보 수집 시작 (dry-run: ${dryRun})`);

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
      // class_id 포맷: "{brchCd}_{yy}_{lectSmsterCd}_{lectCd}"(lotte-department-
      // culture-club-parser.mjs의 복합 키 — 상세 페이지 URL을 다시 만들려면
      // 네 조각 모두 필요하다).
      const [brchCd, yy, lectSmsterCd, lectCd] = row.source_class_id.split('_');
      if (!brchCd || !yy || !lectSmsterCd || !lectCd) {
        throw new Error(`class_id 형식이 예상과 다름: ${row.source_class_id}`);
      }

      const html = await fetchDetailHtml({ brchCd, yy, lectSmsterCd, lectCd });
      const detail = parseDetailHtml(html);

      const { error: updateError } = await client
        .from('culture_club_classes')
        .update({
          instructor_name: detail.instructor_name,
          classroom: detail.classroom,
          class_fee: detail.class_fee,
          class_day: detail.class_day,
          schedule_days_code: detail.schedule_days_code,
          start_time: detail.start_time,
          end_time: detail.end_time,
          schedule_start_date: detail.schedule_start_date,
          schedule_end_date: detail.schedule_end_date,
          total_sessions: detail.total_sessions,
          min_age_months: detail.min_age_months,
          max_age_months: detail.max_age_months,
          // [raw_extra 통째로 덮어쓰지 않음] 목록 배치가 이미 써둔 main_image_url
          // 등 기존 값에 상세 전용 필드만 합친다.
          raw_extra: {
            ...row.raw_extra,
            lect_gubun: detail.lect_gubun,
            target_gubun: detail.target_gubun,
            capacity: detail.capacity,
            register_start_date: detail.register_start_date,
            register_end_date: detail.register_end_date,
            contact_phone: detail.contact_phone,
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
  const botBlockSuspected = errors.some((e) => e.message.includes('봇 차단'));
  await postPipelineLog(client, {
    status: errors.length > 0 && successCount === 0 ? 'FAILED' : 'OK',
    errorMessage: errors.length > 0 ? `${errors.length}건 실패(예: ${errors[0]?.classId})${botBlockSuspected ? ' — 봇 차단 의심' : ''}` : null,
    metaData: { pending: pendingRows.length, success: successCount, failed: errors.length, botBlockSuspected },
  });

  return { sourceKey: SOURCE_KEY, count: successCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run({ dryRun }))
    .catch((err) => {
      console.error(`❌ 롯데백화점 문화센터 상세정보 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
