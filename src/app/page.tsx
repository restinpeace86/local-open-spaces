import { HomeView } from '@/components/home/home-view';
import { getTodayEvents, HERO_FETCH_LIMIT } from '@/lib/home/get-home-feed';

// Task 9-1(2026-08-22): 신규 홈 화면 — docs/spec.md 2.2 메인 홈 레이아웃 스택.
// Server Component에서 초기 피드를 직접 조회해 곧바로 렌더링한다(/api/home/feed는 클라이언트
// 재조회용으로 같은 lib/home/get-home-feed.ts 로직을 공유).
// Task 9-3-1(2026-08-22): 초기 페칭 페이로드 최소화 — 상단 Hero Carousel 데이터만 우선
// 페칭한다. 하단 "가성비 행복" 피드는 HomeView가 화면에 스크롤로 들어올 때(또는 해당 탭
// 선택 시)에만 /api/home/free-feed로 지연 페칭한다.
export default async function HomePage() {
  const heroEvents = await getTodayEvents(HERO_FETCH_LIMIT);
  return <HomeView initialHeroEvents={heroEvents} />;
}
