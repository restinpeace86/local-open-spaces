// [롯데마트 문화센터 강좌 상세정보 1회성 수집](2026-10-04 사용자 지시): "상세정보
// 롯데마트 문화센터는 클래스 상세정보같은거왜 안나와? 관리자화면에서.. 강좌코드나
// 강의실이나 강좌소개나 강좌수강 Tip이랄던가 상세들어가면 다 있던데" — 이마트
// emart-culture-club-detail.mjs와 동일한 설계: 목록 배치(lottemart-culture-
// club.mjs)가 먼저 class_id들을 채워둔 뒤, 이 스크립트가 detail_fetched_at이
// null인(아직 상세정보를 시도한 적 없는) 행만 골라 상세 페이지(courseview.do)
// 단건 조회로 채운다. 상세설명/강의실/강좌코드는 정적 콘텐츠라 class_id당 딱
// 한 번만 가져오면 된다 — 상태(registration_status)는 이미 매일 도는 목록
// 배치와 15분 주기 찜-워치 배치가 계속 갱신하므로 이 스크립트와는 무관하다.
//
// [실측 확인 — 강좌정보 표 구조](2026-10-04): courseview.do의
// `<div id="lctInfo"><table class="view-table">`에 4개 필드가 있다 —
// 첫 번째 `<tr>`에 강좌코드/강의실이 th/td 2쌍으로 나란히, 그 다음
// `<tr>` 2개에 강좌소개/강좌 수강 Tip이 각각 `colspan="3"`로 전체 폭을 차지.
// 소개/Tip 텍스트는 `<br/>`로 줄바꿈돼 있어 일반 .text로 뽑으면 줄바꿈이
// 사라진다 — `<br/>`를 플레이스홀더로 치환한 뒤 재파싱(엔티티 디코딩은
// node-html-parser가 처리)하고 다시 개행으로 되돌리는 방식으로 뽑는다.
import { pathToFileURL } from 'url';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';

// [loadEnv 누락 버그 재발 방지](2026-10-04 — lottemart-culture-club.mjs에서
// 이미 한 번 겪은 실수): run()이 entry-point 가드 밖에서도 직접 import돼
// 호출될 수 있으므로, 모듈 최상단에서 한 번 로드해 둔다(E-mart 상세 스크립트
// emart-culture-club-detail.mjs의 `const env = loadEnv();` 패턴과 동일).
loadEnv();

const SOURCE_KEY = 'LOTTEMART_CULTURE_CLUB_DETAIL';
const DETAIL_URL = 'https://culture.lottemart.com/cu/gus/course/courseinfo/courseview.do';
const REQUEST_PACING_MIN_MS = 300;
const REQUEST_PACING_MAX_MS = 1000;
const PENDING_PAGE_SIZE = 1000;
const BR_PLACEHOLDER = '\u0000BR\u0000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// 원본 HTML 소스 자체의 들여쓰기(줄바꿈+공백)가 그대로 텍스트에 섞여 들어오므로,
// <br/> 자리에 심어둔 플레이스홀더만 "의미 있는 줄바꿈"으로 남기고 나머지 공백은
// 전부 스페이스 1개로 뭉갠 뒤, 플레이스홀더 기준으로 다시 쪼개 줄바꿈을 복원한다.
function tdTextWithLineBreaks(td) {
  const withPlaceholder = td.innerHTML.replace(/<br\s*\/?>/gi, BR_PLACEHOLDER);
  const rawText = parse(`<div>${withPlaceholder}</div>`).text;
  const collapsed = rawText.replace(/\s+/g, ' ');
  return collapsed
    .split(BR_PLACEHOLDER)
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

export function parseDetailInfoTable(html) {
  const root = parse(html);
  const table = root.querySelector('#lctInfo table.view-table');
  if (!table) return { classCode: null, classroom: null, classIntro: null, classTip: null };

  const result = { classCode: null, classroom: null, classIntro: null, classTip: null };
  for (const tr of table.querySelectorAll('tr')) {
    const ths = tr.querySelectorAll('th');
    const tds = tr.querySelectorAll('td');
    for (let i = 0; i < ths.length; i += 1) {
      const label = ths[i].text.trim();
      const td = tds[i];
      if (!td) continue;
      if (label === '강좌코드') result.classCode = td.text.trim() || null;
      else if (label === '강의실') result.classroom = td.text.trim() || null;
      else if (label === '강좌소개') result.classIntro = tdTextWithLineBreaks(td) || null;
      else if (label === '강좌 수강 Tip') result.classTip = tdTextWithLineBreaks(td) || null;
    }
  }
  return result;
}

async function fetchDetailHtml(storeCode, classId, semesterCode, targetCode) {
  const params = new URLSearchParams({
    search_str_cd: storeCode,
    cls_cd: classId,
    search_term_cd: semesterCode,
    search_cls_target: targetCode,
  });
  const res = await fetchWithTimeout(`${DETAIL_URL}?${params.toString()}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}, class_id=${classId})`);
  return res.text();
}

async function fetchAllPendingRows(client) {
  const allRows = [];
  for (let page = 0; ; page += 1) {
    const from = page * PENDING_PAGE_SIZE;
    const { data, error } = await client
      .from('lottemart_culture_club_classes')
      .select('id, class_id, store_code, semester_code, target_code')
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
      description: '롯데마트 문화센터 강좌 상세정보(강좌코드/강의실/소개/Tip) 1회성 수집 — class_id당 한 번만',
      period: 'daily',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 롯데마트 문화센터 상세정보 수집 시작 (dry-run: ${dryRun})`);

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
      const html = await fetchDetailHtml(row.store_code, row.class_id, row.semester_code, row.target_code);
      const { classCode, classroom, classIntro, classTip } = parseDetailInfoTable(html);

      const { error: updateError } = await client
        .from('lottemart_culture_club_classes')
        .update({
          class_code: classCode,
          classroom,
          class_intro: classIntro,
          class_tip: classTip,
          detail_fetched_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (updateError) throw new Error(updateError.message);

      successCount += 1;
    } catch (err) {
      errors.push({ classId: row.class_id, message: err.message });
      console.error(`⚠️ ${row.class_id} 상세정보 수집 실패(계속 진행): ${err.message}`);
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
  run({ dryRun }).catch((err) => {
    console.error(`❌ 롯데마트 문화센터 상세정보 수집 실패: ${err.message}`);
    process.exit(1);
  });
}
