// Task 9-4-1(2026-08-22): 나드리픽 브랜드 스플래시 & 로딩 컴포넌트.
// 화면 전체를 채우는 배치(고정 오버레이 등)는 사용하는 쪽(app/loading.tsx, bottom-tabs.tsx)이
// 책임진다 — 이 컴포넌트 자체는 중앙 정렬된 타이틀/서브 문구/스피너 콘텐츠만 담당한다.
export function BrandSplash() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      <div
        className="h-10 w-10 rounded-full border-4 border-gray-200 border-t-blue-600 animate-spin"
        aria-hidden
      />
      <div className="flex flex-col items-center gap-1">
        <p className="text-lg font-extrabold text-gray-900">나드리픽 (NadriPick)</p>
        <p className="text-sm text-gray-500">오늘 어디 가지?</p>
      </div>
      <p className="text-xs font-semibold tracking-wider text-gray-400">LOADING...</p>
    </div>
  );
}
