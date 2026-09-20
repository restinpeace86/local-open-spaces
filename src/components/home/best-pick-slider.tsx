'use client';

// [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시): "이번 주말 실패
// 없는 베스트 나들이 픽" 가로 슬라이드 섹션. "광고 느낌을 지우고 신뢰감 있는 큐레이션"
// 컨셉이라 할인율 뱃지 등 세일즈성 장식은 넣지 않고 썸네일/타이틀만 담백하게 보여준다.
//
// [관리자 화면 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30 사용자 지시): 데이터
// 소스가 event_tickets(축제/체험 전용, description/location_name/가격 필드 등 도메인
// 특화 컬럼)에서 curated_items(쿠팡 등 임의의 제휴 상품까지 다루는 범용 테이블)로
// 바뀌면서 location_name이 스키마에서 사라졌다 — 카드 하단은 이제 제목 한 줄(2줄
// 클램프)만 보여준다(더 단순해져 이전 세션의 "비율 고정" 문제도 자연히 사라짐).
//
// [제휴 상품 성격 이원화 + 상세 뷰 도입](2026-09-17 사용자 지시, todo.md [개선사항 1]
// [개선사항 2]): "이벤트픽 화면에서 제휴상품등록한것들이 다 노출되던 기존 방식"을
// 개선하며 두 가지를 함께 바꾼다.
// 1) price_display/description/spot 컬럼이 새로 생겨(2026-09-17 마이그레이션) 카드에
//    가격/장소 정보를 보여줄 수 있게 됐다 — "다른 영역이랑 비슷한 구조"(EventCard의
//    제목/장소/기간 텍스트 나열)를 참고해 제목 아래 가격/장소/기간을 순서대로 붙인다.
// 2) 카드를 눌러도 곧바로 외부 링크로 나가지 않고, 내부 상세 뷰를 먼저 거치도록
//    `<a>`를 `<button onClick={onSelect}>`로 바꾼다(실제 외부 이동은
//    CuratedItemDetailModal의 CTA 버튼이 담당).
export type CuratedItem = {
  id: string;
  title: string;
  image_url: string | null;
  booking_url: string;
  category: string;
  is_active: boolean;
  operation_start_date: string | null;
  operation_end_date: string | null;
  created_at: string;
  price_display?: string | null;
  description?: string | null;
  spot?: { id: string; name: string; address: string | null } | null;
  // [상시 추천 픽 테마별 분류](2026-09-20 사용자 지시): 상시 티켓(operation_end_date
  // 없음) 섹션을 테마 칩으로 나누기 위한 다중 태그. 기간한정 특가 카드에는 의미가
  // 없지만(그 섹션은 테마 분류 대상이 아님) 타입은 모든 CuratedItem이 공유한다.
  themes?: string[] | null;
};

// [개선사항 2] "상품 성격에 따른 뱃지 필요한가? 제안할 것" — 카드 자체엔 지금까지
// 뱃지가 하나도 없었고([개선사항 3]이 정리하려는 이벤트 카드의 접수중/실내야외 뱃지와는
// 무관), 특가/상시 두 섹션으로 나뉘는 지금은 어느 카드가 어느 성격인지 한눈에 구분되는
// 뱃지 하나 정도는 있는 게 낫다고 판단해 제안 겸 적용했었다.
// [상시 뱃지 제거](2026-09-17 사용자 지시: "아래 상시는 왜붙였어.. 굳이 상시
// 노출하지마") — "언제 가도 좋은 상시 추천 픽" 섹션 자체가 이미 "상시"라는 걸
// 말해주고 있어 카드마다 또 "🧸 상시"를 붙이는 게 중복으로 거슬린다는 지적.
// 기간한정 특가 뱃지(⏰)는 지시 대상이 아니라 그대로 둔다 — 급박함을 전달하는
// 실질적 정보라 섹션 타이틀과 중복이 아니다.
function periodBadge(item: CuratedItem): string | null {
  return item.operation_end_date ? '⏰ 기간한정' : null;
}

function formatPeriodLabel(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  if (start && end) return start === end ? start : `${start} ~ ${end}`;
  return end ? `~ ${end}` : `${start} ~`;
}

const CARD_WIDTH_CLASS = 'w-36';
const CARD_HEIGHT_CLASS = 'h-[220px]';
const IMAGE_HEIGHT_CLASS = 'h-36';

export function BestPickSlider({ items, onSelect }: { items: CuratedItem[]; onSelect: (item: CuratedItem) => void }) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory">
      {items.map((item) => {
        const period = formatPeriodLabel(item.operation_start_date, item.operation_end_date);
        const locationLabel = item.spot?.address ?? item.spot?.name ?? null;
        return (
          <div
            key={item.id}
            className={`shrink-0 ${CARD_WIDTH_CLASS} ${CARD_HEIGHT_CLASS} snap-start [scroll-snap-stop:always]`}
          >
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="w-full h-full flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow text-left"
            >
              <div className={`relative w-full ${IMAGE_HEIGHT_CLASS} shrink-0 bg-gray-100`}>
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl bg-gray-50" aria-hidden>
                    🧭
                  </div>
                )}
                {periodBadge(item) && (
                  <span className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
                    {periodBadge(item)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0 p-2.5 overflow-hidden flex flex-col justify-center gap-0.5">
                <p className="text-xs font-medium text-gray-900 line-clamp-2">{item.title}</p>
                {item.price_display && <p className="text-xs font-bold text-gray-900">{item.price_display}</p>}
                {locationLabel && <p className="text-[11px] text-gray-400 line-clamp-1">{locationLabel}</p>}
                {period && <p className="text-[11px] text-gray-400 line-clamp-1">{period}</p>}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

const SKELETON_COUNT = 4;

export function BestPickSliderSkeleton({ label = '베스트 나들이 픽 불러오는 중' }: { label?: string }) {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1" role="status" aria-label={label}>
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className={`shrink-0 ${CARD_WIDTH_CLASS} ${CARD_HEIGHT_CLASS} rounded-2xl border border-gray-200 bg-gray-100 animate-pulse`}
          aria-hidden
        />
      ))}
    </div>
  );
}
