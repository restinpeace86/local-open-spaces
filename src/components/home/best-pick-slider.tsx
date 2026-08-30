'use client';

// [홈 화면 큐레이션 섹션 추가 및 상단 탭 정리](2026-08-30 사용자 지시): "이번 주말 실패
// 없는 베스트 나들이 픽" 가로 슬라이드 섹션. "광고 느낌을 지우고 신뢰감 있는 큐레이션"
// 컨셉이라 할인율 뱃지 등 세일즈성 장식은 넣지 않고 썸네일/타이틀만 담백하게 보여준다.
// 카드를 누르면 상세 모달 없이 곧바로 booking_url을 새 창으로 연다(중간 단계 없음).
//
// [관리자 화면 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30 사용자 지시): 데이터
// 소스가 event_tickets(축제/체험 전용, description/location_name/가격 필드 등 도메인
// 특화 컬럼)에서 curated_items(쿠팡 등 임의의 제휴 상품까지 다루는 범용 테이블)로
// 바뀌면서 location_name이 스키마에서 사라졌다 — 카드 하단은 이제 제목 한 줄(2줄
// 클램프)만 보여준다(더 단순해져 이전 세션의 "비율 고정" 문제도 자연히 사라짐).
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
};

// [큐레이션 카드 내부 '이미지 vs 텍스트' 영역 비율 고정](2026-08-30 사용자 지시): 카드
// 자체의 크기(폭/높이)는 바깥 래퍼(w-36 h-[220px], ReservationOpenSlider와 동일한
// "래퍼가 고정 크기를 잡고 안쪽 카드는 h-full로 채우는" 기존 관례)에서 고정하고, 카드
// 내부는 `flex flex-col h-full`로 세로 배치한다. 이미지 영역은 h-36(폭과 동일해 정사각에
// 가까움)로 고정 높이를 주고 `w-full h-full object-cover`로 어떤 이미지든 비율이 깨지지
// 않게 채운다. 텍스트 영역은 `flex-1 min-h-0 overflow-hidden`로 이미지가 차지하고 남은
// 공간을 정확히 채우되 절대 카드 밖으로 넘치지 않는다.
const CARD_WIDTH_CLASS = 'w-36';
const CARD_HEIGHT_CLASS = 'h-[220px]';
const IMAGE_HEIGHT_CLASS = 'h-36';

export function BestPickSlider({ items }: { items: CuratedItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory">
      {items.map((item) => (
        <div
          key={item.id}
          className={`shrink-0 ${CARD_WIDTH_CLASS} ${CARD_HEIGHT_CLASS} snap-start [scroll-snap-stop:always]`}
        >
          <a
            href={item.booking_url}
            target="_blank"
            rel="noopener noreferrer"
            className="h-full flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow"
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
            </div>
            <div className="flex-1 min-h-0 p-2.5 overflow-hidden flex flex-col justify-center">
              <p className="text-xs font-medium text-gray-900 line-clamp-2">{item.title}</p>
            </div>
          </a>
        </div>
      ))}
    </div>
  );
}

const SKELETON_COUNT = 4;

export function BestPickSliderSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto px-4 pb-1" role="status" aria-label="베스트 나들이 픽 불러오는 중">
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
