import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';

// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시): "공식적인 API를 통하여
// 데이터 가져오는 방법 확인해보자" — MYREALTRIP_API_KEY를 클라이언트에 노출하지
// 않기 위한 서버 전용 프록시(NAVER_CLIENT_SECRET을 다루는 blog-search 라우트와
// 동일한 이유). 1단계(선택) API: 도시별 카테고리 목록(값은 도시마다 달라 반드시
// 이 호출로 얻은 value를 그대로 검색 API에 넘겨야 한다 — 실측으로 서울/부산/제주
// 카테고리 구성이 서로 다름을 확인).
const MYREALTRIP_API_URL = 'https://partner-ext-api.myrealtrip.com/v1/products/tna/categories';
const FETCH_TIMEOUT_MS = 8000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { city?: unknown };
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    if (!city) return NextResponse.json({ error: 'city가 필요합니다.' }, { status: 400 });

    const apiKey = process.env.MYREALTRIP_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'MYREALTRIP_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });

    const res = await fetchWithTimeout(
      MYREALTRIP_API_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ city }),
      },
      FETCH_TIMEOUT_MS
    );
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: json.result?.message ?? `마이리얼트립 카테고리 조회 실패 (HTTP ${res.status})` }, { status: res.status });
    }

    return NextResponse.json({ categories: json.data?.categories ?? [], totalCount: json.data?.totalCount ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : '마이리얼트립 카테고리 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
