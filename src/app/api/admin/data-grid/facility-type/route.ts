import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [실내/야외 분류 LLM 파이프라인](2026-09-17 사용자 지시): 이벤트 상세 팝업에서
// 관리자가 facility_type을 직접 선택(또는 LLM 제안을 확인 후 적용)해 저장한다.
// target-audience/route.ts와 동일한 관례 — facility_type은 events/open_spaces
// 둘 다 있는 컬럼이지만, 이 편집 UI는 이벤트 상세 팝업(events) 전용이라 table
// 파라미터를 받지 않는다(open_spaces 쪽은 요청 범위 밖 — 제5장 제7조).
// [facility_type 기본값 결함 수정](2026-09-19 사용자 지시): "default를 복합으로
// 한게 잘못된거야.. unknown 혹은 null로 놔야돼". 이전엔 events.facility_type이
// NOT NULL DEFAULT '복합'라 "실제로 실내외 둘 다 확인된 복합"과 "애초에 판별한
// 적 없음"을 구분할 수 없었다(실측 2026-09-17: 28,948건 중 22,118건이 이 결함으로
// 미판별 방치). 이제 컬럼이 nullable로 바뀌었으므로(scripts/migrations/2026-09-19-
// facility-type-nullable-remove-default.sql), '실내'/'야외'/'복합' 확정값 외에
// null(미판별로 되돌리기)도 명시적으로 허용한다.
const FACILITY_TYPE_VALUES = ['실내', '야외', '복합'];

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, facility_type: facilityType } = body as { id?: unknown; facility_type?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    // null(또는 빈 문자열)이면 "미판별"로 되돌린다 — 그 외에는 확정값 세 개 중
    // 하나여야 한다(추측 금지 — 다른 임의 문자열은 받지 않음).
    const nextFacilityType =
      facilityType === null || facilityType === undefined || facilityType === ''
        ? null
        : typeof facilityType === 'string'
          ? facilityType.trim()
          : undefined;
    if (nextFacilityType !== null && !FACILITY_TYPE_VALUES.includes(nextFacilityType ?? '')) {
      return NextResponse.json(
        { error: `facility_type은 다음 중 하나이거나 null(미판별)이어야 합니다: ${FACILITY_TYPE_VALUES.join(', ')}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .update({ facility_type: nextFacilityType })
      .eq('id', id)
      .select('id, facility_type')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '실내/야외 수동 수정 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
