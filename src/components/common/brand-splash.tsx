// Task 9-4-1(2026-08-22): 나드리픽 브랜드 스플래시 & 로딩 컴포넌트.
// 화면 전체를 채우는 배치(고정 오버레이 등)는 사용하는 쪽(app/loading.tsx, bottom-tabs.tsx)이
// 책임진다 — 이 컴포넌트 자체는 중앙 정렬된 타이틀/서브 문구/로딩 이미지 콘텐츠만 담당한다.
// [로딩 이미지 교체](2026-09-03 사용자 지시): 회전 스피너(animate-spin) 대신 사용자가
// 직접 제공한 움직이는 GIF(reference/loading/loading_image.gif → public/loading/로
// 복사)를 쓴다. next/image는 GIF를 재인코딩해 애니메이션이 깨질 수 있어(최적화 파이프라인
// 특성) 순수 <img> 태그로 원본 그대로 재생한다 — 이 프로젝트에도 이미 여러 곳에서
// 동일한 이유로 <img>를 그대로 쓰는 관례가 있다.
export function BrandSplash() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/loading/loading_image.gif" alt="" aria-hidden className="h-24 w-24 object-contain" />
      <div className="flex flex-col items-center gap-1">
        <p className="text-lg font-extrabold text-gray-900">나드리픽</p>
        <p className="text-sm text-gray-500">오늘 어디 가지?</p>
      </div>
      <p className="text-xs font-semibold tracking-wider text-gray-400">LOADING...</p>
    </div>
  );
}
