import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resizeImageForStorage } from '@/lib/images/resize-for-storage';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import {
  extractNaverPlaceId,
  buildNaverPlaceUrls,
  buildNaverPlaceReviewUrl,
  extractNaverPlaceCrawlResult,
  extractNaverPlaceReviewVoteHints,
  formatMenuText,
} from '@/lib/admin/naver-place-crawler';

// [관리자 페이지 스팟 큐레이션 URL 크롤링 기능](2026-09-18 사용자 지시): "네이버 플레이스
// 주소 입력 → [데이터 가져오기] → 영업시간/메뉴/기본정보/뱃지/대표이미지 자동 채움" —
// 실측 확인(2026-09-18) 결과 pcmap.place.naver.com은 서버 렌더링 페이지라
// window.__APOLLO_STATE__에 필요한 데이터가 전부 정적 HTML 안에 있다(헤드리스 브라우저
// 불필요). 순수 파싱 로직은 src/lib/admin/naver-place-crawler.ts에 두고, 이 라우트는
// 네트워크 호출(HTML 2건 fetch + 대표 이미지 재호스팅)만 담당한다.
const BUCKET = 'spot-curation-images';
const CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15000;
const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// [네이버 429 오진단 방지](2026-09-27 사용자 지시, "똑같이 막혀.. 네이버 플레이스
// 페이지를 가져오지 못했습니다(네트워크 오류 또는 존재하지 않는 장소)"): 실측 확인
// 결과 이 실패는 URL이 잘못됐거나 장소가 없는 게 아니라, 네이버 서버(nfront WAF)가
// 우리 서버 IP를 레이트리밋해서 HTTP 429를 응답하는 것이었다(직접 요청 재현: 이
// 장소 ID와 기존에 정상 동작했던 다른 ID 모두 동일하게 429). 기존 코드는 res.ok가
// 아니면 상태 코드를 버리고 무조건 null만 반환해 "URL이 틀렸다"는 오해를 주는 안내문만
// 나왔다 — 상태 코드를 같이 반환해 429일 때는 정확한 안내(잠시 후 재시도)를 준다
// (제5장 제11조 오류 처리 원칙 — 사용자에게 적절한 안내를 제공).
async function fetchHtmlOrNull(url: string): Promise<{ html: string | null; status: number | null }> {
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': CHROME_USER_AGENT } }, FETCH_TIMEOUT_MS);
    if (!res.ok) return { html: null, status: res.status };
    return { html: await res.text(), status: res.status };
  } catch {
    return { html: null, status: null };
  }
}

// [대표 이미지 재호스팅] 요구사항 원문 "저장할 때 우리 자체 이미지 주소로 변환해야 함" —
// 기존 /api/admin/spot-curations/upload-image와 동일한 버킷/리사이즈 규칙을 그대로
// 따른다(제5장 제4조 기존 구조 우선). 실패해도(네트워크 오류 등) 크롤링 전체를 막지
// 않고 이미지만 비운 채 나머지 데이터는 정상 반환한다(제5장 제11조 오류 처리 원칙).
async function rehostImage(imageUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(imageUrl, {}, FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg';
    const extension = CONTENT_TYPE_EXTENSION[contentType] ?? 'jpg';
    const rawBuffer = Buffer.from(await res.arrayBuffer());
    const buffer = await resizeImageForStorage(rawBuffer, contentType);

    const admin = createAdminClient();
    const path = `${crypto.randomUUID()}.${extension}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
    if (error) {
      console.error('[naver-crawl] rehostImage upload error', error);
      return null;
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('[naver-crawl] rehostImage exception', err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { naverUrl?: string };
    const naverUrl = body.naverUrl?.trim();
    if (!naverUrl) {
      return NextResponse.json({ error: '네이버 플레이스 URL이 필요합니다.' }, { status: 400 });
    }

    const placeId = extractNaverPlaceId(naverUrl);
    if (!placeId) {
      return NextResponse.json(
        { error: 'URL에서 장소 ID를 찾지 못했습니다. 네이버 지도/플레이스 URL이 맞는지 확인해 주세요.' },
        { status: 400 }
      );
    }

    const { homeUrl, menuUrl } = buildNaverPlaceUrls(placeId);
    const reviewUrl = buildNaverPlaceReviewUrl(placeId);
    const [homeResult, menuResult, reviewResult] = await Promise.all([
      fetchHtmlOrNull(homeUrl),
      fetchHtmlOrNull(menuUrl),
      fetchHtmlOrNull(reviewUrl),
    ]);
    const homeHtml = homeResult.html;
    const menuHtml = menuResult.html;
    const reviewHtml = reviewResult.html;

    if (!homeHtml && !menuHtml) {
      // 429는 URL/장소 문제가 아니라 네이버 쪽 레이트리밋이므로 안내문을 구분한다.
      if (homeResult.status === 429 || menuResult.status === 429) {
        return NextResponse.json(
          { error: '네이버 쪽에서 요청이 너무 많다고 응답했습니다(429). URL은 정상이니 잠시 후(수 분 뒤) 다시 시도해 주세요.' },
          { status: 502 }
        );
      }
      return NextResponse.json(
        { error: '네이버 플레이스 페이지를 가져오지 못했습니다(네트워크 오류 또는 존재하지 않는 장소). URL을 다시 확인해 주세요.' },
        { status: 502 }
      );
    }

    const result = extractNaverPlaceCrawlResult(placeId, homeHtml, menuHtml);
    const imageUrl = result.representativeImageUrl ? await rehostImage(result.representativeImageUrl) : null;
    // [찜질방/스파 뱃지 — 네이버 리뷰 투표 근거](2026-09-26 사용자 지시): 리뷰 페이지
    // 조회가 실패해도(느린 응답, 페이지 구조 변경 등) 나머지 크롤링 결과는 그대로
    // 반환한다 — 무중단 원칙(제5장 제11조), extractNaverPlaceReviewVoteHints는
    // html이 null이면 빈 배열을 반환하므로 별도 분기 불필요.
    const badgeVoteHints = extractNaverPlaceReviewVoteHints(reviewHtml);

    return NextResponse.json({
      placeId: result.placeId,
      name: result.name,
      roadAddress: result.roadAddress,
      address: result.address,
      phone: result.phone,
      category: result.category,
      conveniences: result.conveniences,
      businessHoursText: result.businessHoursFreeText,
      // [스팟 큐레이션 요일별 영업시간](2026-09-19 사용자 지시): 요일별 원본 구조
      // (NaverPlaceBusinessHourDay[])도 함께 내려준다 — businessHoursText(사람이
      // 읽는 한 줄 요약)와 별개로, 관리자 화면이 요일별 표를 정확히 채우려면 이
      // 구조화된 데이터가 필요하다(텍스트를 다시 파싱하지 않음, 제5장 제4조).
      businessHourDays: result.businessHourDays,
      menuText: formatMenuText(result.menuItems),
      imageUrl,
      badgeVoteHints,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '네이버 플레이스 크롤링 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
