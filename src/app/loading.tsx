import { BrandSplash } from '@/components/common/brand-splash';

// Task 9-4-1(2026-08-22): Next.js App Router의 루트 loading.tsx — 각 라우트 세그먼트가
// 서버에서 데이터를 로딩하는 동안(Suspense 경계) 자동으로 보여주는 초기 진입 스플래시.
export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <BrandSplash />
    </div>
  );
}
