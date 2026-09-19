// [스팟 큐레이션 온디맨드 재크롤링](2026-09-20 사용자 지시): "지금 생성되는 영업시간이나
// 메뉴라던가.. 1주일이 지나면 다시 수집해줘.. 로봇처럼 크롤링이 아니고.. 사용자가 스팟
// 상세 페이지를 눌렀을 때 혹은 이벤트를 눌렀는데 스팟 연동되어 있었으면.. 데이터 가져온지
// 1주일이 넘었는지 체크하고 넘었으면 다시 크롤링해서 정보 비교하고 달라진 점을 넣도록" —
// spot-notice-radar.ts와 동일한 Cache-Aside 모양(제5장 제4조)이지만, 그쪽은 "오늘(KST)
// 체크했는지" 달력일 기준이고, 이번엔 "최소 7일 경과"(정확한 경과 시간) 기준이라 별도
// 함수로 둔다 — 사용자 확인: "최소 텀이 1주일.. 사용자가 10일 후에 누르면 10일 만에
// 1번 가져오는 것"이라 달력일이 아닌 순수 경과 시간으로 판단해야 한다.
//
// 적용 방식은 관리자의 기존 "⚡ 데이터 가져오기" 버튼과 동일하게 spot_curations에
// 바로 반영한다(사용자 확인, 공지처럼 별도 승인 대기함을 두지 않음). 단, 관리자가
// 이미 수동으로 켜 둔 kids_menu 관련 값을 재크롤링이 되돌리지 않도록, 메뉴 항목별
// is_kids_menu는 "기존 값이 true면 항상 true 유지"(OFF→ON 방향으로만 자동 반영,
// spot-curations-panel.tsx의 handleParseMenu/handleToggleMenuItemKidsMenu와 동일한
// 정책)로 병합한다.
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { buildNaverPlaceUrls, extractNaverPlaceCrawlResult, formatMenuText } from './naver-place-crawler';
import { detectKidsMenuItems, extractRegularWeekdayHours, parseMenuText, parseOperatingHoursText, type ParsedMenuItem } from './spot-curation-parsers';

const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;
const MIN_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 최소 7일 경과(달력일 아님).
const KIDS_MENU_BADGE_KEY = 'kids_menu';

async function fetchHtmlOrNull(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': CHROME_USER_AGENT } }, FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// 이름이 같은 기존 항목의 is_kids_menu가 true면 새로 크롤링한 결과가 false(자동
// 미매칭)여도 되돌리지 않는다 — 관리자가 수동으로 켜 둔 값이었을 수도 있고, 자동으로
// 켜졌던 값이었어도 "OFF→ON 방향으로만 제안" 정책상 자동 재크롤링이 스스로 끄면 안 된다.
function mergeMenuItems(previous: Array<{ name: string; is_kids_menu?: boolean }>, next: ParsedMenuItem[]): ParsedMenuItem[] {
  const previousKidsMenuNames = new Set(previous.filter((item) => item.is_kids_menu).map((item) => item.name));
  return next.map((item) => (previousKidsMenuNames.has(item.name) ? { ...item, is_kids_menu: true } : item));
}

// [실패해도 유저 화면에 영향 없어야 함](제5장 제11조 무중단 원칙, spot-notice-radar.ts와
// 동일한 안전장치): 절대 예외를 던지지 않는다 — 호출부가 fire-and-forget으로 트리거한다.
export async function checkAndRefreshSpotCuration(spotId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: spot, error: spotError } = await admin
      .from('open_spaces')
      .select('naver_place_id')
      .eq('id', spotId)
      .single();
    if (spotError || !spot?.naver_place_id) return; // 네이버 연동 안 된 스팟 — 다시 가져올 원본이 없음.

    const { data: curation, error: curationError } = await admin
      .from('spot_curations')
      .select('id, last_crawled_at, menu_items, curation_badges')
      .eq('spot_id', spotId)
      .maybeSingle();
    if (curationError || !curation) return; // 아직 큐레이션이 없는 스팟 — 새로 만들지 않는다(제3장 임의 판단 금지).

    if (curation.last_crawled_at) {
      const elapsedMs = Date.now() - new Date(curation.last_crawled_at).getTime();
      if (elapsedMs < MIN_REFRESH_INTERVAL_MS) return;
    }

    const { homeUrl, menuUrl } = buildNaverPlaceUrls(spot.naver_place_id);
    const [homeHtml, menuHtml] = await Promise.all([fetchHtmlOrNull(homeUrl), fetchHtmlOrNull(menuUrl)]);
    if (!homeHtml && !menuHtml) return; // 크롤링 실패는 last_crawled_at을 건드리지 않는다 — 다음 방문 때 재시도.

    const result = extractNaverPlaceCrawlResult(spot.naver_place_id, homeHtml, menuHtml);

    const parsedHours = parseOperatingHoursText(result.businessHoursFreeText ?? '');
    const hoursByDay = extractRegularWeekdayHours(result.businessHourDays);
    const menuText = formatMenuText(result.menuItems);
    const previousMenuItems = Array.isArray(curation.menu_items) ? (curation.menu_items as Array<{ name: string; is_kids_menu?: boolean }>) : [];
    const mergedMenuItems = mergeMenuItems(previousMenuItems, detectKidsMenuItems(parseMenuText(menuText)));

    const previousBadges = Array.isArray(curation.curation_badges) ? curation.curation_badges : [];
    const curationBadges = mergedMenuItems.some((item) => item.is_kids_menu) && !previousBadges.includes(KIDS_MENU_BADGE_KEY)
      ? [...previousBadges, KIDS_MENU_BADGE_KEY]
      : previousBadges;

    await admin
      .from('spot_curations')
      .update({
        operating_hours_raw: result.businessHoursFreeText,
        open_time: parsedHours.openTime,
        close_time: parsedHours.closeTime,
        break_start: parsedHours.breakStart,
        break_end: parsedHours.breakEnd,
        last_order: parsedHours.lastOrder,
        operating_hours_by_day: hoursByDay.length > 0 ? hoursByDay : null,
        menu_items: mergedMenuItems,
        curation_badges: curationBadges,
        last_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', curation.id);
  } catch (err) {
    console.error('[spot-curation-refresh] checkAndRefreshSpotCuration 실패', err instanceof Error ? err.message : err);
  }
}
