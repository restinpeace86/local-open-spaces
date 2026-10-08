// [AK플라자 문화아카데미 강좌 소개 텍스트 1회성 수집](2026-10-09 사용자
// 지시: "상세페이지 까지 조사하고나서 제안하는 수집방식으로 해 물론
// 상세페이지 포함해서") — 목록 응답(getPeltList_New)엔 소개 텍스트가
// 없지만, 상세 페이지(/course/detail?store=...&main_cd=...&sSubject_cd=...)
// 의 `#lect_info` 셀에 있다(실측 확인).
//
// [이미지는 상세 페이지에서 가져오지 않음 — 다른 브랜드와 다른 점](실측
// 확인) 상세 페이지의 썸네일 표시 블록은 사이트 자체가 "<!-- 썸네일
// 임시제거 -->" 주석으로 꺼둔 상태라, 상세 페이지 HTML에는 이미지가 전혀
// 없다. 대신 목록 응답(getPeltList_New)의 THUMBNAIL_IMG 필드를 image_dir과
// 조합하면 실제로 살아있는 이미지를 바로 받을 수 있어(akplaza-culture-
// club-parser.mjs의 buildThumbnailUrl), akplaza-culture-club.mjs(목록
// 배치)가 이미 main_image_url을 채워둔다 — 이 스크립트는 소개 텍스트만
// 책임진다.
//
// [세션 불필요 — 신세계 상세 페이지와 동일](실측 확인) 목록 엔드포인트
// (getPeltList_New)와 달리, 상세 페이지는 store/main_cd/sSubject_cd
// 쿼리 파라미터만으로 쿠키 없이도 정상 동작한다(실측: 세션 쿠키 전혀
// 없이 호출해도 200 OK + 정상 콘텐츠).
//
// [원본 스테이징 테이블 없음 — 통합 테이블에 직접 merge](신세계와 동일한
// 설계, toUnifiedAkplazaRow 주석 참고) raw_extra를 통째로 덮어쓰지 않고
// 기존 값에 class_intro만 합쳐서(merge) 쓴다 — akplaza-culture-club.mjs
// (목록 배치)도 매일 돌 때 이 필드를 지우지 않도록 fetchDetailEnrichment
// ByClassId()로 기존 값을 읽어와 합친다(2026-10-07 이마트/롯데마트에서
// 겪은 "이중 쓰기 시 상세정보 유실" 버그와 동일한 함정을 처음부터 피한다).
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';

loadEnv();

const SOURCE_KEY = 'AKPLAZA_CULTURE_CLUB_DETAIL';
const DOMAIN = 'https://culture.akplaza.com';

function buildDetailUrl({ storeCode, mainCd, classId }) {
  const query = new URLSearchParams({ store: storeCode, main_cd: mainCd, sSubject_cd: classId });
  return `${DOMAIN}/course/detail?${query.toString()}`;
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

// "#lect_info" 셀의 텍스트를 가져온다(실측 확인: <td id="lect_info">...</td>,
// &nbsp;/<br/>가 섞여 있어 공백으로 정리한다).
//
// [node-html-parser 대신 정규식 — 실측으로 발견한 라이브러리 문제](2026-10-09)
// 처음엔 신세계 상세수집과 동일하게 node-html-parser의 querySelector('#lect_info')
// 를 썼으나, 실제 운영 데이터로 1회성 수집을 돌려보니 674건 전부 class_intro가
// null로 저장됐다(에러는 없었음 — 조용한 실패). 실측 디버깅 결과 이 페이지의
// <table>/<tr>/<td> 자체가 node-html-parser에 의해 단 하나도 파싱되지 않음을
// 확인했다(root.querySelectorAll('table'/'tr').length가 전부 0 — div/span은
// 정상 파싱됨, table 계열 태그에서만 발생하는 이 라이브러리 고유의 문제로
// 보인다. 신세계 상세 페이지는 table을 안 써서 이 문제를 겪지 않았다).
// 태그 밸런스(open/close 개수)는 정상이라 HTML 자체의 문제가 아니다 — 원인을
// 더 파고들지 않고(제3장 제5조 추측 금지), 이 한 필드만 정규식으로 직접
// 추출해 문제를 회피한다(실측으로 정상 동작 확인).
const LECT_INFO_REGEX = /<td\s+id="lect_info"[^>]*>([\s\S]*?)<\/td>/;

export function parseClassIntro(html) {
  const match = html.match(LECT_INFO_REGEX);
  if (!match) return null;
  const text = match[1]
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

async function fetchDetailHtml({ storeCode, mainCd, classId }) {
  const url = buildDetailUrl({ storeCode, mainCd, classId });
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
      .eq('brand', 'ak_plaza')
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
      description: 'AK플라자 문화아카데미 강좌 소개 텍스트(lect_info) 1회성 수집 — source_class_id당 한 번만',
      period: 'daily',
    });
    if (error) console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ AK플라자 문화아카데미 상세정보(소개 텍스트) 수집 시작 (dry-run: ${dryRun})`);

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
      const mainCd = row.raw_extra?.main_cd;
      if (typeof mainCd !== 'string' || !row.store_code) {
        throw new Error('main_cd/store_code 중 하나가 없어 상세 페이지 URL을 만들 수 없음');
      }

      const html = await fetchDetailHtml({ storeCode: row.store_code, mainCd, classId: row.source_class_id });
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
      console.error(`❌ AK플라자 문화아카데미 상세정보 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
