import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isNthWeekdayToken, WEEKDAY_CODES } from '@/lib/spaces/event-operating-schedule';

// [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자
// 지시): "상세팝업에서.. 예외 규칙을 여기서 집어넣으면 해당 예외 규칙도 적용되도록"
// — start_date~end_date(원본 기간)는 그대로 두고, 그 안에서 실제 운영 요일/휴무
// 요일을 관리자가 지정한다. CategoryMinEditor/TargetAudienceEditor와 동일한
// 관례(단일 id PATCH, table 구분 없음 — 이 세 컬럼은 events 전용).
// [매월 N번째 요일 패턴 추가](2026-09-12 사용자 지시): "매주 토요일 / 매월 2번째
// 4번째 토요일 / 매주 주말 / 매주 월요일 휴무 / 매주 화,목 운영 이런식의 패턴이야
// 대부분" — operating_nth_weekdays("2-SAT" 형식 토큰 배열)를 추가로 받는다.
function isWeekdayCodeArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && (WEEKDAY_CODES as readonly string[]).includes(v));
}

function isNthWeekdayTokenArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNthWeekdayToken);
}

function normalizeArray(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0) return null;
  return value;
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      operating_weekdays: operatingWeekdays,
      excluded_weekdays: excludedWeekdays,
      operating_nth_weekdays: operatingNthWeekdays,
    } = body as {
      id?: unknown;
      operating_weekdays?: unknown;
      excluded_weekdays?: unknown;
      operating_nth_weekdays?: unknown;
    };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    if (operatingWeekdays !== null && operatingWeekdays !== undefined && !isWeekdayCodeArray(operatingWeekdays)) {
      return NextResponse.json(
        { error: `operating_weekdays는 ${WEEKDAY_CODES.join(', ')} 중의 배열이거나 null이어야 합니다.` },
        { status: 400 }
      );
    }
    if (excludedWeekdays !== null && excludedWeekdays !== undefined && !isWeekdayCodeArray(excludedWeekdays)) {
      return NextResponse.json(
        { error: `excluded_weekdays는 ${WEEKDAY_CODES.join(', ')} 중의 배열이거나 null이어야 합니다.` },
        { status: 400 }
      );
    }
    if (
      operatingNthWeekdays !== null &&
      operatingNthWeekdays !== undefined &&
      !isNthWeekdayTokenArray(operatingNthWeekdays)
    ) {
      return NextResponse.json(
        { error: `operating_nth_weekdays는 "N-요일코드"(예: 2-SAT) 형식의 배열이거나 null이어야 합니다.` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('events')
      .update({
        operating_weekdays: normalizeArray(operatingWeekdays),
        excluded_weekdays: normalizeArray(excludedWeekdays),
        operating_nth_weekdays: normalizeArray(operatingNthWeekdays),
      })
      .eq('id', id)
      .select('id, operating_weekdays, excluded_weekdays, operating_nth_weekdays')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '운영 요일/반복 규칙 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
