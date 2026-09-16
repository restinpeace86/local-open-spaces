import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';
import { MYREALTRIP_SORT_OPTIONS } from '@/lib/admin/myrealtrip-search';

// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시) 2단계 API: 키워드
// (+선택적 카테고리/가격/정렬)로 투어·티켓 상품을 검색한다. 페이지네이션은 공식
// 문서 경고대로 1-based(page=1부터)이고 응답 필드는 perPage — 숙소/항공 검색
// (0-based, size)과 다르므로 혼동하지 않는다(이번 범위엔 투어/티켓만 구현).
const MYREALTRIP_API_URL = 'https://partner-ext-api.myrealtrip.com/v1/products/tna/search';
const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function isValidSort(value: unknown): value is (typeof MYREALTRIP_SORT_OPTIONS)[number] {
  return typeof value === 'string' && (MYREALTRIP_SORT_OPTIONS as readonly string[]).includes(value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      keyword?: unknown;
      category?: unknown;
      minPrice?: unknown;
      maxPrice?: unknown;
      sort?: unknown;
      page?: unknown;
      size?: unknown;
    };
    const keyword = typeof body.keyword === 'string' ? body.keyword.trim() : '';
    if (!keyword) return NextResponse.json({ error: '검색 키워드(keyword)가 필요합니다.' }, { status: 400 });

    const apiKey = process.env.MYREALTRIP_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'MYREALTRIP_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });

    const requestBody: Record<string, unknown> = {
      keyword,
      page: typeof body.page === 'number' && body.page > 0 ? body.page : 1,
      size: typeof body.size === 'number' ? Math.min(Math.max(1, body.size), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
    };
    if (typeof body.category === 'string' && body.category.trim()) requestBody.category = body.category.trim();
    if (typeof body.minPrice === 'number') requestBody.minPrice = body.minPrice;
    if (typeof body.maxPrice === 'number') requestBody.maxPrice = body.maxPrice;
    if (isValidSort(body.sort)) requestBody.sort = body.sort;

    const res = await fetchWithTimeout(
      MYREALTRIP_API_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      FETCH_TIMEOUT_MS
    );
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: json.result?.message ?? `마이리얼트립 상품 검색 실패 (HTTP ${res.status})` }, { status: res.status });
    }

    return NextResponse.json({
      items: json.data?.items ?? [],
      totalCount: json.data?.totalCount ?? 0,
      page: json.data?.page ?? requestBody.page,
      perPage: json.data?.perPage ?? requestBody.size,
      hasNextPage: json.data?.hasNextPage ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '마이리얼트립 상품 검색 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
