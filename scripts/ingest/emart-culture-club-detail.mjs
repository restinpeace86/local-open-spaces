// [이마트 컬처클럽 강좌 상세정보 1회성 수집](2026-10-03 사용자 지시): "이마트
// 강좌를 클릭했을때 그 클래스id로 보는 api로 해서 상세페이지도 긁어오자... 상세
// 페이지도 접수마감인거 빼고 배치로 하루에 한번씩 가져오는건?" → (매일 전체
// 6,500건을 다시 긁으면 1초 간격만 줘도 100분 넘게 걸려 부담이라는 지적에)
// "하나의 강좌에 대하여 한번만 상세페이지꺼 가져와서 채우면돼.. 중요한거
// 변해야하고 캐치해야하는게 그 status 이거 하나야" — 상세설명/이미지는 class_id당
// 딱 한 번만 가져오고(정적 콘텐츠), 상태(접수중/정원마감 등)는 이미 매일 도는
// emart-culture-club.mjs(목록 배치)가 계속 갱신하므로 이 스크립트와는 무관하다.
//
// [증분 수집] emart-culture-club.mjs가 먼저 실행되어 class_id들을 채워둔 뒤,
// 이 스크립트가 detail_fetched_at이 null인(아직 상세정보를 시도한 적 없는) 행만
// 골라 classId 단건 조회 API로 채운다. 매일 실행해도 신규 강좌만 대상이 되므로
// 둘째 날부터는 요청량이 크게 줄어든다(첫날만 전체 백필).
//
// [매너 있게 수집](2026-10-03 사용자 지시: "단건조회도... 랜덤으로 좀 변폭을 줘
// 300ms ~ 1s 라던가"): 요청 사이 300ms~1초 랜덤 딜레이.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { applyRandomStartupDelay } from './lib/random-startup-delay.mjs';

const env = loadEnv();
const SOURCE_KEY = 'EMART_CULTURE_CLUB_DETAIL';
const GRAPHQL_URL = 'https://wrihg4edszhmvagptse4t4eggi.appsync-api.ap-northeast-2.amazonaws.com/graphql';
const REQUEST_PACING_MIN_MS = 300;
const REQUEST_PACING_MAX_MS = 1000;
// [랜덤 시작 지연](2026-10-04 사용자 지시) — 일 1회 배치, 넉넉하게 최대 10분.
const MAX_STARTUP_DELAY_MS = 10 * 60 * 1000;
const BROWSER_LIKE_HEADERS = {
  Origin: 'https://www.cultureclub.emart.com',
  Referer: 'https://www.cultureclub.emart.com/enrolment',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
};

// [1,000건 truncation 방지] PostgREST 기본 max-rows(1,000)에 걸려 .limit()을
// 아무리 크게 줘도 조용히 1,000건으로 잘린다(이 프로젝트에서 이미 여러 번
// 실측 확인된 문제, get-nearby.ts의 getSpotsByServiceCategory와 동일한 패턴으로
// .range()로 페이지를 반복 요청해 전체를 모은다) — 그래야 "첫날 전체 백필"이
// 실제로 하루 만에 끝난다.
const PENDING_PAGE_SIZE = 1000;

const QUERY = `query getClassByFiltering($keyword: String, $filterData: [FilterData], $sortKey: String, $from: Int, $size: Int) {
  getClassByFiltering(keyword: $keyword, filterData: $filterData, sortKey: $sortKey, from: $from, size: $size) {
    data {
      classId
      classDetail { classDetailInfo { classDetailInfoTitle classDetailInfoContent } }
      mainImage { bucket region key }
    }
  }
}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomPacingDelay() {
  return REQUEST_PACING_MIN_MS + Math.random() * (REQUEST_PACING_MAX_MS - REQUEST_PACING_MIN_MS);
}

async function fetchDetail(classId) {
  const apiKey = env.EMART_CULTURE_CLUB_API_KEY;
  if (!apiKey) {
    throw new Error('EMART_CULTURE_CLUB_API_KEY 환경변수가 설정되지 않았습니다.');
  }

  const res = await fetchWithTimeout(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, ...BROWSER_LIKE_HEADERS },
    body: JSON.stringify({
      query: QUERY,
      variables: { keyword: '', filterData: [{ type: 'classId', data: [classId] }], sortKey: 'deadline', from: 0, size: 1 },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`이마트 컬처클럽 상세 API 호출 실패 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`이마트 컬처클럽 상세 응답이 JSON이 아닙니다: ${text.slice(0, 300)}`);
  }

  if (json.errors) {
    throw new Error(`이마트 컬처클럽 상세 GraphQL 에러: ${JSON.stringify(json.errors).slice(0, 300)}`);
  }

  return json.data.getClassByFiltering.data[0] ?? null;
}

