import { TopTabs } from '@/components/nav/top-tabs';

// Task 9-1(2026-08-22): 지도/도감/캘린더 3뷰를 묶는 (explore) 라우트 그룹 레이아웃.
// 하단 5탭의 [내주변]/[카테고리] 진입점이 이 그룹 안의 페이지로 연결된다.
export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TopTabs />
      {children}
    </div>
  );
}
