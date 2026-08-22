// Task 9-3-1(2026-08-22): "가성비 행복" 섹션이 아직 지연 페칭 전(또는 로딩 중)일 때 보여주는
// Skeleton UI. 실제 카드(SpaceGridCard/EventCard)와 그리드 레이아웃(grid-cols-2/3/4, gap-3)을
// 맞춰 데이터 도착 시 Layout Shift(CLS)가 생기지 않도록 한다.
const SKELETON_COUNT = 8;

export function FreeFeedSkeleton() {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3"
      role="status"
      aria-label="가성비 행복 피드 불러오는 중"
    >
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-gray-100 animate-pulse h-32"
          aria-hidden
        />
      ))}
    </div>
  );
}
