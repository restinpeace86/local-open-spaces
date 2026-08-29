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
// [홈 화면 성능 최적화](2026-08-29 사용자 지시): 이전에는 "예약 가능"/"현재 이용 가능" 카드
// 슬라이더도 이 Server Component가 SSR로 함께 페칭했다 — 두 쿼리 모두 지역/거리 정렬에
// 더해 카테고리 라운드로빈 믹스 연산(interleaveByCategoryMin)까지 거치는 무거운 처리라,
// 셋을 한꺼번에 기다리는 동안 첫 응답(TTFB)이 지연됐다. 이제 이 Server Component는 상단
// Hero(가장 먼저 보여야 하는 영역)만 기다리고, 아래 두 슬라이더는 HomeView가 마운트된 뒤
// 클라이언트에서 스켈레톤을 먼저 보여주며 비동기로 페칭한다(/api/home/feed 재사용).
export default async function HomePage() {
  let heroEvents: Awaited<ReturnType<typeof getTodayEvents>> = [];
  try {
    // [이벤트픽 홈 슬라이드 카테고리 믹스 정렬](2026-08-29 사용자 지시): 특정 카테고리가
    // 메인 배너를 독점하지 않도록 카테고리 교차배치를 켠다(마지막 diversifyByCategory 인자).
    heroEvents = await getTodayEvents(HERO_FETCH_LIMIT, undefined, undefined, true);
  } catch {
    // 폴백: 빈 배열이면 HomeView가 "오늘 진행 중인 추천 행사가 아직 없습니다" 안내를 보여준다.
  }

  return <HomeView initialHeroEvents={heroEvents} />;
}
