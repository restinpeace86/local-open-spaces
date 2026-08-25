import { Suspense } from 'react';
import { MapExplorer } from '@/components/map/map-explorer';

// MapExplorer가 useSearchParams()(Task 9-1: 홈 검색바에서 넘어온 ?q= 초기값)를 쓰므로
// Next.js 정적 프리렌더 요구사항대로 Suspense 경계로 감싼다.
export default function NearbyPage() {
  return (
    <Suspense>
      <MapExplorer />
    </Suspense>
  );
}
