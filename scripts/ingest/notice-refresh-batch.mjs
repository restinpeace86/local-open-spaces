// [네이버 플레이스 공지 주간 배치](2026-09-25 사용자 지시): "별도로.. 1주일마다 배치로..
// 소식 가져온거에 대하여 1주일이 지났는지 체크하고 1주일이 넘은거에 대하여 주기적으로
// 소식 데이터 가져오는거" — 기존 온디맨드 레이더(checkAndFetchSpotNotices,
// src/lib/admin/spot-notice-radar.ts)는 유저가 스팟 상세를 "오늘" 처음 열 때만 트리거되는
// 방식이라, 사람이 잘 안 보는 스팟은 공지가 오래 갱신되지 않는다. 이 배치는 그와 별개로,
// 트래픽과 무관하게 naver_place_id가 있는 스팟 전체를 주기적으로 훑어 갱신한다(온디맨드
// 로직 자체는 그대로 둔다 — 사용자 지시 "이거 로직은 그대로 두고").
//
// [중분류별 요일 분산 검토 결과](2026-09-25): 검토했으나 보류 — 현재 naver_place_id가
// 채워진 스팟은 250건, 전부 "놀이방식당" 중분류 하나뿐이라(실측 확인) 중분류별로 요일을
// 나눠도 지금은 분산 효과가 없다(중분류가 하나뿐이라 결국 "월요일에 250건 전부"와
// 동일). 나중에 다른 중분류에도 naver_place_id가 널리 채워지면 재검토한다(제5장 제7조 —
// 지금 없는 문제를 미리 풀지 않음).
//
// [요청 간 10초 인터벌](2026-09-25 사용자 지시): "10초의 텀을 두도록 하자 1개 하고
// 다음꺼 하기까지 인터벌을" — 이 세션 중 네이버 플레이스 페이지를 몇 번만 연속 요청해도
// "과도한 접근 요청으로 서비스 이용이 제한되었습니다"(429) 안티봇 차단을 직접 겪은
// 뒤 나온 지시다. 250건 기준 10초 간격이면 전체 약 42분 — 이 배치는 주 1회만 도는
// 것이라 실행 시간 자체는 문제되지 않는다.
import { pathToFileURL } from 'url';
import { loadEnv } from '../lib/load-env.mjs';
import { createAdminClient } from './lib/supabase-admin.mjs';
import { fetchWithTimeout } from './lib/fetch-with-timeout.mjs';
import { buildNaverPlaceFeedUrl, extractNaverPlaceFeedItems } from './lib/naver-place-feed.mjs';

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7일 경과(달력일 아님) — spot-curation-refresh.ts와 동일 기준.
const INTERVAL_MS = 10_000; // 사용자 지시: 스팟 1건 처리 후 다음 건 처리 전 10초 텀.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function refreshOneSpot(admin, spot) {
  const feedUrl = buildNaverPlaceFeedUrl(spot.naver_place_id);
  const res = await fetchWithTimeout(feedUrl, { headers: { 'User-Agent': CHROME_USER_AGENT } }, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    // [무중단 원칙, 제5장 제11조] 조회 실패는 notice_checked_at을 건드리지 않는다 —
    // 다음 주 배치(또는 다음 온디맨드 방문)에서 다시 시도되게 한다.
    return { saved: 0 };
  }

  const html = await res.text();
  const feedItems = extractNaverPlaceFeedItems(html);

  if (feedItems.length > 0) {
    // 이미 스테이징/큐레이션된 건(같은 spot_id + raw_naver_feed_id)은 덮어쓰지 않는다 —
    // 관리자가 가공한 curated_* 값을 재크롤링이 지우는 사고를 막는다(온디맨드 레이더와
    // 동일 정책).
    const { error: upsertError } = await admin.from('spot_notices').upsert(
      feedItems.map((item) => ({
        spot_id: spot.id,
        raw_naver_feed_id: item.naverFeedId,
        raw_title: item.title,
        raw_content: item.content,
        raw_image_url: item.imageUrl,
        raw_category: item.category,
        raw_posted_at: item.postedAt,
      })),
      { onConflict: 'spot_id,raw_naver_feed_id', ignoreDuplicates: true }
    );
    if (upsertError) throw new Error(`spot_notices upsert 실패: ${upsertError.message}`);
  }

  const { error: updateError } = await admin
    .from('open_spaces')
    .update({ notice_checked_at: new Date().toISOString() })
    .eq('id', spot.id);
  if (updateError) throw new Error(`notice_checked_at 갱신 실패: ${updateError.message}`);

  return { saved: feedItems.length };
}

export async function run() {
  const admin = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();

  const { data: spots, error } = await admin
    .from('open_spaces')
    .select('id, naver_place_id')
    .not('naver_place_id', 'is', null)
    .or(`notice_checked_at.is.null,notice_checked_at.lt.${staleBefore}`);
  if (error) throw new Error(`대상 스팟 조회 실패: ${error.message}`);

  let checkedCount = 0;
  let savedNoticeCount = 0;
  let failedCount = 0;

  for (const spot of spots ?? []) {
    try {
      const { saved } = await refreshOneSpot(admin, spot);
      savedNoticeCount += saved;
      checkedCount += 1;
    } catch (err) {
      failedCount += 1;
      console.error(`[NOTICE_REFRESH_BATCH] ${spot.id}(naver_place_id=${spot.naver_place_id}) 실패: ${err.message}`);
    }
    await sleep(INTERVAL_MS);
  }

  console.log(
    `[NOTICE_REFRESH_BATCH] 완료 — 대상 ${spots?.length ?? 0}건 중 체크 ${checkedCount}건, 신규 공지 ${savedNoticeCount}건, 실패 ${failedCount}건`
  );
  return { targetCount: spots?.length ?? 0, checkedCount, savedNoticeCount, failedCount };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  run()
    .then(({ checkedCount, failedCount }) => {
      console.log(`▶▶▶ [NOTICE_REFRESH_BATCH] 종료: 체크 ${checkedCount}건, 실패 ${failedCount}건`);
      process.exitCode = 0;
    })
    .catch((err) => {
      console.error(`❌ [NOTICE_REFRESH_BATCH] 실행 실패: ${err.message}`);
      process.exitCode = 1;
    });
}
