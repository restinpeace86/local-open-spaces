'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';

// [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1 "지도 마커 인터랙션 2단계 UX
// 개편(표준 지도 앱 방식)": 마커 클릭 즉시 무거운 전체 상세 모달을 띄우지 않고, 먼저
// 썸네일/장소명/간단 주소만 담은 가벼운 말풍선형 카드를 보여준다. 이 카드를 한 번 더
// 터치해야만(2단계) 전체 상세 모달로 들어간다(map-explorer.tsx가 onOpenDetail에서
// selectedItem을 세팅해 DetailModal을 연다).
//
// 공공데이터 스팟은 thumbnail_url이 항상 null이라(get-home-feed.ts의 toSpaceItem) 실제
// 썸네일 이미지가 없는 경우가 대부분이다 — 이 카드에서 관리자 큐레이션 이미지를 추가로
// 조회하지는 않는다(가벼운 1단계 카드의 취지에 맞게 별도 네트워크 요청 없이 카테고리
// 색상 아이콘으로 대체, 실제 대표 이미지는 2단계 상세 모달에서 보여준다).
export function MarkerPreviewCard({
  item,
  onOpenDetail,
  onClose,
}: {
  item: NearbyItem;
  onOpenDetail: () => void;
  onClose: () => void;
}) {
  const meta = getCategoryMeta(item.category);

  return (
    // [마커 미리보기 카드가 바텀시트를 가리는 문제 수정](2026-09-05 사용자 지시): "지도에
    // 마커 누르면 하단에 정보가 뜨는데.. 하단의 바텀시트를 가리게 됨.. 마커 위에 뜨게
    // 하던가.." 모바일 바텀시트(map-explorer.tsx)는 화면 바닥에서 bottom-16(64px) 띄운
    // 위치에, 접힌 상태 높이가 112px다 — 즉 시트 윗면은 화면 바닥에서 64+112=176px
    // 지점에 있다. 기존 bottom-4(16px)로는 이 카드가 시트 윗면(핸들/"목록 보기" 버튼)을
    // 그대로 덮었다. 시트 윗면보다 위(184px, 8px 여유)로 옮겨 마커 대신 "바텀시트 바로
    // 위"에 뜨도록 한다 — 데스크톱은 이 모바일 전용 바텀시트가 없어(별도 사이드 패널
    // 구조) 기존 위치(md:bottom-4)를 그대로 유지한다.
    <div className="absolute left-3 right-3 bottom-[184px] z-30 md:left-1/2 md:right-auto md:bottom-4 md:-translate-x-1/2 md:w-96">
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="미리보기 닫기"
          className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-white/90 text-gray-400 shadow hover:text-gray-600"
        >
          ✕
        </button>
        {/* 요구사항 "카드 터치 시 상세 모달 진입" — 카드 전체가 하나의 터치 타겟이다.
            위로 스와이프해서 여는 동작(요구사항 예시 "위로 올릴 때")까지는 이 MVP
            단계에서 제스처로 구현하지 않았다 — 탭으로 동일한 결과에 도달할 수 있다. */}
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`${item.name} 상세보기`}
          className="w-full flex items-center gap-3 p-3 pr-8 text-left"
        >
          <div
            className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
            style={{ backgroundColor: `${meta.color}22` }}
            aria-hidden
          >
            🖼️
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
            <p className="text-xs text-gray-500 truncate">{item.address || meta.label}</p>
          </div>
          <span className="shrink-0 text-gray-300" aria-hidden>
            ▲
          </span>
        </button>
      </div>
    </div>
  );
}
