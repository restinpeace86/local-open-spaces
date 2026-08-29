'use client';

import { Deal } from '@/components/cards/deal-card';

// [제휴 특가 Deals 시스템 및 수집 어댑터 MVP](2026-08-29 사용자 지시) 요구사항 3: 특가 카드
// 상세 모달 — 상품 설명/가격 정보를 보여주고, 하단에 제휴 마케팅 필수 안내 문구와 함께
// [특가로 구매하러 가기] 버튼(외부 제휴 링크 새 창 오픈)을 둔다. DetailModal(스팟/이벤트
// 전용, NearbyItem 형태)과는 데이터 모양이 달라(위치/일정 없음) 별도 컴포넌트로 둔다 —
// 배경 클릭/X 버튼으로 닫히는 기존 바텀시트 관례(reservation-request-modal.tsx 등)는 그대로
// 따른다.
const AFFILIATE_DISCLOSURE =
  '이 포스팅은 제휴 링크를 포함하며, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.';

function formatWon(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function DealDetailModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[420px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[16/9] bg-gray-100">
          {deal.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={deal.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl bg-rose-50" aria-hidden>
              🏷️
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <h2 className="text-lg font-bold text-gray-900">{deal.title}</h2>
          {deal.description && <p className="text-sm text-gray-600 whitespace-pre-line">{deal.description}</p>}

          <div className="flex items-center gap-2">
            {deal.discount_rate > 0 && <span className="text-base font-bold text-rose-600">{deal.discount_rate}%</span>}
            <span className="text-xl font-bold text-gray-900">{formatWon(deal.discount_price)}</span>
            <span className="text-sm text-gray-400 line-through">{formatWon(deal.original_price)}</span>
          </div>

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">{AFFILIATE_DISCLOSURE}</p>

          <a
            href={deal.affiliate_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 rounded-lg bg-rose-600 text-white text-sm font-semibold py-3 text-center"
          >
            🛍️ 특가로 구매하러 가기
          </a>
        </div>
      </div>
    </div>
  );
}
