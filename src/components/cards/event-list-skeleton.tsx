// [개선사항4](2026-09-11 사용자 지시, implementation/todo.md): "전체보기" 바텀시트가
// 중분류 탭 선택/전환으로 새 데이터를 불러오는 동안 빈 화면이나 멈춘 느낌이 들지 않도록
// 가벼운 스켈레톤을 보여준다. 기존 `FreeFeedSkeleton`은 2~4열 그리드(EventCard/
// SpaceGridCard용, h-32 블록)라 이번에 도입한 이미지 없는 1열 리스트(EventListRow,
// 4단 라인·훨씬 얇은 행)와 모양이 맞지 않아 재사용하지 않고 전용 스켈레톤을 새로 만든다
// (제5장 제4조 기존 구조 우선 — 다만 목적이 다른 레이아웃을 억지로 공유하지 않음).
const SKELETON_COUNT = 6;

export function EventListSkeleton({ label = '목록 불러오는 중' }: { label?: string } = {}) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label={label}>
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className="rounded-xl border border-gray-200 bg-gray-100 animate-pulse h-[76px]"
          aria-hidden
        />
      ))}
    </div>
  );
}
