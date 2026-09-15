import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { extractBlogBodyText, toMobileNaverBlogUrl } from '@/lib/admin/naver-blog-body';
import { buildSmartBlogQuery, cleanNaverText } from '@/lib/admin/naver-blog-search';
import {
  BlogBodyFetchResult,
  buildBlogCandidate,
  buildDescriptionCandidate,
  buildOfficialSiteCandidate,
  buildRawFieldCandidate,
  extractGenericPageText,
  PriceCandidate,
} from '@/lib/admin/event-price-candidates';

// [이벤트/체험 스팟 다중 소스 가격 수집 및 관리자 검증 UI](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 6]): GET은 4개 소스에서 후보를 즉시 수집해
// 보여주고(저장하지 않음 — 매번 최신 상태를 봐야 하므로), PUT은 관리자가 검토를
// 마친 뒤 최종 확정값(및 그 시점의 후보 스냅샷)을 저장하면서 실제 서비스가 읽는
// events.price_text/is_free도 함께 갱신한다 — 확정 UI가 있어도 events 테이블을
// 갱신하지 않으면 유저 화면에는 아무 효과가 없기 때문이다.
const FETCH_TIMEOUT_MS = 8000;
// [소스1: 검색어 최대 결과 수](2026-09-16 사용자 지적): "적합한 블로그들 최대
// 3개에 대하여 내용들 크롤링" — 검색 결과 최대 3개까지만 본문을 크롤링한다
// (무제한 크롤링으로 인한 지연/비용 방지).
const MAX_BLOG_CRAWL_COUNT = 3;
const NAVER_BLOG_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';

type BlogSearchResultItem = { title: string; link: string; bloggername: string; postdate: string };

// [소스1 독립 검색으로 재변경](2026-09-16 사용자 후속 지시): "어떤 걸로 검색했는지
// 표시해줘.. 정말 맞는 검색어를 던져서 블로그 서치했고 봤는지 확인하게.. 이상한
// 검색어면 수동으로 수정해서 다시 던져보게" — 기존 "🔍 블로그 큐레이션" 모달이
// 미리 선택해 둔 curated_blog_urls에 더 이상 의존하지 않고, 이 화면 자체가 독립
// 적으로 네이버 블로그를 검색한다(blog-search 라우트/llm-verify 라우트와 동일한
// NAVER API HUB 엔드포인트·인증 헤더, 제5장 제4조 기존 구조 우선). 검색어와 검색
// 결과를 응답에 그대로 실어 보내 관리자가 화면에서 확인·수정·재검색할 수 있게 한다.
async function searchBlogs(query: string): Promise<BlogSearchResultItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];
  try {
    const url = `${NAVER_BLOG_SEARCH_URL}?${new URLSearchParams({
      query,
      display: String(MAX_BLOG_CRAWL_COUNT),
      sort: 'date',
    }).toString()}`;
    const res = await fetchWithTimeout(
      url,
      { headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret } },
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: Array<{ title: string; link: string; bloggername: string; postdate: string }> };
    return (json.items ?? []).slice(0, MAX_BLOG_CRAWL_COUNT).map((item) => ({
      title: cleanNaverText(item.title),
      link: item.link,
      bloggername: cleanNaverText(item.bloggername),
      postdate: item.postdate,
    }));
  } catch {
    return [];
  }
}

// [소스1: 블로그 본문 크롤링](2026-09-16 사용자 지적 수정) — naver-blog-body.ts
// (spot-curations/blog-body 라우트가 이미 쓰고 있는 것과 동일한 함수, 제5장
// 제4조 기존 구조 우선)로 네이버 블로그 URL을 모바일 버전으로 바꿔 본문을
// 추출한다. 네이버 블로그가 아니거나 본문을 못 찾으면 bodyText: null로 반환해
// buildBlogCandidate가 다음 URL로 넘어가게 한다(제5장 제11조 — 한 URL 실패가
// 전체를 막지 않음).
async function fetchBlogBody(url: string): Promise<BlogBodyFetchResult> {
  const mobileUrl = toMobileNaverBlogUrl(url);
  if (!mobileUrl) return { url, bodyText: null };
  try {
    const res = await fetchWithTimeout(
      mobileUrl,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) return { url, bodyText: null };
    const html = await res.text();
    return { url, bodyText: extractBlogBodyText(html) };
  } catch {
    return { url, bodyText: null };
  }
}

