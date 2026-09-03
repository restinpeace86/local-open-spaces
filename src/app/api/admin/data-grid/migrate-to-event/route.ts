import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';
import { EVENT_PICK_TARGET_AUDIENCES } from '@/lib/home/get-home-feed';

// [todo.md 개선사항 5](2026-09-03): 어드민이 스팟픽(open_spaces)에 잘못 분류돼 있던 데이터를
// 이벤트픽(events) 테이블로 옮기는 마이그레이션. events.external_id/title/event_type/
// start_date/end_date는 전부 NOT NULL이고(실측 확인 — information_schema.columns) 그중
// start_date/end_date/타겟 연령은 open_spaces 원본에 대응 값이 아예 없어 자동으로 채울 근거가
// 없다 — 코드가 임의로 날짜를 지어내지 않고(제3장 제5조 추측 금지) 관리자가 폼에서 직접
// 입력/선택한 값을 그대로 쓴다.
function extractLngLat(location: unknown): { lng: number; lat: number } | null {
  const geometry = location as { coordinates?: [number, number] } | null;
  if (!geometry?.coordinates) return null;
  return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id,
      category_maj: categoryMaj,
      category_min: categoryMin,
      target_audience: targetAudience,
      start_date: startDate,
      end_date: endDate,
    } = body as {
      id?: unknown;
      category_maj?: unknown;
      category_min?: unknown;
      target_audience?: unknown;
      start_date?: unknown;
      end_date?: unknown;
    };

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    if (typeof categoryMaj !== 'string' || typeof categoryMin !== 'string') {
      return NextResponse.json({ error: '대분류/중분류는 필수입니다.' }, { status: 400 });
    }
    const majOption = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === categoryMaj);
    if (!majOption || !majOption.minorCategories.includes(categoryMin)) {
      return NextResponse.json({ error: '중분류가 선택한 대분류에 속하지 않습니다.' }, { status: 400 });
    }
    if (typeof targetAudience !== 'string' || !(EVENT_PICK_TARGET_AUDIENCES as readonly string[]).includes(targetAudience)) {
      return NextResponse.json(
        { error: `타겟 연령은 다음 중 하나여야 합니다: ${EVENT_PICK_TARGET_AUDIENCES.join(', ')}` },
        { status: 400 }
      );
    }
    if (typeof startDate !== 'string' || typeof endDate !== 'string' || !startDate || !endDate) {
      return NextResponse.json({ error: '시작일/종료일은 필수입니다.' }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: '시작일은 종료일보다 늦을 수 없습니다.' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: space, error: fetchError } = await admin
      .from('open_spaces')
      .select(
        'id, external_id, name, category, location, is_free, operating_hours, info_url, sigungu_name, is_kids_friendly, has_parking, stroller_accessible, facility_type, target_age_group'
      )
      .eq('id', id)
      .single();

    if (fetchError || !space) {
      return NextResponse.json({ error: fetchError?.message ?? '원본 스팟 데이터를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 원본을 삭제하기 전에 실제 사용자 예약이 걸려 있는지 반드시 확인한다 —
    // reservations.spot_id → open_spaces.id는 ON DELETE CASCADE라(실측 확인) 아무 확인 없이
    // 삭제하면 실제 사용자가 넣은 예약 기록이 통보 없이 함께 사라진다. 이관 자체를 막고
    // 관리자가 먼저 예약을 확인/정리하도록 안내한다(제11조 오류 처리 원칙 — 예상 밖 상황에서
    // 서비스/데이터가 조용히 훼손되지 않아야 한다).
    const { count: reservationCount, error: reservationError } = await admin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('spot_id', id);
    if (reservationError) {
      return NextResponse.json({ error: `예약 데이터 확인 실패: ${reservationError.message}` }, { status: 500 });
    }
    if ((reservationCount ?? 0) > 0) {
      return NextResponse.json(
        { error: `이 스팟에는 사용자 예약이 ${reservationCount}건 있어 이관할 수 없습니다. 예약을 먼저 확인/처리해주세요.` },
        { status: 409 }
      );
    }

    const coords = extractLngLat(space.location);

    const { data: inserted, error: insertError } = await admin
      .from('events')
      .insert({
        external_id: `MIGRATED_${space.external_id}`,
        title: space.name,
        event_type: space.category,
        start_date: startDate,
        end_date: endDate,
        location: coords ? `SRID=4326;POINT(${coords.lng} ${coords.lat})` : null,
        venue_name: space.name,
        sigungu_name: space.sigungu_name,
        is_free: space.is_free,
        // events 테이블엔 open_spaces의 info_url에 대응하는 컬럼이 없어(실측 확인 —
        // information_schema.columns) 유일한 공개 URL 컬럼인 reservation_url에 담는다.
        // is_reservation_required는 false로 둬 "예약 필수 링크"가 아니라 "안내 링크"임을
        // 구분한다(getReservationAvailabilityTag가 reservation_url 존재 시 뱃지를 아예
        // 숨기므로 사용자에게 오인 안내가 나가지 않는다).
        reservation_url: space.info_url,
        is_reservation_required: false,
        // events에는 operating_hours 컬럼이 없어 description에 보존한다(정보 유실 방지).
        description: space.operating_hours ? `운영시간: ${space.operating_hours}` : null,
        is_kids_friendly: space.is_kids_friendly,
        has_parking: space.has_parking,
        stroller_accessible: space.stroller_accessible,
        facility_type: space.facility_type,
        target_age_group: space.target_age_group,
        category_maj: categoryMaj,
        category_min: categoryMin,
        category_min_source: 'MANUAL',
        target_audience: targetAudience,
        target_audience_source: 'MANUAL',
        is_active: true,
        source: 'MIGRATED_FROM_OPEN_SPACES',
      })
      .select('id, title')
      .single();

    if (insertError || !inserted) {
      return NextResponse.json({ error: insertError?.message ?? '이벤트픽 이관 실패' }, { status: 500 });
    }

    const { error: deleteError } = await admin.from('open_spaces').delete().eq('id', id);
    if (deleteError) {
      return NextResponse.json(
        {
          row: inserted,
          warning: `이벤트픽 이관은 성공했지만 원본 스팟픽 데이터 삭제에 실패했습니다: ${deleteError.message}. 중복 노출을 막으려면 수동으로 삭제해주세요.`,
        },
        { status: 207 }
      );
    }

    return NextResponse.json({ row: inserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : '이벤트픽 이관 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
