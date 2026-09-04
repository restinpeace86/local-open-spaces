import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildPendingGroupKey } from '@/lib/admin/spot-dedup-pending-key';

// [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시): "geohash 정렬로
// 그룹핑된 것에 대하여 현재 나오는 것들.. 따로 저장해주는 테이블 신규 생성하던가
// 아니면 해당 묶인것 기준으로 하여 상태 변경중이라던가 status 구분자로 진행중해놓던가...
// 임시테이블로써..." 스캔 결과는 브라우저 세션 메모리에만 있어 탭을 닫으면 진행 상황이
// 사라졌다 — 관리자가 그룹을 열어 검수를 시작하거나(in_progress) 중복이 아니라고
// 확인해 넘기면(ignored) 이 임시 테이블에 남긴다. 최종 등록 시 삭제는
// /api/admin/spot-dedup/apply/route.ts가 담당한다(그쪽에서 실제 반영과 같은 트랜잭션
// 성격으로 처리해야 누락이 없다).
type PendingGroupStatus = 'in_progress' | 'ignored';
const ALLOWED_STATUSES: PendingGroupStatus[] = ['in_progress', 'ignored'];

type OpenSpaceSummary = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
  address: string | null;
};

// 목록 화면에 "OO공원 외 1건"처럼 상호명/주소를 바로 보여주려면 매번 open_spaces를 다시
// 조인해야 한다 — member_spot_ids만 저장해두고(제5장 제6조: 표시용 데이터를 중복 저장하지
// 않음) 조회 시점에 최신 값으로 채운다. 병합 과정에서 이름이 바뀌었더라도(예: 다른 그룹이
// 먼저 processed) 항상 최신 상태를 보여준다.
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data: pendingGroups, error } = await admin
      .from('spot_dedup_pending_groups')
      .select('id, group_key, member_spot_ids, status, updated_at')
      .order('updated_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const allIds = [...new Set((pendingGroups ?? []).flatMap((g) => g.member_spot_ids as string[]))];
    let spotsById = new Map<string, OpenSpaceSummary>();
    if (allIds.length > 0) {
      const { data: spots, error: spotsError } = await admin
        .from('open_spaces')
        .select('id, name, category, category_min, address')
        .in('id', allIds);
      if (spotsError) return NextResponse.json({ error: spotsError.message }, { status: 500 });
      spotsById = new Map((spots ?? []).map((s) => [s.id, s as OpenSpaceSummary]));
    }

    const items = (pendingGroups ?? []).map((g) => ({
      id: g.id,
      group_key: g.group_key,
      status: g.status,
      updated_at: g.updated_at,
      members: (g.member_spot_ids as string[])
        .map((id) => spotsById.get(id))
        .filter((s): s is OpenSpaceSummary => Boolean(s)),
    }));

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : '진행 중 그룹 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const memberSpotIds = Array.isArray(body.member_spot_ids)
      ? body.member_spot_ids.filter((id: unknown) => typeof id === 'string')
      : [];
    if (memberSpotIds.length < 2) {
      return NextResponse.json({ error: '그룹은 최소 2개 이상의 스팟으로 구성돼야 합니다.' }, { status: 400 });
    }

    const status = body.status;
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status는 ${ALLOWED_STATUSES.join('/')} 중 하나여야 합니다.` }, { status: 400 });
    }

    const groupKey = buildPendingGroupKey(memberSpotIds);
    const admin = createAdminClient();
    const { error } = await admin
      .from('spot_dedup_pending_groups')
      .upsert(
        { group_key: groupKey, member_spot_ids: memberSpotIds, status, updated_at: new Date().toISOString() },
        { onConflict: 'group_key' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ group_key: groupKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : '그룹 임시 저장 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 관리자가 "임시 저장 취소"할 수 있는 탈출구(예: 실수로 진행중 표시했거나, 무시 처리를
// 되돌리고 싶은 경우) — 최종 등록에 의한 삭제와는 별개의 경로다.
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const groupKey = searchParams.get('group_key');
    if (!groupKey) {
      return NextResponse.json({ error: 'group_key가 필요합니다.' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from('spot_dedup_pending_groups').delete().eq('group_key', groupKey);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '임시 저장 삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
