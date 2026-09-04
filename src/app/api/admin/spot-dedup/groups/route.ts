import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DedupCandidateRow, groupDedupCandidates } from '@/lib/admin/spot-dedup-grouping';

// [개선사항10 - 중복 스팟 그룹핑 및 매핑 탭](2026-09-04 todo.md) 2-1항: "아직
// 정제되지 않은 open_spaces 데이터들을 대상으로, 주소 정규화 일치 또는 좌표 근접
// 스팟들을 동적으로 묶어 '중복 의심 그룹' 리스트로 반환." 무거운 클러스터링 계산
// (ST_ClusterDBSCAN)은 DB RPC(find_spot_dedup_candidates, 2026-09-04 마이그레이션)가
// 맡고, 이 라우트는 그 결과를 받아 두 가지 중복 근거(주소/좌표)를 하나의 그룹으로
// 병합(Union-Find, src/lib/admin/spot-dedup-grouping.ts)해 응답한다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc(
      'find_spot_dedup_candidates',
      limit ? { p_limit: limit } : {}
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const groups = groupDedupCandidates((data ?? []) as DedupCandidateRow[]);
    return NextResponse.json({ groups });
  } catch (err) {
    const message = err instanceof Error ? err.message : '중복 의심 그룹 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
