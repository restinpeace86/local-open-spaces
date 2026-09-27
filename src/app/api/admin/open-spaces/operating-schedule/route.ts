import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isNthWeekdayToken, WEEKDAY_CODES } from '@/lib/spaces/event-operating-schedule';

// [open_spaces 정기휴무 설정](2026-09-27 사용자 지시): "이거 이벤트쪽에 있나
// 휴관일이나 정기휴무 설정하는거... 이거 open_spaces쪽에도 놓고.. 정기휴무
// 설정할수있게해야하는거 아니야?" — events의 operating-schedule 라우트와 동일한
// 관례(단일 id PATCH)를 따르되, 사용자가 확정한 범위(정기휴무 요일 + 매월 N번째
// 요일 휴무)만 다룬다. events의 operating_nth_weekdays(운영 패턴, "이 날에만
// 연다")와 반대 극성이라 컬럼명은 excluded_nth_weekdays로 분리했다.
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
      excluded_weekdays: excludedWeekdays,
      excluded_nth_weekdays: excludedNthWeekdays,
    } = body as {
      id?: unknown;
      excluded_weekdays?: unknown;
      excluded_nth_weekdays?: unknown;
    };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    if (excludedWeekdays !== null && excludedWeekdays !== undefined && !isWeekdayCodeArray(excludedWeekdays)) {
      return NextResponse.json(
        { error: `excluded_weekdays는 ${WEEKDAY_CODES.join(', ')} 중의 배열이거나 null이어야 합니다.` },
        { status: 400 }
      );
    }
    if (
      excludedNthWeekdays !== null &&
      excludedNthWeekdays !== undefined &&
      !isNthWeekdayTokenArray(excludedNthWeekdays)
    ) {
      return NextResponse.json(
        { error: `excluded_nth_weekdays는 "N-요일코드"(예: 1-MON) 형식의 배열이거나 null이어야 합니다.` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('open_spaces')
      .update({
        excluded_weekdays: normalizeArray(excludedWeekdays),
        excluded_nth_weekdays: normalizeArray(excludedNthWeekdays),
      })
      .eq('id', id)
      .select('id, excluded_weekdays, excluded_nth_weekdays')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ row: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '정기휴무 설정 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
