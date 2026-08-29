import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 공식 홈페이지가 없는
// 스팟(open_spaces)을 위한 자체 신청 접수 엔드포인트. reservations 테이블은 RLS가
// 켜져 있고 정책이 없어(scripts/migrations/2026-08-29-create-reservations-table.sql)
// anon 키로는 삽입할 수 없다 — category-rules API와 동일하게 서비스 롤 클라이언트를
// 서버에서만 쓴다.
const CONTACT_MAX_LENGTH = 50;
const DEFAULT_PAGE_SIZE = 20;

// [관리자 예약 관리 어드민 대시보드](2026-08-29 사용자 지시): '상태 변경' 액션이 허용하는
// 값 — 신규 신청은 항상 PENDING으로 시작하므로(POST에서 고정) 여기서는 운영자가 전화
// 조율 후 바꿀 수 있는 두 값만 허용한다. DB의 CHECK 제약(create-reservations-table.sql)과
// 동일한 값 집합을 애플리케이션 레벨에서도 검증해 잘못된 값은 DB까지 가기 전에 걸러낸다.
const UPDATABLE_STATUSES = ['CONFIRMED', 'CANCELLED'] as const;
type UpdatableStatus = (typeof UPDATABLE_STATUSES)[number];

function isUpdatableStatus(value: unknown): value is UpdatableStatus {
  return typeof value === 'string' && (UPDATABLE_STATUSES as readonly string[]).includes(value);
}

function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

// [어드민 예약 대시보드 뱃지 및 요약 카운트 폴리싱](2026-08-29 사용자 지시): 상단 요약
// 카드가 "전체 예약 현황"(페이지네이션과 무관하게 테이블 전체 기준)을 보여줘야 해서,
// 상태별 건수를 head:true(행 데이터 없이 카운트만) 쿼리 3개로 별도 집계한다 — 전체
// 목록을 다 내려받아 애플리케이션에서 세는 것보다 가볍고, 신청 건수가 늘어나도 비용이
// 일정하다(count-only 쿼리는 인덱스만 스캔).
const RESERVATION_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'] as const;

// [관리자 예약 관리 어드민 대시보드](2026-08-29 사용자 지시): 운영자가 접수된 신청을
// 최신순으로 확인할 수 있는 목록 조회. category-rules GET과 동일하게 서비스 롤
// 클라이언트를 쓴다 — reservations는 RLS 정책이 아예 없어 익명 키로는 어차피 아무것도
// 못 읽으므로(개인정보 보호, 직전 작업에서 실측 확인) 이 라우트가 유일한 조회 경로다.
// PostgREST 임베딩(`open_spaces(name, address)`)으로 스팟 이름/주소를 한 번의 쿼리로
// 함께 가져온다 — reservations.spot_id → open_spaces.id FK가 이미 있어 별도 뷰/RPC 없이
// 바로 동작한다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
    const pageSize = Number(searchParams.get('page_size')) || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;

    const admin = createAdminClient();
    const [listResult, ...statusCountResults] = await Promise.all([
      admin
        .from('reservations')
        .select('id, spot_id, contact, visit_date, headcount, status, created_at, open_spaces(name, address)', {
          count: 'exact',
        })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1),
      ...RESERVATION_STATUSES.map((status) =>
        admin.from('reservations').select('id', { count: 'exact', head: true }).eq('status', status)
      ),
    ]);

    if (listResult.error) {
      return NextResponse.json({ error: listResult.error.message }, { status: 500 });
    }
    const countError = statusCountResults.find((r) => r.error);
    if (countError?.error) {
      return NextResponse.json({ error: countError.error.message }, { status: 500 });
    }

    const statusCounts = Object.fromEntries(
      RESERVATION_STATUSES.map((status, i) => [status, statusCountResults[i].count ?? 0])
    ) as Record<(typeof RESERVATION_STATUSES)[number], number>;

    return NextResponse.json({
      reservations: listResult.data ?? [],
      total: listResult.count ?? 0,
      page,
      pageSize,
      statusCounts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예약 목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const spotId = typeof body.spot_id === 'string' ? body.spot_id.trim() : '';
    const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
    const visitDate = typeof body.visit_date === 'string' ? body.visit_date.trim() : '';
    const headcount = Number(body.headcount);

    if (!spotId) {
      return NextResponse.json({ error: 'spot_id는 필수입니다.' }, { status: 400 });
    }
    if (!contact) {
      return NextResponse.json({ error: '연락처를 입력해 주세요.' }, { status: 400 });
    }
    if (contact.length > CONTACT_MAX_LENGTH) {
      return NextResponse.json({ error: `연락처는 ${CONTACT_MAX_LENGTH}자를 넘을 수 없습니다.` }, { status: 400 });
    }
    if (!isValidDateString(visitDate)) {
      return NextResponse.json({ error: '방문 날짜를 올바르게 선택해 주세요.' }, { status: 400 });
    }
    if (!Number.isInteger(headcount) || headcount < 1) {
      return NextResponse.json({ error: '인원 수는 1명 이상의 숫자여야 합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('reservations')
      .insert({ spot_id: spotId, contact, visit_date: visitDate, headcount })
      .select()
      .single();

    if (error) {
      // spot_id가 open_spaces에 실제로 존재하지 않는 경우(FK 위반) 등도 여기로 온다.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ reservation: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예약 신청 접수 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// [관리자 예약 관리 어드민 대시보드](2026-08-29 사용자 지시): 운영자가 전화로 방문일/
// 인원수를 조율한 뒤 "확정" 또는 "취소" 버튼으로 상태만 바꾼다(MVP 범위 — 날짜/인원수
// 자체를 관리자가 수정하는 기능은 이번 지시서에 없어 구현하지 않음, 제3장 제2조 Spec 우선).
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const status = body.status;

    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 });
    }
    if (!isUpdatableStatus(status)) {
      return NextResponse.json(
        { error: `status는 ${UPDATABLE_STATUSES.join(' 또는 ')} 중 하나여야 합니다.` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('reservations')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // 실측 확인: 존재하지 않는 id는 update가 0행에 적용돼 .single()이 자체적으로
      // "PGRST116"(no rows) 에러를 던진다 — 원본 PostgREST 문구를 그대로 노출하지 않고
      // 사람이 이해할 수 있는 404 메시지로 바꾼다.
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '해당 예약 신청을 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ reservation: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : '예약 상태 변경 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
