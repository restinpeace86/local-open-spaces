import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { extractBlogBodyText, toMobileNaverBlogUrl } from '@/lib/admin/naver-blog-body';
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
// [소스1 실측 버그 수정](2026-09-16 사용자 지적): "적합한 블로그들 최대 3개에
// 대하여 내용들 크롤링" — curated_blog_urls에 여러 개가 있어도 최대 3개까지만
// 본문을 크롤링한다(무제한 크롤링으로 인한 지연/비용 방지).
const MAX_BLOG_CRAWL_COUNT = 3;

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
      admin.from('events').select('description, source_url, curated_blog_urls, raw_data').eq('id', eventId).single(),
      admin.from('event_price_verifications').select('*').eq('event_id', eventId).maybeSingle(),
    ]);
    if (eventError) throw new Error(eventError.message);
    if (existingError) throw new Error(existingError.message);

    const blogUrls = (event?.curated_blog_urls ?? []).slice(0, MAX_BLOG_CRAWL_COUNT);
    const [blogResults, officialSiteCandidate] = await Promise.all([
      Promise.all(blogUrls.map(fetchBlogBody)),
      collectOfficialSiteCandidate(event?.source_url ?? null),
    ]);

    const candidates: PriceCandidate[] = [
      buildBlogCandidate(blogResults),
      buildDescriptionCandidate(event?.description),
      officialSiteCandidate,
      buildRawFieldCandidate(event?.raw_data),
    ];

    return NextResponse.json({
      candidates,
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