export function buildDetailUpdate(item) {
  const detailInfo = item?.classDetail?.classDetailInfo;
  const image = item?.mainImage;

  return {
    class_detail_title: detailInfo?.classDetailInfoTitle || null,
    class_detail_content: detailInfo?.classDetailInfoContent || null,
    main_image_bucket: image?.bucket ?? null,
    main_image_region: image?.region ?? null,
    main_image_key: image?.key ?? null,
    detail_fetched_at: new Date().toISOString(),
  };
}

async function fetchAllPendingRows(client) {
  const allRows = [];
  for (let page = 0; ; page += 1) {
    const from = page * PENDING_PAGE_SIZE;
    const { data, error } = await client
      .from('emart_culture_club_classes')
      .select('id, class_id')
      .is('detail_fetched_at', null)
      .range(from, from + PENDING_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`수집 대상 조회 실패: ${error.message}`);
    }

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
      description: '이마트 컬처클럽 강좌 상세정보(설명/이미지) 1회성 수집 — class_id당 한 번만',
      period: 'daily',
    });
    if (error) {
      console.error(`⚠️ pipeline_logs 기록 실패(배치 자체에는 영향 없음): ${error.message}`);
    }
  } catch (err) {
    console.error(`⚠️ pipeline_logs 기록 중 예외(배치 자체에는 영향 없음): ${err.message}`);
  }
}

export async function run({ dryRun = false } = {}) {
  console.log(`▶ 이마트 컬처클럽 상세정보 수집 시작 (dry-run: ${dryRun})`);

  const client = createAdminClient();
  const pendingRows = await fetchAllPendingRows(client);

  console.log(`  → 상세정보 미수집 ${pendingRows.length}건 발견`);

  if (dryRun) {
    return { sourceKey: SOURCE_KEY, count: pendingRows.length, upserted: false };
  }

  let successCount = 0;
  let notFoundCount = 0;
  const errors = [];

  for (const row of pendingRows) {
    try {
      const item = await fetchDetail(row.class_id);
      const update = item
        ? buildDetailUpdate(item)
        : { detail_fetched_at: new Date().toISOString() }; // 강좌가 그 사이 내려갔으면 재시도 방지만 하고 넘어감

      const { error: updateError } = await client
        .from('emart_culture_club_classes')
        .update(update)
        .eq('id', row.id);

      if (updateError) throw new Error(updateError.message);

      if (item) successCount += 1;
      else notFoundCount += 1;
    } catch (err) {
      errors.push({ classId: row.class_id, message: err.message });
      console.error(`⚠️ ${row.class_id} 상세정보 수집 실패(계속 진행): ${err.message}`);
    }

    await sleep(randomPacingDelay());
  }

  console.log(`✅ 상세정보 수집 완료: 성공 ${successCount}건 / 강좌 소실 ${notFoundCount}건 / 실패 ${errors.length}건`);
  await postPipelineLog(client, {
    status: errors.length > 0 && successCount === 0 ? 'FAILED' : 'OK',
    errorMessage: errors.length > 0 ? `${errors.length}건 실패(예: ${errors[0]?.classId})` : null,
    metaData: { pending: pendingRows.length, success: successCount, notFound: notFoundCount, failed: errors.length },
  });

  return { sourceKey: SOURCE_KEY, count: successCount, upserted: true };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry-run');
  applyRandomStartupDelay(MAX_STARTUP_DELAY_MS)
    .then(() => run({ dryRun }))
    .catch((err) => {
      console.error(`❌ 이마트 컬처클럽 상세정보 수집 실패: ${err.message}`);
      process.exit(1);
    });
}
