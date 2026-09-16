import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { extractGenericPageText } from '@/lib/admin/event-price-candidates';

// [원천 링크 페이지 크롤링/조회](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 3]): 관리자 상세 팝업의 raw_data 뷰어에서 이 아이템의 공식 원천 URL
// (events.source_url/open_spaces.info_url — 어댑터가 raw_data의 ORG_LINK/
// HMPG_ADDR/SVCURL 등을 이미 정규화해 둔 컬럼)을 눌러 그 페이지의 본문을 바로
// 확인할 수 있게 한다. src/app/api/admin/events/price-candidates/route.ts의
// collectOfficialSiteCandidate()와 완전히 같은 목적(공식 홈페이지 크롤링)이라
// extractGenericPageText는 그대로 재사용하고(제5장 제4조), 이 라우트는 "가격
// 후보 4개 중 하나"가 아니라 "본문만 필요한 범용 뷰어"라 별도로 가볍게 둔다 —
// 가격 파싱 등 price-candidates 전용 후속 처리를 붙이지 않는다.
const FETCH_TIMEOUT_MS = 8000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: unknown };
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) return NextResponse.json({ error: 'url이 필요합니다.' }, { status: 400 });

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: '유효한 URL이 아닙니다.' }, { status: 400 });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'http/https URL만 크롤링할 수 있습니다.' }, { status: 400 });
    }

    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } },
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) {
      return NextResponse.json({ error: `페이지를 불러오지 못했습니다 (HTTP ${res.status}).` }, { status: 502 });
    }
    const html = await res.text();
    const text = extractGenericPageText(html);
    if (!text) {
      return NextResponse.json({ error: '이 페이지에서 본문을 추출하지 못했습니다.' }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : '원천 링크 페이지 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
