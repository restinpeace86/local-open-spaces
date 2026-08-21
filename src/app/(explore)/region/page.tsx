import { Suspense } from 'react';
import { RegionGridView } from '@/components/region/region-grid-view';

// RegionGridView가 useSearchParams()(Task 9-1: 홈 카테고리 Quick 그리드에서 넘어온 ?category=
// 초기값)를 쓰므로 Next.js 정적 프리렌더 요구사항대로 Suspense 경계로 감싼다.
export default function RegionPage() {
  return (
    <Suspense>
      <RegionGridView />
    </Suspense>
  );
}
