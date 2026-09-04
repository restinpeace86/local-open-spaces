import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { DedupCandidateRow } from '@/lib/admin/spot-dedup-grouping';

// [개선사항10 - 중복 스팟 그룹핑 및 매핑 탭](2026-09-04 todo.md) 2-1항: "아직
// 정제되지 않은 open_spaces 데이터들을 대상으로, 주소 정규화 일치 또는 좌표 근접
// 스팟들을 동적으로 묶어 '중복 의심 그룹' 리스트로 반환." 무거운 클러스터링 계산
// (ST_ClusterDBSCAN)은 DB RPC(find_spot_dedup_candidates)가 맡는다.
//
// [2026-09-05 페이지네이션 도입 — 사용자 timeout 신고 대응] 실측(EXPLAIN ANALYZE)으로
// 확인한 진짜 원인은 open_spaces 테이블 통계가 낡아 쿼리 플래너가 잘못된 실행
// 계획(Bitmap Heap Scan으로 사실상 전체 힙을 훑음)을 세운 것이었다 — `ANALYZE
// open_spaces`로 즉시 13.5초 → 0.1초로 해소했다(2026-09-04-spot-dedup-perf-fix-and-
// pagination.sql 마이그레이션 주석 참고). 다만 통계가 다시 낡아지는 경우에 대비해
// 방어적으로 "한 번에 50건만 스캔"하는 커서(after) 기반 페이지네이션을 함께
// 적용한다 — 이 라우트는 이제 그룹으로 미리 합치지 않고 RPC의 원시 결과(후보 행 +
// next_cursor/has_more)를 그대로 돌려준다. 그룹 병합(Union-Find)은 여러 페이지에
// 걸쳐 누적된 후보를 대상으로 다시 계산해야 하므로 클라이언트(SpotDedupPanel)가
// 담당한다(제5장 제4조 — groupDedupCandidates는 이미 순수 함수라 그대로 재사용).
//
// [2026-09-05 스캔 순서를 id → geohash로 변경, 좌표 근접 판정을 SQL → 클라이언트로
// 이전] 사용자가 실제 데이터로 지적한 중복 사례를 재현해 확인한 결과, id(무작위
// uuid) 순 스캔은 실제로 가까운 두 행이 같은 배치에 함께 걸릴 확률이 거의 0이었다 —
// ST_GeoHash 기반 공간 순서로 바꿔 몇 번의 "더 보기" 안에 함께 스캔되도록 했고,
// 좌표 근접 자체는 이제 Haversine(정확한 실제 미터 거리)로 클라이언트가 누적된
// 전체 후보를 대상으로 계산한다(spot-dedup-grouping.ts, 2026-09-05-spot-dedup-
// geohash-scan-and-accurate-distance.sql 참고). `p_after_id`(uuid)는
// `p_after_key`(geohash 기반 텍스트 커서)로 바뀌었지만, 이 라우트의 외부 계약
// (쿼리 파라미터 `after`, 응답의 `next_cursor`)은 둘 다 불투명한 문자열이라
// 변경이 없다.
const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;
    const after = searchParams.get('after') || undefined;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('find_spot_dedup_candidates', {
      p_limit: limit,
      p_after_key: after,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { candidates: DedupCandidateRow[]; next_cursor: string | null; has_more: boolean };
    return NextResponse.json({
      candidates: result.candidates ?? [],
      next_cursor: result.next_cursor,
      has_more: result.has_more,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '중복 의심 그룹 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
