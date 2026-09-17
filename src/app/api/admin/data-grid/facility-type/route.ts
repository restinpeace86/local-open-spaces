import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [실내/야외 분류 LLM 파이프라인](2026-09-17 사용자 지시): 이벤트 상세 팝업에서
// 관리자가 facility_type을 직접 선택(또는 LLM 제안을 확인 후 적용)해 저장한다.
// target-audience/route.ts와 동일한 관례 — facility_type은 events/open_spaces
// 둘 다 있는 컬럼이지만, 이 편집 UI는 이벤트 상세 팝업(events) 전용이라 table
// 파라미터를 받지 않는다(open_spaces 쪽은 요청 범위 밖 — 제5장 제7조).
// [실측 확인] events.facility_type은 NOT NULL, 기본값 '복합'(실측: 전체 28,948건
// 중 22,118건이 이 기본값에 그대로 머물러 있음 — 실제로 분류된 게 아니라 ETL이
// 판단하지 못해 기본값을 둔 것과 사실상 동일). 그래서 새 값을 '실내외 복합' 같은
// 임의 문자열로 만들지 않고 이미 쓰이고 있는 세 값 '실내'/'야외'/'복합'을 그대로
// 쓴다 — LLM의 BOTH(복합 시설) 판정이 이 기존 기본값과 같은 문자열로 저장되는
// 셈이지만, 이제는 "판단 못 해서 기본값"이 아니라 "LLM이 실제로 복합 시설이라고
// 판단"한 결과라는 차이가 있다. UNKNOWN(판단 불가)은 저장할 대응값이 없어 이
// 라우트로 적용하지 않는다(관리자 화면에서 안내만 하고 저장 버튼을 노출하지
// 않음).
const FACILITY_TYPE_VALUES = ['실내', '야외', '복합'];

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, facility_type: facilityType } = body as { id?: unknown; facility_type?: unknown };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    // facility_type은 NOT NULL 컬럼이라(기본값 '복합') target_audience처럼 null로
    // 지울 수 없다 — 항상 세 값 중 하나를 명시해야 한다.
    const nextFacilityType = typeof facilityType === 'string' ? facilityType.trim() : '';
    if (!FACILITY_TYPE_VALUES.includes(nextFacilityType)) {
      return NextResponse.json({ error: `facility_type은 다음 중 하나여야 합니다: ${FACILITY_TYPE_VALUES.join(', ')}` }, { status: 400 });
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
