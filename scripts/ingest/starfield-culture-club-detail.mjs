// [스타필드 문화센터(클래스콕) 강좌 소개 텍스트 1회성 수집](2026-10-09
// 사용자 지시: "일단 상세페이지부터 조사하고.. ㄱ" → "그렇게 진행하자")
// — 목록 응답(selectLctrList.do)엔 소개 텍스트가 없지만, 상세 페이지
// (/mlt/initLctrDetl.do?lctrNo=...&store=...)의 "클래스소개" 바로 다음
// <div>에 있다(실측 확인).
//
// [이미지는 상세 페이지에서 가져오지 않음 — 다른 브랜드와 다른 점](실측
// 확인) 목록 응답의 thumbnailImgPath가 이미 완전한 URL이라 별도 상세
// 수집이 필요 없다 — starfield-culture-club.mjs(목록 배치)가 이미
// main_image_url을 채워둔다. 이 스크립트는 소개 텍스트만 책임진다.
//
// [세션/쿠키 불필요 — 완전 공개 페이지](실측 확인) 상세 페이지는
// `?lctrNo=...&store=영문지점명` 쿼리 파라미터만으로 쿠키 없이도 200 +
// 정상 콘텐츠를 반환한다(og:url 메타에서 이 형태를 그대로 확인) — 신세계
// 상세 페이지와 동일하게 공개 딥링크.
//
// [node-html-parser 사용 — AK플라자와 달리 안전함](2026-10-09 실측
// 확인) AK플라자 상세 페이지는 <table> 구조라 node-html-parser가 파싱을
// 실패했지만(정규식으로 교체), 스타필드 상세 페이지는 순수 <div>/<h4>
// 구조라 node-html-parser의 querySelector가 정상 동작함을 실측으로
// 확인했다(테이블 파싱만의 문제였음 — 이 페이지엔 해당 문제가 없음).
//
// [원본 스테이징 테이블 없음 — 통합 테이블에 직접 merge](신세계/AK플라자
// 와 동일한 설계) raw_extra를 통째로 덮어쓰지 않고 기존 값에 class_intro
// 만 합쳐서(merge) 쓴다.
import { pathToFileURL } from 'url';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';
import { STARFIELD_STORES } from './lib/starfield-culture-club-parser.mjs';

loadEnv();

const SOURCE_KEY = 'STARFIELD_CULTURE_CLUB_DETAIL';
const DOMAIN = 'https://www.classkok.com';
const STORE_EN_NAME_BY_CODE = new Map(STARFIELD_STORES.map(([code, , enName]) => [code, enName]));

function buildDetailUrl({ storeEnNm, lctrNo }) {
  const query = new URLSearchParams({ lctrNo, store: storeEnNm });
  return `${DOMAIN}/mlt/initLctrDetl.do?${query.toString()}`;
}

const REQUEST_PACING_MIN_MS = 300;
const REQUEST_PACING_MAX_MS = 1000;
// [랜덤 시작 지연](다른 상세 스크립트와 동일한 관례) — 하루 1회 배치, 넉넉하게 최대 10분.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const PENDING_PAGE_SIZE = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// "클래스소개" <h4> 바로 다음 <div> 텍스트를 가져온다(실측 확인).
export function parseClassIntro(html) {
  const root = parse(html);
  const headings = root.querySelectorAll('h4');
  const introHeading = headings.find((h) => h.text.trim() === '클래스소개');
  const div = introHeading?.nextElementSibling;
  if (!div) return null;
  const text = div.text.replace(/\s+/g, ' ').trim();
  return text || null;
}

async function fetchDetailHtml({ storeEnNm, lctrNo }) {
  const url = buildDetailUrl({ storeEnNm, lctrNo });
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`상세 페이지 조회 실패 (HTTP ${res.status}, class_id=${lctrNo})`);
  return res.text();
}

async function fetchAllPendingRows(client) {
  const allRows = [];
  for (let from = 0; ; from += PENDING_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('id, source_class_id, store_code, raw_extra')
      .eq('brand', 'starfield')
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
      description: '스타필드 문화센터 강좌 소개 텍스트(클래스소개) 1회성 수집 — source_class_id당 한 번만',
      period: 'daily',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 스타필드 문화센터 상세정보(소개 텍스트) 수집 시작 (dry-run: ${dryRun})`);

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
      const storeEnNm = STORE_EN_NAME_BY_CODE.get(row.store_code);
      if (!storeEnNm) throw new Error(`알 수 없는 store_code(${row.store_code})에 대한 영문 지점명을 찾을 수 없음`);

      const html = await fetchDetailHtml({ storeEnNm, lctrNo: row.source_class_id });
      const classIntro = parseClassIntro(html);

      // [raw_extra 통째로 덮어쓰지 않음] 기존 값(main_image_url 등)에
      // class_intro만 합친다 — 전체 교체하면 목록 배치가 써둔 다른 필드가 사라진다.
      const { error: updateError } = await client
        .from('culture_club_classes')
        .update({
          raw_extra: { ...row.raw_extra, class_intro: classIntro },
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
      console.error(`❌ 스타필드 문화센터 상세정보 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
