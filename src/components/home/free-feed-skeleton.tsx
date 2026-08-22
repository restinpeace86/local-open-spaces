// Task 9-3-1(2026-08-22): "가성비 행복" 섹션이 아직 지연 페칭 전(또는 로딩 중)일 때 보여주는
// Skeleton UI. 실제 카드(SpaceGridCard/EventCard)와 그리드 레이아웃(grid-cols-2/3/4, gap-3)을
// 맞춰 데이터 도착 시 Layout Shift(CLS)가 생기지 않도록 한다.
const SKELETON_COUNT = 8;

// Task 9-6-2(2026-08-23): "경기도권 기타" 섹션도 같은 Skeleton을 재사용하되, 같은 aria-label이
// 두 섹션에 동시에 존재하면 getByRole 조회가 모호해진다(테스트에서 실측 확인) — label을
// 파라미터화해 기존 호출부(가성비 행복)는 동작 변경 없이, 새 섹션만 다른 문구를 쓴다.
export function FreeFeedSkeleton({ label = '가성비 행복 피드 불러오는 중' }: { label?: string } = {}) {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3"
      role="status"
      aria-label={label}
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
