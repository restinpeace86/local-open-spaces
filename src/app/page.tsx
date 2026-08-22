import { HomeView } from '@/components/home/home-view';
import { getTodayEvents, HERO_FETCH_LIMIT } from '@/lib/home/get-home-feed';

// Task 9-1(2026-08-22): 신규 홈 화면 — docs/spec.md 2.2 메인 홈 레이아웃 스택.
// Server Component에서 초기 피드를 직접 조회해 곧바로 렌더링한다(/api/home/feed는 클라이언트
// 재조회용으로 같은 lib/home/get-home-feed.ts 로직을 공유).
// Task 9-3-1(2026-08-22): 초기 페칭 페이로드 최소화 — 상단 Hero Carousel 데이터만 우선
// 페칭한다. 하단 "가성비 행복" 피드는 HomeView가 화면에 스크롤로 들어올 때(또는 해당 탭
// 선택 시)에만 /api/home/free-feed로 지연 페칭한다.
// 긴급 수리(Hotfix, 2026-08-22): getTodayEvents가 던지면(DB 일시 오류 등) Server Component가
// 그대로 예외를 전파해 홈 화면 전체가 렌더링되지 못하고 "This page couldn't load" 상태에
// 빠진다(제11조 오류 처리 원칙: 예상하지 못한 상황에도 서비스가 중단되면 안 됨). 초기 진입
// 시 기본 지역(DEFAULT_HOME_REGION)으로만 조회하므로 평소엔 안전하지만, DB 커넥션 문제 같은
// 진짜 예외 상황에서도 홈 화면 자체는 항상 뜨도록(빈 Hero 상태로 폴백) 한 번 더 방어한다.
export default async function HomePage() {
  let heroEvents: Awaited<ReturnType<typeof getTodayEvents>> = [];
  try {
    heroEvents = await getTodayEvents(HERO_FETCH_LIMIT);
  } catch {
    // 폴백: 빈 배열이면 HomeView가 "오늘 진행 중인 추천 행사가 아직 없습니다" 안내를 보여준다.
  }
  return <HomeView initialHeroEvents={heroEvents} />;
}
