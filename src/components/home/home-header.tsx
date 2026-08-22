'use client';

import { useRouter } from 'next/navigation';
import { LocationHeader } from '@/components/map/location-header';
import { SearchBar } from '@/components/map/search-bar';

// docs/spec.md 2.1: "고정 헤더: [위치 선택기] + [🔍 통합 검색바]"
// 검색 결과를 보여줄 별도 화면이 없어(홈 자체는 큐레이션 피드 전용), 검색은 기존 지도 탐색
// 화면([내주변])으로 검색어를 넘겨 그 화면의 검색/필터 로직을 그대로 재사용한다.
//
// 사용자 피드백(2026-08-22): 위치 선택기에 상세 도로명주소(예: "경기도 성남시 분당구 판교로
// 546번길 ...")를 그대로 보여주면 검색바가 거의 안 보일 정도로 좁아진다. 이 헤더에서는
// locationLabel로 시/군/구 단위의 짧은 이름(예: "성남시 분당구")만 받아 표시한다.
export function HomeHeader({
  locationLabel,
  onLocationClick,
}: {
  locationLabel: string | null;
  onLocationClick: () => void;
}) {
  const router = useRouter();

  return (
    <div className="shrink-0 flex items-center gap-2 p-3 border-b border-gray-100">
      <LocationHeader addressName={locationLabel} onClick={onLocationClick} />
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
