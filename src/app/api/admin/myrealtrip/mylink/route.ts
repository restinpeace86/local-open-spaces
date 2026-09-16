import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';

// [마이리얼트립 마이링크(제휴 추적 링크) 생성](2026-09-16 사용자 지시): "그냥
// productUrl을 booking_url에 넣으면 클릭이 추적/정산되지 않는다" — 원본 URL을
// 이 API로 변환해 mylink_id/t_scope/utm_source가 자동으로 붙는 myrealt.rip
// 단축 링크를 받는다(실측 확인: 301로 .../bridge/marketing?return_url=...
// mylink_id=...&t_scope=604800&utm_source=mktpartner로 정상 연결됨).
const MYREALTRIP_API_URL = 'https://partner-ext-api.myrealtrip.com/v1/mylink';
const FETCH_TIMEOUT_MS = 8000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { targetUrl?: unknown };
    const targetUrl = typeof body.targetUrl === 'string' ? body.targetUrl.trim() : '';
    if (!targetUrl) return NextResponse.json({ error: 'targetUrl이 필요합니다.' }, { status: 400 });

    const apiKey = process.env.MYREALTRIP_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'MYREALTRIP_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });

    const res = await fetchWithTimeout(
      MYREALTRIP_API_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl }),
      },
      FETCH_TIMEOUT_MS
    );
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: json.result?.message ?? `마이링크 생성 실패 (HTTP ${res.status})` }, { status: res.status });
    }
    if (!json.data?.mylink) {
      return NextResponse.json({ error: '마이링크 생성 응답에 mylink가 없습니다.' }, { status: 502 });
    }

    return NextResponse.json({ mylink: json.data.mylink, mylinkId: json.data.mylinkId });
  } catch (err) {
    const message = err instanceof Error ? err.message : '마이링크 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
