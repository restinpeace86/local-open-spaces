import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { MomPickUnmappedSpot, MomPickUnmappedSpotPost } from '@/lib/admin/mom-pick-unmapped-spots';

// [관리자 화면 — 노출 중분류 미지정 + 맘스픽 글 있음 우선순위 큐](2026-09-13 사용자
// 지시): "맘스픽에 대하여 노출 중분류가 없는 건 별도의 관리자화면의 탭에서.. 맘스픽
// 글이 올라왔고 이게 장소연결됐는데 장소에 대한 노출중분류가 안되어 있다.. 그
// 탭에 그런게 수시로 올라올수 있으니 탭 자체에 1건이라도 있을경우 표시".
//
// mom_pick_posts.author_id/profiles와 달리 spot_id → open_spaces는 정상적인 FK라
// PostgREST 임베디드 조회 자체는 가능하지만(참고: /api/admin/spot-curations의
// `open_spaces!inner(...)`), "임베디드 테이블 컬럼이 null"이라는 조건(!inner +
// .is('open_spaces.service_category_id', null))은 이 프로젝트에 아직 검증된 선례가
// 없어 추측으로 쓰지 않는다 — mom-pick-dashboard.ts가 이미 쓰고 있는 "여러 번 조회해
// JS에서 이어붙이기" 관례를 그대로 재사용한다(제5장 제4조 기존 구조 우선).
export async function GET() {
  try {
    const admin = createAdminClient();

    // 1. spot_id가 있는 맘스픽 글 전부(최신순).
    const { data: postRows, error: postsError } = await admin
      .from('mom_pick_posts')
      .select('id, spot_id, author_id, post_type, content, rating, created_at')
      .not('spot_id', 'is', null)
      .order('created_at', { ascending: false });
    if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500 });
    if (!postRows || postRows.length === 0) return NextResponse.json({ spots: [] });

    const spotIds = [...new Set(postRows.map((r) => r.spot_id as string))];

    // 2. 그중 노출 중분류가 아직 없는 스팟만.
    const { data: spotRows, error: spotsError } = await admin
      .from('open_spaces')
      .select('id, name, display_name, address, category_min, sigungu_name, service_category_id')
      .in('id', spotIds)
      .is('service_category_id', null);
    if (spotsError) return NextResponse.json({ error: spotsError.message }, { status: 500 });
    if (!spotRows || spotRows.length === 0) return NextResponse.json({ spots: [] });

    const unmappedSpotIds = new Set(spotRows.map((s) => s.id));
    const relevantPosts = postRows.filter((p) => unmappedSpotIds.has(p.spot_id as string));

    // 3. 작성자 닉네임(mom-pick-dashboard.ts의 attachAuthors와 동일한 이유로 별도 조회).
    const authorIds = [...new Set(relevantPosts.map((p) => p.author_id))];
    const { data: authorRows } = await admin.from('profiles').select('id, nickname').in('id', authorIds);
    const nicknameByAuthorId = new Map((authorRows ?? []).map((a) => [a.id, a.nickname as string | null]));

    // 4. 이미 있는 블로그 큐레이션(있으면 함께 보여줘 관리자가 새로 찾지 않아도 되게).
    const { data: curationRows } = await admin
      .from('spot_curations')
      .select('spot_id, blog_url_1, blog_url_2, blog_url_3')
      .in('spot_id', [...unmappedSpotIds])
      .eq('is_active', true);
    const curatedUrlsBySpotId = new Map(
      (curationRows ?? []).map((c) => [
        c.spot_id as string,
        [c.blog_url_1, c.blog_url_2, c.blog_url_3].filter((u): u is string => typeof u === 'string' && u.trim().length > 0),
      ])
    );

    const postsBySpotId = new Map<string, MomPickUnmappedSpotPost[]>();
    for (const p of relevantPosts) {
      const spotId = p.spot_id as string;
      const list = postsBySpotId.get(spotId) ?? [];
      list.push({
        id: p.id,
        post_type: p.post_type as MomPickUnmappedSpotPost['post_type'],
        rating: p.rating,
        content: p.content,
        created_at: p.created_at,
        author_nickname: nicknameByAuthorId.get(p.author_id) ?? null,
      });
      postsBySpotId.set(spotId, list);
    }

    const spots: MomPickUnmappedSpot[] = spotRows
      .filter((s) => postsBySpotId.has(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        display_name: s.display_name,
        address: s.address,
        category_min: s.category_min,
        sigungu_name: s.sigungu_name,
        service_category_id: s.service_category_id,
        posts: postsBySpotId.get(s.id)!,
        curatedBlogUrls: curatedUrlsBySpotId.get(s.id) ?? [],
      }))
      // 가장 최근에 글이 달린 스팟이 먼저 보이도록(관리자가 최근 활동부터 확인).
      .sort((a, b) => new Date(b.posts[0].created_at).getTime() - new Date(a.posts[0].created_at).getTime());

    return NextResponse.json({ spots });
  } catch (err) {
    const message = err instanceof Error ? err.message : '노출 중분류 미지정 + 맘스픽 글 있는 스팟 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
