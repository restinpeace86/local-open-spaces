import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout';

// [스팟 상세 → 마이리얼트립 자동 매칭](2026-09-16 사용자 지시): "스팟 상세에서
// 누르면.. 내부적으로 마이리얼트립에서 검색.. 동적 버튼.. 관리자가 승인을 한 번
// 거치기" — 관리자가 검색 결과 중 정확히 이 스팟에 해당하는 상품을 골라 승인하면
// 그 시점에 마이링크(추적 링크)를 한 번만 생성해 저장한다. 유저 화면은 이 저장된
// 결과만 읽어(실시간 검색/마이링크 생성 없음) 검색 API 분당 한도(200건)를 실제
// 트래픽에서 소모하지 않는다.
const MYREALTRIP_MYLINK_URL = 'https://partner-ext-api.myrealtrip.com/v1/mylink';
const FETCH_TIMEOUT_MS = 8000;

export async function GET(request: NextRequest) {
  try {
    const spotId = new URL(request.url).searchParams.get('spot_id');
    if (!spotId) return NextResponse.json({ error: 'spot_id가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_myrealtrip_links')
      .select('gid, item_name, image_url, price_display, product_url, mylink, approved_at')
      .eq('spot_id', spotId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({ link: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '매칭 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      spot_id?: unknown;
      gid?: unknown;
      item_name?: unknown;
      image_url?: unknown;
      price_display?: unknown;
      product_url?: unknown;
    };
    const spotId = typeof body.spot_id === 'string' ? body.spot_id : '';
    const gid = typeof body.gid === 'string' ? body.gid : '';
    const itemName = typeof body.item_name === 'string' ? body.item_name : '';
    const productUrl = typeof body.product_url === 'string' ? body.product_url : '';
    if (!spotId || !gid || !itemName || !productUrl) {
      return NextResponse.json({ error: 'spot_id/gid/item_name/product_url이 모두 필요합니다.' }, { status: 400 });
    }

    const apiKey = process.env.MYREALTRIP_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'MYREALTRIP_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 });

    // [승인 시점에 마이링크 1회 생성](2026-09-16): 이후 유저 클릭마다 새로 만들지
    // 않고 이 저장된 값을 그대로 재사용한다.
    const mylinkRes = await fetchWithTimeout(
      MYREALTRIP_MYLINK_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: productUrl }),
      },
      FETCH_TIMEOUT_MS
    );
    const mylinkJson = await mylinkRes.json();
    if (!mylinkRes.ok || !mylinkJson.data?.mylink) {
      return NextResponse.json({ error: mylinkJson.result?.message ?? '마이링크 생성에 실패했습니다.' }, { status: 502 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('spot_myrealtrip_links')
      .upsert(
        {
          spot_id: spotId,
          gid,
          item_name: itemName,
          image_url: typeof body.image_url === 'string' ? body.image_url : null,
          price_display: typeof body.price_display === 'string' ? body.price_display : null,
          product_url: productUrl,
          mylink: mylinkJson.data.mylink,
          approved_at: new Date().toISOString(),
        },
        { onConflict: 'spot_id' }
      )
      .select('gid, item_name, image_url, price_display, product_url, mylink, approved_at')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ link: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '매칭 승인 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const spotId = new URL(request.url).searchParams.get('spot_id');
    if (!spotId) return NextResponse.json({ error: 'spot_id가 필요합니다.' }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin.from('spot_myrealtrip_links').delete().eq('spot_id', spotId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '매칭 해제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
