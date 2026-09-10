import { NextResponse } from 'next/server';
import { getExpertPosts, getLivePosts, getTrendingPosts } from '@/lib/community/mom-pick-dashboard';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시): "메인 대시보드 진입 시 전체 데이터를
// 다 불러오지 않고, 각 영역별로 필요한 소량의 데이터만(LIMIT 3 또는 LIMIT 5) 가볍게
// 쿼리" — 3개 섹션의 미리보기를 한 번의 요청으로 묶어 왕복 횟수를 줄이되, 각 섹션은
// DB 레벨에서 각자 짧은 LIMIT으로 독립 조회한다(mom-pick-dashboard.ts).
//
// [미리보기는 게이팅하지 않는다](2026-09-11 사용자 지시): "로그인 안 했거나 아직
// 가입맘이어도 맘스픽을 볼 수는 있어야 한다(미리보기 형태)." 이 라우트는 3~5건
// 미리보기만 내려주고, 클릭·전체보기·글쓰기는 클라이언트 투명 인터셉트 레이어
// (mom-pick-view.tsx)와 전체보기 라우트(requireCommunityAccess)가 막는다.
const EXPERT_PREVIEW_LIMIT = 3;
const TRENDING_PREVIEW_LIMIT = 5;
const LIVE_PREVIEW_LIMIT = 5;

export async function GET() {
  try {
    const [expert, trending, live] = await Promise.all([
      getExpertPosts(EXPERT_PREVIEW_LIMIT),
      getTrendingPosts(TRENDING_PREVIEW_LIMIT),
      getLivePosts(LIVE_PREVIEW_LIMIT),
    ]);

    return NextResponse.json({
      expert: expert.items,
      trending: trending.items,
      live: live.items,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '맘스픽 대시보드 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
