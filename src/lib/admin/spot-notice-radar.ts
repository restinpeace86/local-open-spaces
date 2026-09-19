// [네이버 플레이스 공지 온디맨드 레이더](2026-09-19 사용자 지시): "유저가 스팟 상세
// 페이지뿐만 아니라 이벤트 상세 페이지 및 제휴 상품 상세 페이지에서도 연동된 스팟의
// 최신 상태를 동일하게 체크할 수 있도록.. 시스템이 해당 스팟의 last_checked_date를
// 확인하여 오늘 날짜로 체크된 적이 없다면.. 네이버 플레이스 공지란을 확인" — 3개
// 진입점(DetailModal의 SPACE/EVENT 분기, CuratedItemDetailModal)이 전부 이 함수
// 하나를 그대로 호출한다(제5장 제4조 기존 구조 우선 — 진입점마다 로직을 복제하지
// 않음). 기존 blog-review 캐시(src/app/api/spot-blog-reviews/route.ts, 10일 롤링
// TTL)와 같은 Cache-Aside 모양이지만, 이번엔 요청 원문 그대로 "오늘(KST) 체크했는지"
// 달력일 기준으로 판단한다.
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { todayKstDateString } from './kst-date-range';
import { buildNaverPlaceFeedUrl, extractNaverPlaceFeedItems } from './naver-place-crawler';

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;

// [실패해도 유저 화면에 영향 없어야 함](제5장 제11조 무중단 원칙, blog-review route와
// 동일한 안전장치): 이 함수는 절대 예외를 던지지 않는다 — 호출부(API 라우트)가
// await 없이 fire-and-forget으로 트리거하므로, 여기서 던진 예외는 처리할 곳이 없어
// unhandled rejection으로 새는 것을 막기 위함이기도 하다.
export async function checkAndFetchSpotNotices(spotId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: spot, error: spotError } = await admin
      .from('open_spaces')
      .select('naver_place_id, notice_checked_at')
      .eq('id', spotId)
      .single();
    if (spotError || !spot?.naver_place_id) return; // 네이버 연동 안 된 스팟 — 볼 게 없음.

    // "오늘 날짜로 체크된 적이 없다면"(요청 원문) — KST 달력일 기준, 10일 롤링 TTL인
    // blog-review 캐시와 의도적으로 다른 규칙이다.
    if (spot.notice_checked_at && todayKstDateString(new Date(spot.notice_checked_at)) === todayKstDateString()) {
      return;
    }

    const feedUrl = buildNaverPlaceFeedUrl(spot.naver_place_id);
    const res = await fetchWithTimeout(feedUrl, { headers: { 'User-Agent': CHROME_USER_AGENT } }, FETCH_TIMEOUT_MS);
    if (!res.ok) return; // [blog-review 캐시와 동일한 안전장치] 조회 실패는 오늘의 TTL을
    // 소모하지 않는다 — notice_checked_at을 건드리지 않아야 다음 방문 때 다시 시도된다.

    const html = await res.text();
    const feedItems = extractNaverPlaceFeedItems(html);

    if (feedItems.length > 0) {
      // 이미 스테이징/큐레이션된 건(같은 spot_id + raw_naver_feed_id) 절대 덮어쓰지
      // 않는다 — 관리자가 가공한 curated_* 값을 재크롤링이 지우는 사고를 막는다.
      const { error: upsertError } = await admin
        .from('spot_notices')
        .upsert(
          feedItems.map((item) => ({
            spot_id: spotId,
            raw_naver_feed_id: item.naverFeedId,
            raw_title: item.title,
            raw_content: item.content,
            raw_image_url: item.imageUrl,
            raw_category: item.category,
            raw_posted_at: item.postedAt,
          })),
          { onConflict: 'spot_id,raw_naver_feed_id', ignoreDuplicates: true }
        );
      if (upsertError) {
        console.error('[spot-notice-radar] spot_notices upsert 실패', upsertError.message);
        return; // 저장 실패 시 notice_checked_at도 갱신하지 않는다 — 다음 트리거에서 재시도되게.
      }
    }

    await admin.from('open_spaces').update({ notice_checked_at: new Date().toISOString() }).eq('id', spotId);
  } catch (err) {
    console.error('[spot-notice-radar] checkAndFetchSpotNotices 실패', err instanceof Error ? err.message : err);
  }
}