async function collectOfficialSiteCandidate(sourceUrl: string | null): Promise<PriceCandidate> {
  if (!sourceUrl) {
    return buildOfficialSiteCandidate({ sourceUrl: null, pageText: null });
  }
  try {
    const res = await fetchWithTimeout(
      sourceUrl,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) {
      return buildOfficialSiteCandidate({ sourceUrl, pageText: null, errorMessage: `HTTP ${res.status}` });
    }
    const html = await res.text();
    const pageText = extractGenericPageText(html);
    return buildOfficialSiteCandidate({ sourceUrl, pageText });
  } catch (err) {
    const message = err instanceof Error ? err.message : '크롤링 실패';
    return buildOfficialSiteCandidate({ sourceUrl, pageText: null, errorMessage: message });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('event_id');
    if (!eventId) {
      return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const [{ data: event, error: eventError }, { data: existing, error: existingError }] = await Promise.all([
      admin.from('events').select('title, sigungu_name, description, source_url, raw_data').eq('id', eventId).single(),
      admin.from('event_price_verifications').select('*').eq('event_id', eventId).maybeSingle(),
    ]);
    if (eventError) throw new Error(eventError.message);
    if (existingError) throw new Error(existingError.message);

    // [소스1 검색어](2026-09-16 사용자 후속 지시): 관리자가 ?blog_query=로 직접
    // 수정한 검색어를 우선 쓰고, 없으면 기존 "블로그 큐레이션" 모달과 동일한 기본
    // 검색어 생성 규칙(buildSmartBlogQuery)을 그대로 재사용한다(제5장 제4조).
    const overrideQuery = searchParams.get('blog_query')?.trim();
    const defaultQuery = event?.title ? buildSmartBlogQuery(event.title, event.sigungu_name) : '';
    const blogQuery = overrideQuery || defaultQuery;

    const [blogSearchItems, officialSiteCandidate] = await Promise.all([
      blogQuery ? searchBlogs(blogQuery) : Promise.resolve([]),
      collectOfficialSiteCandidate(event?.source_url ?? null),
    ]);
    const blogResults = await Promise.all(blogSearchItems.map((item) => fetchBlogBody(item.link)));

    const candidates: PriceCandidate[] = [
      buildBlogCandidate(blogResults),
      buildDescriptionCandidate(event?.description),
      officialSiteCandidate,
      buildRawFieldCandidate(event?.raw_data),
    ];

    return NextResponse.json({
      candidates,
      blogSearch: { query: blogQuery, items: blogSearchItems },
      final: existing
        ? {
            final_price_type: existing.final_price_type,
            final_age_text: existing.final_age_text,
            final_price_text: existing.final_price_text,
            admin_note: existing.admin_note,
            confirmed_at: existing.confirmed_at,
          }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '가격 후보 수집 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PRICE_TYPES = ['free', 'paid', 'variable'] as const;

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      event_id?: string;
      candidates?: unknown;
      final_price_type?: unknown;
      final_age_text?: unknown;
      final_price_text?: unknown;
      admin_note?: unknown;
    };
    if (!body.event_id) {
      return NextResponse.json({ error: 'event_id가 필요합니다.' }, { status: 400 });
    }

    const finalPriceType = typeof body.final_price_type === 'string' ? body.final_price_type : null;
    if (finalPriceType !== null && !PRICE_TYPES.includes(finalPriceType as (typeof PRICE_TYPES)[number])) {
      return NextResponse.json({ error: `final_price_type은 ${PRICE_TYPES.join(', ')} 중 하나이거나 비어 있어야 합니다.` }, { status: 400 });
    }

    const finalAgeText = normalizeText(body.final_age_text);
    const finalPriceText = normalizeText(body.final_price_text);
    const adminNote = normalizeText(body.admin_note);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('event_price_verifications')
      .upsert(
        {
          event_id: body.event_id,
          candidates: Array.isArray(body.candidates) ? body.candidates : [],
          final_price_type: finalPriceType,
          final_age_text: finalAgeText,
          final_price_text: finalPriceText,
          admin_note: adminNote,
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: 'event_id' }
      )
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    // [실제 유저 화면에 반영] events.price_text/is_free는 이벤트픽 전역에서 이미
    // 읽고 있는 필드다(get-home-feed.ts 등) — 이 확정 화면이 events 테이블 자체를
    // 갱신하지 않으면 관리자 눈에만 보이고 서비스에는 아무 효과가 없다. is_free는
    // final_price_type을 실제로 선택했을 때만 갱신한다 — 관리자가 유무료 여부를
    // 아직 판단하지 않고 가격 텍스트/메모만 저장한 경우, 기존에 이미 정확할 수
    // 있는 is_free 값(원천 API 등이 채운 값)을 null로 덮어쓰지 않기 위함이다.
    // final_price_type: 'variable'(가격이 있지만 변동)도 "무료가 아님"이므로 is_free=false다.
    const eventUpdates: { price_text: string | null; is_free?: boolean } = { price_text: finalPriceText };
    if (finalPriceType !== null) eventUpdates.is_free = finalPriceType === 'free';
    const { error: eventUpdateError } = await admin.from('events').update(eventUpdates).eq('id', body.event_id);
    if (eventUpdateError) throw new Error(eventUpdateError.message);

    return NextResponse.json({ item: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '가격 확정 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
