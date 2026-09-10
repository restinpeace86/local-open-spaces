import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [미등록 장소 선택 시 예외 처리 (Auto-Upsert)](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항5): "유저가 외부 지도 API 결과에서 원하는 장소를
// 탭하는 순간, 해당 장소의 기본 정보(상호명, 주소, 좌표 등)가 우리 DB에 자동으로
// 안전하게 복사(Upsert)되어 스팟으로 등록. 등록과 동시에 해당 스팟이 선택된
// 상태로 다음 글쓰기 단계로 진입."
//
// open_spaces.external_id가 UNIQUE라 같은 카카오 장소를 두 번 눌러도 한 건만
// 남는다(이미 있으면 그 행을 그대로 돌려준다). RLS가 걸려 있어 service_role로
// 쓴다(다른 관리자 쓰기 엔드포인트와 동일 패턴).
const EXTERNAL_ID_PREFIX = 'KAKAO_LOCAL_';

function isInKorea(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const address = typeof body.address === 'string' ? body.address.trim() : '';
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    // 외부 검색(카카오 로컬)을 거쳐 나온 장소만 허용한다 — 임의 좌표/이름 주입 방지.
    if (!externalId.startsWith(EXTERNAL_ID_PREFIX) || !name || !address) {
      return NextResponse.json({ error: '유효한 외부 장소 정보가 아닙니다.' }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInKorea(lat, lng)) {
      return NextResponse.json({ error: '좌표가 유효하지 않습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    // 이미 등록돼 있으면 그대로 돌려준다.
    const { data: existing } = await admin
      .from('open_spaces')
      .select('id, name, address')
      .eq('external_id', externalId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ item: existing, created: false });
    }

    const { data, error } = await admin
      .from('open_spaces')
      .insert({
        external_id: externalId,
        source_type: 'USER_SUBMITTED',
        source: 'USER_SUBMITTED',
        name,
        // 사용자가 검색으로 찾은 신규 장소라 노출 중분류/표준 중분류는 아직 없다.
        category: 'ETC',
        address,
        location: `SRID=4326;POINT(${lng} ${lat})`,
        location_precision: 'EXACT',
      })
      .select('id, name, address')
      .single();

    if (error) {
      // 동시 클릭 등으로 UNIQUE 충돌이 나면 방금 들어간 행을 다시 읽어 돌려준다.
      if (error.code === '23505') {
        const { data: raced } = await admin
          .from('open_spaces')
          .select('id, name, address')
          .eq('external_id', externalId)
          .maybeSingle();
        if (raced) return NextResponse.json({ item: raced, created: false });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data, created: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '스팟 등록 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
