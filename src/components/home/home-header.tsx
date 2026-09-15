'use client';

import { LocationHeader } from '@/components/map/location-header';
import { SearchBar } from '@/components/map/search-bar';
import { WeatherWidget } from '@/components/home/weather-widget';

// docs/spec.md 2.1: "고정 헤더: [위치 선택기] + [🔍 통합 검색바]"
// [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판 "GNB 헤더 & 글로벌 위치 상태 공유"):
// "우측 검색 컴포넌트 실행 시 events 테이블 전용 키워드 검색 수행" — 스팟픽(/nearby, open_spaces
// 전용 검색)으로 이동시키던 이전 동작을 걷어내고, 검색어를 그대로 부모(HomeView)에 올려보내
// 이 화면 내부에서 이벤트만 검색해 인라인으로 보여주도록 바꿨다(제어 컴포넌트로 전환).
//
// 사용자 피드백(2026-08-22): 위치 선택기에 상세 도로명주소(예: "경기도 성남시 분당구 판교로
// 546번길 ...")를 그대로 보여주면 검색바가 거의 안 보일 정도로 좁아진다. 이 헤더에서는
// locationLabel로 시/군/구 단위의 짧은 이름(예: "성남시 분당구")만 받아 표시한다.
// [상단 날씨 위젯](2026-09-15 사용자 지시, implementation/todo.md [개선사항 7]):
// "메인 홈 최상단 고정 헤더를 공간 효율적이고 미니멀하게 한 줄로 구성" — 우측에 날씨
// 위젯을 추가하는 대신 위치/검색 폭을 좁혀야 한 줄에 세 요소가 다 들어간다. 위치 배지의
// max-w는 이미 shrink-0이라 셋을 한 줄에 나열하면 SearchBar(flex-1)가 자동으로
// 남는 폭만 차지해 줄어든다(레이아웃 계산을 새로 만들 필요 없음).
export function HomeHeader({
  locationLabel,
  onLocationClick,
  searchValue,
  onSearchChange,
  weatherLat,
  weatherLng,
}: {
  locationLabel: string | null;
  onLocationClick: () => void;
  searchValue: string;
  onSearchChange: (keyword: string) => void;
  weatherLat?: number;
  weatherLng?: number;
}) {
  return (
    <div className="shrink-0 flex items-center gap-2 p-3 border-b border-gray-100">
      <LocationHeader addressName={locationLabel} onClick={onLocationClick} />
      <div className="flex-1 min-w-0">
        <SearchBar value={searchValue} onChange={onSearchChange} />
      </div>
      <WeatherWidget lat={weatherLat} lng={weatherLng} />
    </div>
  );
}
