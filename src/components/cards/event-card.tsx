'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { getEventStatus, getDateBannerBadge, getReservationAvailabilityTag } from '@/lib/spaces/event-status';
import { formatDateRange, formatVenueLine } from '@/lib/spaces/format';

// spec/event/event-card.md 준용 신규 카드 (Task 9-1) — 기존에는 이벤트 전용 카드가 없었고
// ItemListPanel의 리스트 행으로만 표현됐다. 썸네일/상태 뱃지/예약 마감 경고를 갖춘
// 독립 카드 형태가 필요해 새로 만든다(기존 SpaceGridCard는 공간 전용 필드 구성이라 그대로 못 씀).
// [카드 뱃지 문구 정리](2026-08-27 사용자 지시): "현재 이용 가능"/"예약 가능" 슬라이더에서는
// 키즈/어린이 뱃지를 빼 달라는 요청 — EventCard는 카테고리 그리드/검색/무료 피드 등 여러
// 화면에서 공유하는 컴포넌트라(제5장 제4조 기존 구조 우선) 전역으로 뺄 수 없다. 특정 배지
// key만 선택적으로 숨기는 옵션을 추가해 호출부(ReservationOpenSlider)에서만 적용한다.
// [이벤트픽 UX/UI 개선](2026-08-29 사용자 지시): 가로 슬라이드에서 뱃지 유무/타이틀 줄바꿈에
// 따라 카드 높이가 제각각이라 스와이프 시 흔들려 보였다 — 버튼에 h-full을 추가해 부모가
// 정한 높이(그리드/플렉스 기본 stretch 정렬로 이미 형제 중 가장 큰 높이만큼 늘어난 래퍼)를
// 그대로 채우게 하고, 타이틀에는 min-h로 2줄 분량을 항상 예약해 1줄짜리 제목도 흔들리지
// 않게 한다. 부모가 높이를 지정하지 않는 기존 화면(그리드/오늘 전체보기 등)에서는 h-full이
// height:auto와 동일하게 동작해 기존 모습에 영향이 없다.
// [EventCard 이미지:텍스트 4:6 포션 고정](2026-08-29 사용자 지시): 기존에는 이미지 영역을
// aspect-[16/9](가로세로 비율 기반)로 잡아 카드 실제 높이(h-64 등)와 무관하게 이미지 자체
// 비율로 높이가 정해졌다 — 이제 이미지/텍스트 두 영역을 flex-[4]/flex-[6]로 명시해 카드의
// 고정 높이를 정확히 40:60으로 나눈다. 텍스트 영역에 min-h-0 + overflow-hidden을 준 것은
// flex 아이템의 기본값(min-height:auto)이 내용물 크기만큼은 줄어들지 않으려는 것을 막기
// 위함이다 — 이게 없으면 뱃지+제목+장소+날짜가 많은 카드에서 텍스트 영역이 60%를 넘겨
// 버튼 전체 높이가 h-64보다 커져 버릴 수 있다(사용자 확인: 이미지 위 뱃지/마감임박 배너는
// 그대로 오버레이 유지, 텍스트 영역으로 옮기지 않음).
export function EventCard({
  item,
  onSelect,
  hideBadgeKeys = [],
}: {
  item: NearbyItem;
  onSelect: (item: NearbyItem) => void;
  hideBadgeKeys?: string[];
}) {
  const meta = getCategoryMeta(item.category);
  const badges = getParentalBadges(item).filter((badge) => !hideBadgeKeys.includes(badge.key));
  const status = getEventStatus(item);
  const dateBanner = getDateBannerBadge(item);
  const reservationTag = getReservationAvailabilityTag(item);
  const period = formatDateRange(item.start_date, item.end_date);
  // Task 9-1-3: "[장소명] · [시/군/구]" (예: "율동공원 야외무대 · 성남시 분당구")
  const venueLine = formatVenueLine(item.address, item.sigungu_name);

  // event-card.md 2: 예약 마감 임박(오늘까지)이면 붉은 경고 뱃지를 최우선 노출
  const showReservationAlert = item.is_reservation_required === true && status.label === '오늘 마감';

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="h-full text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      {dateBanner && (
        <div
          className={`px-2 py-1 text-[11px] font-bold text-white text-center ${
            dateBanner.kind === 'today_only' ? 'bg-amber-500' : 'bg-rose-600'
          }`}
        >
          {dateBanner.label}
        </div>
      )}
      <div className="relative flex-[4] bg-gray-100">
        {item.thumbnail_url ? (
          // Task 9-3-1(2026-08-22): 이 카드는 항상 하단 피드(가성비 행복/무료·공공)에서만 쓰여
          // 뷰포트 아래에 있으므로 항상 지연 로드한다.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-3xl"
            style={{ backgroundColor: `${meta.color}22` }}
            aria-hidden
          >
            🖼️
          </div>
        )}
        {/* [카드 표준 중분류 표시](2026-08-27 사용자 지시): 5대 UI 카테고리(event_type 기반,
            예: "체험·클래스") 대신 실제 표준 중분류(category_min, 예: "도시농업")를 보여준다.
            색상은 기존처럼 meta.color(5대 카테고리 색 코딩)를 그대로 쓴다 — 중분류 자체는
            색이 없어 상위 대분류 색으로 시각적 구분을 유지한다. category_min이 없으면(이론상
            이벤트픽 3대 조건상 발생하지 않지만 방어적으로) 기존 라벨로 폴백한다. */}
        <span
          className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: meta.color }}
        >
          {item.category_min ?? meta.label}
        </span>
        <span className="absolute top-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
          {status.label}
        </span>
      </div>

      <div className="p-3 flex-[6] min-h-0 overflow-hidden flex flex-col gap-1.5">
        {showReservationAlert && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white self-start">
            🚨 오늘 예약 마감
          </span>
        )}
        <p className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">{item.name}</p>
        {venueLine && <p className="text-xs text-gray-400 line-clamp-1">{venueLine}</p>}
        {period && <p className="text-xs text-gray-400 line-clamp-1">{period}</p>}
        {reservationTag && (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full self-start ${
              reservationTag.tone === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {reservationTag.label}
          </span>
        )}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <span
                key={badge.key}
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  badge.emphasis ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
