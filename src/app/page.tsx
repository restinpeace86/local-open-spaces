import { HomeView } from '@/components/home/home-view';
import { getHomeFeed } from '@/lib/home/get-home-feed';

// Task 9-1(2026-08-22): 신규 홈 화면 — docs/spec.md 2.2 메인 홈 레이아웃 스택.
// Server Component에서 초기 피드를 직접 조회해 곧바로 렌더링한다(/api/home/feed는 클라이언트
// 재조회용으로 같은 lib/home/get-home-feed.ts 로직을 공유).
export default async function HomePage() {
  const feed = await getHomeFeed();
  return <HomeView initialFeed={feed} />;
}
