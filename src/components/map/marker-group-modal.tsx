'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { ItemListPanel } from '@/components/map/item-list-panel';
import { useModalBackClose } from '@/hooks/use-modal-back-close';

// [겹친 마커 처리](2026-08-29 사용자 지시): 원본 데이터가 동일 좌표를 공유하는 경우(예:
// 아파트 단지 내 개별 놀이터가 단지 대표 주소 좌표로만 등록된 경우) 지도에서 마커가 완전히
// 겹쳐 맨 위 1개만 보이고 클릭되는 문제가 있었다. 이 모달은 같은 좌표의 마커를 클릭했을 때
// 그 좌표에 있는 전체 목록을 먼저 보여주고, 유저가 그중 하나를 선택하면 기존 상세 모달로
// 이어지도록 한다.
export function MarkerGroupModal({
  items,
  onSelectItem,
  onClose,
  title,
}: {
  items: NearbyItem[];
  onSelectItem: (item: NearbyItem) => void;
  onClose: () => void;
  // [장소 단위 대표 1건 노출 — 그룹 펼쳐보기](2026-09-09 사용자 지시): 같은
  // group_id로 묶인 스팟(예: 난지캠핑장의 예약 옵션들)을 펼쳐볼 때는 "겹친
  // 마커" 문구 대신 더 정확한 문구를 쓸 수 있게 title을 선택적으로 받는다.
  // 생략 시 기존 겹친 마커 문구를 그대로 쓴다(하위 호환).
  title?: string;
}) {
  useModalBackClose(onClose);

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
          <h2 className="text-sm font-semibold text-gray-900">{title ?? `이 위치에 ${items.length}건이 있어요`}</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <ItemListPanel items={items} selectedId={null} onSelect={onSelectItem} />
      </div>
    </div>
  );
}
