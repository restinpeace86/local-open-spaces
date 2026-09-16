import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';

// [마이리얼트립 공식 파트너 API 연동](2026-09-16 사용자 지시) 3단계(선택) API:
// "상품리스트 보고.. 상품 상세 들어가서 해당 상품에 대하여 제휴상품으로 등록" —
// 검색 API(title/salePrice/imageUrl)만으로는 실제 소개 문구/포함·불포함 사항을
// 볼 수 없어, 관리자가 등록 전에 상세를 확인할 수 있게 이 프록시를 추가한다.
const MYREALTRIP_API_URL = 'https://partner-ext-api.myrealtrip.com/v1/products/tna/detail';
const FETCH_TIMEOUT_MS = 8000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { gid?: unknown };
    const gid = typeof body.gid === 'string' ? body.gid.trim() : '';
    if (!gid) return NextResponse.json({ error: 'gid가 필요합니다.' }, { status: 400 });

    const apiKey = process.env.MYREALTRIP_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'MYREALTRIP_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });

    const res = await fetchWithTimeout(
      MYREALTRIP_API_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ gid }),
      },
      FETCH_TIMEOUT_MS
    );
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: json.result?.message ?? `마이리얼트립 상품 상세 조회 실패 (HTTP ${res.status})` }, { status: res.status });
    }

    return NextResponse.json({
      gid: json.data?.gid ?? gid,
      title: json.data?.title ?? '',
      description: json.data?.description ?? '',
      reviewScore: json.data?.reviewScore ?? null,
      reviewCount: json.data?.reviewCount ?? null,
      included: json.data?.included ?? [],
      excluded: json.data?.excluded ?? [],
      itineraries: json.data?.itineraries ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '마이리얼트립 상품 상세 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
