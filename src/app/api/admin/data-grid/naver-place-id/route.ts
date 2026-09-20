import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [스팟 큐레이션 네이버 플레이스 ID 저장](2026-09-19 사용자 지시 최초 도입,
// 2026-09-20 실제 저장 경로 완성): open_spaces.naver_place_id(text, unique, nullable —
// scripts/migrations/2026-09-19-add-naver-place-id-to-open-spaces.sql)는 컬럼만
// 먼저 추가되고 딸부자 닭갈비 1건만 수동으로 백필돼 있었을 뿐, 스팟 큐레이션
// 크롤링(⚡ 데이터 가져오기)이 매번 URL에서 뽑아내는 placeId를 실제로 저장하는
// 경로가 없었다("스팟큐레이션에서 노출이름 편백회관 시흥장곡점으로 수정되었는데..
// 창닫고 다시열어도" 제보를 조사하며 함께 확인). display-name route와 동일한
// "필드 하나당 라우트 하나" 관례를 따른다.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, naver_place_id: naverPlaceId } = body as { id?: unknown; naver_place_id?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    const nextNaverPlaceId = typeof naverPlaceId === 'string' && naverPlaceId.trim() ? naverPlaceId.trim() : null;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('open_spaces')
      .update({ naver_place_id: nextNaverPlaceId })
      .eq('id', id)
      .select('id, naver_place_id')
      .single();

    if (error) {
      // naver_place_id는 unique 제약이 있다 — 같은 네이버 플레이스를 실수로 다른
      // 스팟에 또 연동하려 하면 이 경로로 걸러진다(추측으로 조용히 덮어쓰지 않음).
      if (error.code === '23505') {
        return NextResponse.json(
          { error: '이 네이버 플레이스는 이미 다른 스팟에 연동되어 있습니다.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '네이버 플레이스 ID 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
