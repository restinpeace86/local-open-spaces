'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { ItemListPanel } from '@/components/map/item-list-panel';

// [스팟픽 AI 추천](2026-08-29 사용자 지시): "AI 추천" 칩을 누르면 별도 페이지 이동 없이
// 지도 화면 위에 바텀시트(모바일)/모달(데스크톱)로 나들이 장소 추천 목록을 바로 보여준다.
// 목록 항목을 선택하면 시트를 닫고 기존 상세 모달로 이어진다(marker-group-modal.tsx와
// 동일한 관례).
//
// [실측 디버깅 발견](2026-08-29): 다른 모달(DetailModal/MarkerGroupModal)이 쓰는
// useModalBackClose(내부에서 history.pushState 호출)를 이 컴포넌트에도 그대로 적용했더니,
// 이 칩이 일반 React onClick(하위 컴포넌트 SpotCategoryFilter를 거쳐 전달된 콜백)으로
// 트리거되는 경로에서 상태 업데이트가 커밋 직후 조용히 되돌아가거나(리액트 파이버 직접 조회로
// 확인) 심하면 실제 페이지 네비게이션급 리로드까지 발생하는 것을 실측으로 확인했다(Next.js
// App Router가 history.pushState를 자체 라우팅 감지용으로 패치해두는 것과 이 컴포넌트가
// 마운트되는 렌더 커밋 타이밍이 겹쳐 충돌하는 것으로 추정 — 정확한 근본 원인은 Next.js/React
// 내부 스케줄링 영역이라 이번 범위에서 확정하지 않았다). 반면 마커 클릭(카카오 SDK의 순수
// addEventListener 경로)으로 여는 MarkerGroupModal은 동일 훅으로도 정상 동작했다 — 즉
// 이 문제는 신규 기능(AI 추천) 자체의 버그가 아니라 "React onClick으로 이 훅을 쓰는 모달을
// 여는" 기존 패턴 전반에 잠재된 문제로 보이며, 다른 모달(DetailModal 등)에도 영향이 있을 수
// 있다 — 별도 조사/수정이 필요한 사항으로 implementation 기록에 남긴다. 이 컴포넌트는 문제를
// 우회하기 위해 뒤로가기 가로채기(useModalBackClose) 없이, 배경 클릭/X 버튼으로만 닫히도록
// 구현한다.
export function AiRecommendSheet({
  items,
  onSelectItem,
  onClose,
}: {
  items: NearbyItem[];
  onSelectItem: (item: NearbyItem) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[480px] max-h-[70vh] md:max-h-[60vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">✨ AI가 추천하는 나들이 장소</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            추천할 장소를 찾지 못했어요. 반경 내 데이터가 부족해요.
          </div>
        ) : (
          <ItemListPanel items={items} selectedId={null} onSelect={onSelectItem} />
        )}
      </div>
    </div>
  );
}
