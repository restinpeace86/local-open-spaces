'use client';

import { useRouter } from 'next/navigation';
import { LocationHeader } from '@/components/map/location-header';
import { SearchBar } from '@/components/map/search-bar';

// docs/spec.md 2.1: "고정 헤더: [위치 선택기] + [🔍 통합 검색바]"
// 검색 결과를 보여줄 별도 화면이 없어(홈 자체는 큐레이션 피드 전용), 검색은 기존 지도 탐색
// 화면([내주변])으로 검색어를 넘겨 그 화면의 검색/필터 로직을 그대로 재사용한다.
export function HomeHeader({
  addressName,
  onLocationClick,
}: {
  addressName: string | null;
  onLocationClick: () => void;
}) {
  const router = useRouter();

  return (
    <div className="shrink-0 flex items-center gap-2 p-3 border-b border-gray-100">
      <LocationHeader addressName={addressName} onClick={onLocationClick} />
      <div className="flex-1">
        <SearchBar
          value=""
          onChange={(keyword) => {
            if (keyword.trim()) router.push(`/nearby?q=${encodeURIComponent(keyword.trim())}`);
          }}
        />
      </div>
    </div>
  );
}
