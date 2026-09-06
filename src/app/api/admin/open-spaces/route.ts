import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// [open_spaces 삭제 기능](2026-09-06 사용자 지시): "내가 불필요하다고 생각하는건
// 관리자 화면에서 삭제하는게 더 좋을까?" → "open_spaces쪽의 데이터" 삭제 기능
// 요청(개별 + 일괄 둘 다).
//
// [실측 확인] open_spaces(id)를 참조하는 FK 6개를 전부 조회했다 —
// service_categories와 달리(참조 시 그냥 DELETE가 실패해 안전) open_spaces는
// 대부분 CASCADE/SET NULL이라 DB가 삭제 자체를 막아주지 않는다. 즉 그냥
// 지우면 아래가 "조용히" 함께 사라진다:
//   events.space_id            → SET NULL (행사 자체는 남고 위치 연결만 끊김)
//   reservations.spot_id       → CASCADE  (실제 예약 기록이 통째로 삭제됨!)
//   spot_curations.spot_id     → CASCADE  (관리자가 공들인 큐레이션 데이터 삭제)
//   spot_weather_caches.spot_id→ CASCADE  (캐시라 무해)
//   mom_pick_posts.spot_id     → SET NULL (게시글은 남고 위치 연결만 끊김)
//   user_bookmarks.spot_id     → CASCADE  (실제 사용자가 저장한 북마크가 삭제됨!)
// reservations(실제 예약)와 user_bookmarks(실제 사용자 데이터)는 관리자의 데이터
// 정리 의도와 무관하게 실사용자에게 영향을 주는 항목이라, 이 값이 하나라도 있으면
// 삭제 자체를 막는다(추측으로 "괜찮겠지" 넘어가지 않음) — 나머지(큐레이션/캐시/
// SET NULL 항목)는 개수를 보여주고 관리자가 확인 후 진행하도록 한다.
type ImpactCounts = {
  events: number;
  reservations: number;
  spot_curations: number;
  spot_weather_caches: number;
  mom_pick_posts: number;
  user_bookmarks: number;
};

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

async function countImpact(ids: string[]): Promise<ImpactCounts | { error: string }> {
  const admin = createAdminClient();
  const [events, reservations, spotCurations, weatherCaches, momPickPosts, bookmarks] = await Promise.all([
    admin.from('events').select('id', { count: 'exact', head: true }).in('space_id', ids),
    admin.from('reservations').select('id', { count: 'exact', head: true }).in('spot_id', ids),
    admin.from('spot_curations').select('id', { count: 'exact', head: true }).in('spot_id', ids),
    admin.from('spot_weather_caches').select('spot_id', { count: 'exact', head: true }).in('spot_id', ids),
    admin.from('mom_pick_posts').select('id', { count: 'exact', head: true }).in('spot_id', ids),
    admin.from('user_bookmarks').select('id', { count: 'exact', head: true }).in('spot_id', ids),
  ]);
  for (const r of [events, reservations, spotCurations, weatherCaches, momPickPosts, bookmarks]) {
    if (r.error) return { error: r.error.message };
  }
  return {
    events: events.count ?? 0,
    reservations: reservations.count ?? 0,
    spot_curations: spotCurations.count ?? 0,
    spot_weather_caches: weatherCaches.count ?? 0,
    mom_pick_posts: momPickPosts.count ?? 0,
    user_bookmarks: bookmarks.count ?? 0,
  };
}

// 삭제 전 영향 범위 미리보기 — 관리자가 확인 문구에 실제 건수를 보고 판단할 수 있게 한다.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ids = parseIds(searchParams.get('ids'));
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 });
    }

    const impact = await countImpact(ids);
    if ('error' in impact) return NextResponse.json({ error: impact.error }, { status: 500 });

    return NextResponse.json({ impact });
  } catch (err) {
    const message = err instanceof Error ? err.message : '삭제 영향 범위 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0) : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: '선택된 항목이 없습니다.' }, { status: 400 });
    }

    const impact = await countImpact(ids);
    if ('error' in impact) return NextResponse.json({ error: impact.error }, { status: 500 });

    // 실제 예약이 걸려있으면 관리자의 데이터 정리 의도와 무관하게 절대 지우지 않는다
    // (제5장 제11조 — 실사용자 데이터 보호가 우선). 예약을 먼저 취소/처리한 뒤
    // 다시 시도하도록 안내한다.
    if (impact.reservations > 0) {
      return NextResponse.json(
        {
          error: `실제 예약 ${impact.reservations.toLocaleString()}건이 걸려있어 삭제할 수 없습니다. 먼저 해당 예약을 처리한 뒤 다시 시도해주세요.`,
        },
        { status: 409 }
      );
    }

    const { error, count } = await createAdminClient()
      .from('open_spaces')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deleted_count: count ?? 0, impact });
  } catch (err) {
    const message = err instanceof Error ? err.message : '삭제 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
