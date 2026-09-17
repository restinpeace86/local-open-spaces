'use client';

import { CuratedItem } from '@/components/home/best-pick-slider';
import { useBackdropDismiss } from '@/lib/admin/use-backdrop-dismiss';

// [제휴 상품 상세 뷰 도입](2026-09-17 사용자 지시, todo.md [개선사항 2]): "메인 피드의
// 프리뷰 카드를 클릭했을 때 곧바로 외부 링크로 이동하는 대신, 내부 상세 뷰를 거쳐
// 상품 정보를 충분히 확인한 뒤 외부 구매 링크로 이동하는 구조" — 카드(BestPickSlider)
// 클릭 → 이 모달 오픈 → 하단 고정 CTA로만 외부 이동한다.
//
// [상세 설명 영역 세로 공간 확보](2026-09-17 지시: "관리자화면에서 봤을때 상세 설명을
// 보는 영역이 좀 좁아보이는 느낌... 상세 정보 뷰에서 해당 영역을 좀 길게 잡아서") —
// 관리자 등록 폼(curated-item-form-modal.tsx)의 textarea(rows=4)는 입력용이라 좁은 게
// 당연하지만, 이 유저용 열람 화면은 스크롤 가능한 본문 영역 전체를 설명에 쓸 수 있게
// max-h를 넉넉히 잡는다(아래 8단이 아니라 이미지/타이틀/퀵인포만 지나면 바로 설명).
//
// [상품 성격 뱃지 제안](todo.md [개선사항 2] "상품 성격에 따른 뱃지 필요한가? 제안할
// 것"): BestPickSlider 카드와 동일한 기준(operation_end_date 유무)의 배지를 그대로
// 재사용한다 — 카드에서 본 배지와 상세에서 다른 배지가 뜨면 혼란스럽다(일관성).
function periodBadgeLabel(item: CuratedItem): string {
  return item.operation_end_date ? '⏰ 기간한정' : '🧸 상시';
}

function formatPeriodLabel(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) return start === end ? start : `${start} ~ ${end}`;
  return end ? `~ ${end}` : `${start} ~`;
}

// 👶 타겟 포인트: 개별 상품마다 에디터 코멘트를 저장하는 컬럼을 새로 만들기보다(제5장
// 제7조 — 지금 필요한 것 이상으로 확장하지 않음), 이미 두 섹션 타이틀 아래 쓰고 있는
// 고정 부제 문구(홈 화면, home-view.tsx)를 그대로 재사용한다 — 섹션이 나뉜 이유 자체가
// "이 상품이 어떤 성격인지"라, 성격별 부제가 곧 그 성격에 맞는 타겟 코멘트다.
function targetPointNote(item: CuratedItem): string {
  return item.operation_end_date
    ? '아이와 함께 가기 좋은 한정기간 추천 픽이에요.'
    : '마감 걱정 없이, 아이와 언제든 떠날 수 있는 스테디셀러예요.';
}

export function CuratedItemDetailModal({ item, onClose }: { item: CuratedItem; onClose: () => void }) {
  const backdropDismiss = useBackdropDismiss(onClose);
  const period = formatPeriodLabel(item.operation_start_date, item.operation_end_date);
  const locationLabel = item.spot?.name ?? null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[70] flex items-end md:items-center justify-center"
      {...backdropDismiss}
    >
      <div
        className="relative w-full md:w-[480px] max-h-[85vh] md:max-h-[80vh] bg-white rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto">
          {/* 1단: 대표 이미지 + 성격 뱃지 */}
          <div className="relative w-full h-48 bg-gray-100 shrink-0">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl" aria-hidden>
                🧭
              </div>
            )}
            <span className="absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full bg-black/60 text-white">
              {periodBadgeLabel(item)}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
            >
              ✕
            </button>
          </div>

          <div className="p-4">
            {/* 2단: 타이틀 + 가격 */}
            <h2 className="text-base font-bold text-gray-900">{item.title}</h2>
            {item.price_display && <p className="mt-1 text-lg font-bold text-gray-900">{item.price_display}</p>}

            {/* 3단: 핵심 메타데이터 퀵 인포 박스 */}
            <div className="mt-3 flex flex-col gap-1.5 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              {locationLabel && <p>📍 {locationLabel}</p>}
              {period && <p>⏰ {period}</p>}
              <p>👶 {targetPointNote(item)}</p>
            </div>

            {/* 4단: 상세 설명 — 좁아 보이지 않도록 넉넉한 세로 공간을 준다. */}
            {item.description && (
              <div
                className="mt-4 text-sm text-gray-700 [&_img]:max-w-full [&_img]:rounded-lg"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: item.description }}
              />
            )}
          </div>
        </div>

        {/* 5단: 하단 고정 CTA — 스크롤과 무관하게 항상 보인다. */}
        <div className="shrink-0 border-t border-gray-100 p-3">
          <a
            href={item.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-xl bg-blue-600 text-white text-sm font-semibold text-center py-3"
          >
            예매하러 바로가기 ↗
          </a>
        </div>
      </div>
    </div>
  );
}
