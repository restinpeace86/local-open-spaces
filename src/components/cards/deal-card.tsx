'use client';

// [제휴 특가 Deals 시스템 및 수집 어댑터 MVP](2026-08-29 사용자 지시): "이벤트픽" 특가·핫딜
// 탭에 나열되는 특가 상품 카드. EventCard(src/components/cards/event-card.tsx)의 이미지:텍스트
// flex-[4]/flex-[6] 고정 비율 레이아웃을 그대로 재사용한다(제5장 제4조 기존 구조 우선) —
// deals는 위치/일정 정보가 없어 카테고리 뱃지/날짜 배너 대신 할인율/가격을 보여준다.
export type Deal = {
  id: string;
  title: string;
  description: string | null;
  original_price: number;
  discount_price: number;
  discount_rate: number;
  image_url: string | null;
  affiliate_url: string;
  is_active: boolean;
  created_at: string;
};

function formatWon(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

export function DealCard({ deal, onSelect }: { deal: Deal; onSelect: (deal: Deal) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(deal)}
      className="h-full text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      <div className="relative flex-[4] bg-gray-100">
        {deal.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl bg-rose-50" aria-hidden>
            🏷️
          </div>
        )}
        {deal.discount_rate > 0 && (
          <span className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-600 text-white">
            {deal.discount_rate}% 할인
          </span>
        )}
      </div>

      <div className="p-3 flex-[6] min-h-0 overflow-hidden flex flex-col gap-1.5">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">{deal.title}</p>
        <div className="mt-auto flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 line-through">{formatWon(deal.original_price)}</span>
          <span className="text-base font-bold text-rose-600">{formatWon(deal.discount_price)}</span>
        </div>
      </div>
    </button>
  );
}
