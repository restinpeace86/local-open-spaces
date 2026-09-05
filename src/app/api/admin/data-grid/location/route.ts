import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [지오코딩 실패 행 수동 좌표 입력](2026-09-05 사용자 지시): "지오코딩하지 못하여 위경도
// 좌표가 없는경우는 수동으로 위경도 좌표 돌릴수있도록 관리자 화면의 events쪽에 구현해줘."
// events 탭 전용(요청 범위 그대로 — open_spaces는 대상 아님). category-min/target-audience
// route.ts와 동일한 관례: 관리자가 직접 입력하면 location_precision을 항상 'EXACT'로 바꾼다
// (관리자의 명시적 확인이 자동 지오코딩 결과보다 우선한다는 기존 규약과 동일선상).
//
// 대한민국 바운딩 박스(위도 33~39, 경도 124~132 — 2026-09-05 중복 스팟 탐지 작업에서
// 확립한 것과 동일한 기준)를 벗어나면 저장을 거부한다 — 오탈자로 지구 반대편 좌표가
// 들어가는 사고를 막는다(추측이 아니라 관리자가 직접 입력하는 값이라도 명백한 범위
// 밖은 실수로 간주).
const KOREA_LAT_RANGE = [33, 39] as const;
const KOREA_LNG_RANGE = [124, 132] as const;

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, lat, lng } = body as { id?: unknown; lat?: unknown; lng?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    const latNum = typeof lat === 'number' ? lat : Number(lat);
    const lngNum = typeof lng === 'number' ? lng : Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return NextResponse.json({ error: '위도/경도는 숫자여야 합니다.' }, { status: 400 });
    }
    if (latNum < KOREA_LAT_RANGE[0] || latNum > KOREA_LAT_RANGE[1] || lngNum < KOREA_LNG_RANGE[0] || lngNum > KOREA_LNG_RANGE[1]) {
      return NextResponse.json(
        { error: `대한민국 범위(위도 ${KOREA_LAT_RANGE.join('~')}, 경도 ${KOREA_LNG_RANGE.join('~')})를 벗어난 좌표입니다.` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .update({
        location: `SRID=4326;POINT(${lngNum} ${latNum})`,
        location_precision: 'EXACT',
      })
      .eq('id', id)
      .select('id, location, location_precision')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '좌표 수동 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
