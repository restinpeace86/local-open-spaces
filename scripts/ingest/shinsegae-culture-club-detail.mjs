// [신세계 아카데미 강좌 상세정보 1회성 수집](2026-10-08 사용자 지시): "현재
// 접수중인거 강의 상세내용도 긁어오는거지? 그리고 이미지도 마찬가지고?" —
// 목록 응답(getLectList.do)엔 이미지/상세소개가 전혀 없지만(실측 확인),
// 상세 페이지(HP0010P1.do — 외부 신청 딥링크로 이미 확정된 그 URL)엔 둘 다
// 있다. 다른 브랜드(이마트/롯데마트)와 동일한 설계: 목록 배치가 먼저
// class_id들을 채워둔 뒤, 이 스크립트가 detail_fetched_at이 null인(아직
// 상세정보를 시도한 적 없는) 행만 골라 class_id당 딱 한 번만 채운다.
//
// [원본 스테이징 테이블 없음 — 통합 테이블에 직접 merge](2026-10-08) 신세계는
// 애초에 별도 raw 테이블 없이 culture_club_classes에 직접 쓰는 구조라
// (toUnifiedShinsegaeRow 주석 참고), 이 스크립트도 raw_extra를 통째로
// 덮어쓰지 않고 기존 값에 main_image_url/class_intro만 합쳐서(merge) 쓴다
// — shinsegae-culture-club.mjs(목록 배치)도 매일 돌 때 이 필드를 지우지
// 않도록 fetchDetailEnrichmentByClassId()로 기존 값을 읽어와 합친다
// (2026-10-07 이마트/롯데마트에서 겪은 "이중 쓰기 시 상세정보 유실" 버그와
// 동일한 함정을 처음부터 피한다).
//
// [실측 확인 — 상세 페이지 구조] `<div class="slider-for"><img src="...">`
// 에 메인 이미지(상대경로, 도메인 접두 필요)가 있고, `<h3>강좌소개</h3>`
// 바로 다음 `<ul>` 안의 `<p>`에 소개 텍스트가 있다.
import { pathToFileURL } from 'url';
import { parse } from 'node-html-parser';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';

loadEnv();

const SOURCE_KEY = 'SHINSEGAE_CULTURE_CLUB_DETAIL';
const DOMAIN = 'https://sacademy.shinsegae.com';
// [상세 페이지 URL — 프론트엔드 buildShinsegaeDetailUrl()과 동일한 형태를
// 여기서도 그대로 만든다](2026-10-08 사용자 제공 URL로 확정) — 수집 스크립트
// (Node 측)와 화면의 외부 링크 빌더(브라우저 측, culture-club-options.ts)는
// 런타임이 달라 공유 모듈로 묶지 않고 각자 둔다(롯데마트 상세수집 스크립트도
// 동일하게 자체 URL을 inline으로 만든다 — 제5장 제4조 기존 구조 그대로 따름).
function buildDetailUrl({ yearCode, semesterCode, storeCode, classId }) {
  const query = new URLSearchParams({ yearCode, smstCode: semesterCode, storeCode, lectCode: classId });
  return `${DOMAIN}/sdotcom/web/HP0010P0/HP0010P1.do?${query.toString()}`;
}
const REQUEST_PACING_MIN_MS = 300;
const REQUEST_PACING_MAX_MS = 1000;
// [랜덤 시작 지연](2026-10-04 다른 상세 스크립트와 동일한 관례) — 하루 1회
// 배치, 넉넉하게 최대 10분.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const PENDING_PAGE_SIZE = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

// 목록 "비슷한 강좌" 등 다른 이미지와 섞이지 않도록 ".slider-for" 컨테이너로
// 범위를 좁힌다(롯데마트의 ".lct-visual"과 동일한 이유). 경로가 상대경로라
// 도메인만 붙인다 — 실측상 중간에 "//"가 겹치는 경로도 있지만(서버가
// 정규화해 그대로 200을 반환함을 실측 확인) 임의로 고치지 않고 원본
// 그대로 둔다(제3장 제5조).
export function parseMainImageUrl(html) {
  const root = parse(html);
  const src = root.querySelector('.slider-for img')?.getAttribute('src');
  return src ? `${DOMAIN}${src}` : null;
}

// "강좌소개" <h3> 바로 다음 형제 <ul> 안의 <p> 텍스트를 가져온다.
export function parseClassIntro(html) {
  const root = parse(html);
  const headings = root.querySelectorAll('h3');
  const introHeading = headings.find((h) => h.text.trim() === '강좌소개');
  const p = introHeading?.nextElementSibling?.querySelector('p');
  return p ? p.text.replace(/\s+/g, ' ').trim() || null : null;
}

async function fetchDetailHtml({ yearCode, semesterCode, storeCode, classId }) {
  const url = buildDetailUrl({ yearCode, semesterCode, storeCode, classId });
  const res = await fetchWithTimeout(url, {
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
  for (let from = 0; ; from += PENDING_PAGE_SIZE) {
    const { data, error } = await client
      .from('culture_club_classes')
      .select('id, source_class_id, store_code, raw_extra')
      .eq('brand', 'shinsegae')
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
      description: '신세계 아카데미 문화센터 강좌 상세정보(이미지/소개) 1회성 수집 — source_class_id당 한 번만',
      period: 'daily',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 신세계 아카데미 문화센터 상세정보 수집 시작 (dry-run: ${dryRun})`);

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
      const yearCode = row.raw_extra?.year_code;
      const semesterCode = row.raw_extra?.semester_code;
      if (typeof yearCode !== 'string' || typeof semesterCode !== 'string' || !row.store_code) {
        throw new Error('yearCode/semesterCode/storeCode 중 하나가 없어 상세 페이지 URL을 만들 수 없음');
      }

      const html = await fetchDetailHtml({ yearCode, semesterCode, storeCode: row.store_code, classId: row.source_class_id });
      const mainImageUrl = parseMainImageUrl(html);
      const classIntro = parseClassIntro(html);

      // [raw_extra 통째로 덮어쓰지 않음] 기존 값(target_code 등)에 이미지/
      // 소개만 합친다 — 전체 교체하면 목록 배치가 써둔 다른 필드가 사라진다.
      const { error: updateError } = await client
        .from('culture_club_classes')
        .update({
          raw_extra: { ...row.raw_extra, main_image_url: mainImageUrl, class_intro: classIntro },
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
      console.error(`❌ 신세계 아카데미 문화센터 상세정보 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
