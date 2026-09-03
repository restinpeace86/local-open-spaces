'use client';

import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { getEventStatus, getDateBannerBadge } from '@/lib/spaces/event-status';
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
// [EventCard 이미지:텍스트 포션 고정](2026-08-29 사용자 지시, 2026-09-03 비율 조정):
// 기존에는 이미지 영역을 aspect-[16/9](가로세로 비율 기반)로 잡아 카드 실제 높이
// (h-64 등)와 무관하게 이미지 자체 비율로 높이가 정해졌다 — 이제 이미지/텍스트 두
// 영역을 flex-[N]으로 명시해 카드의 고정 높이를 정확한 비율로 나눈다. 텍스트 영역에
// min-h-0 + overflow-hidden을 준 것은 flex 아이템의 기본값(min-height:auto)이 내용물
// 크기만큼은 줄어들지 않으려는 것을 막기 위함이다 — 이게 없으면 뱃지+제목+장소+날짜가
// 많은 카드에서 텍스트 영역이 비율을 넘겨 버튼 전체 높이가 카드 높이보다 커져 버릴 수
// 있다(사용자 확인: 이미지 위 뱃지/마감임박 배너는 그대로 오버레이 유지, 텍스트
// 영역으로 옮기지 않음).
// [비율 5:5로 조정](2026-09-03 사용자 지시): 원래 4:6이었으나, 무료/유료·실내야외
// 뱃지를 이미지 오버레이로 옮기면서(바로 아래 "[카드 높이/뱃지 정리]" 참고) 텍스트
// 영역에 필요한 공간이 줄어든 만큼, 상대적으로 커진 이미지 영역이 잘 활용되도록
// flex-[4]/flex-[6] → flex-[5]/flex-[5]로 바꿨다.
// [카드 내 이미지/텍스트 영역 비율 불일치 수정 1차 시도](2026-08-30): dateBanner(오늘
// 한정/오늘 마감, 당일 종료 이벤트에만 뜸)를 flex-col의 별도 행에서 이미지 영역 위
// 절대 위치 오버레이로 옮겼다 — 이 자체는 유효한 개선이라 유지하지만, Playwright로
// 실제 렌더링 높이를 실측해 보니 진짜 원인이 아니었다(배너 유무와 무관하게 여전히
// 카드마다 이미지 높이가 92px~224px로 제각각이었음, 아래 2차 원인 참고).
//
// [카드 내 이미지/텍스트 영역 비율 불일치 진짜 원인 및 수정 2차](2026-08-30 사용자 재확인):
// 이미지 영역 div(flex-[4])에 min-h-0이 빠져 있었다 — flex 아이템의 기본값
// min-height:auto는 내용물의 min-content 크기 밑으로는 줄어들지 않으려 하는데,
// <img>(교체 요소)의 min-content 크기는 그 이미지의 **실제 원본 가로세로 비율**을
// 폭(w-full, w-40 카드 기준 고정폭)에 대입한 높이다. 즉 원본 이미지 비율이 제각각인
// 썸네일마다 이미지 영역이 flex-[4]가 지정한 40%가 아니라 "그 이미지의 실제 비율이
// 요구하는 높이"로 늘어나 버렸고, 텍스트 영역(flex-[6], 이쪽은 이미 min-h-0이 있어
// 정상)은 남은 공간만큼만 줄어들어 카드 전체 높이(h-64)는 항상 256px로 같아도 내부
// 이미지:텍스트 분할은 카드마다 완전히 달랐다(실측: 92:162, 223:31, 224:30 등). 이미지
// 영역에도 min-h-0을 추가해 flex-[4]/flex-[6] 비율이 이미지 내용물과 무관하게 항상
// 정확히 지켜지도록 고쳤다(Playwright로 실제 브라우저 렌더링 높이를 재측정해 8장 카드
// 전부 102px:154px로 고정됨을 확인 — 상세 검증 로그는 구현 기록 참고).
// [카드 높이/뱃지 정리](2026-09-03 사용자 지시): "카드 세로 높이가 길고 뱃지가 중구난방"
// — 실측으로 두 가지 원인을 찾았다.
//   ① `showReservationAlert`("🚨 오늘 예약 마감")는 `status.label === '오늘 마감'`일
//      때만 뜨는데, 바로 그 값이 이미지 위 오버레이(top-right)로도 항상 노출된다 —
//      같은 정보를 문구만 바꿔 텍스트 영역에 한 번 더 보여주던 순수 중복이라 제거한다.
//   ② `reservationTag`("📋 사전예약필요"/"✅ 예약불필요 · 현장방문")는 DetailModal에
//      이미 동일한 정보가 표시되고 있어(detail-modal.tsx) 카드에서 빼도 정보 손실이
//      없다 — 목록 카드는 "고를지 말지 판단할 핵심 정보"만, 나머지는 상세에서 보도록
//      정리한다.
// 남은 뱃지 중 무료/유료(is_free)와 실내/야외(facility_type)는 이미지 위 하단 좌/우
// 오버레이로 옮긴다 — 텍스트 영역의 줄 수를 늘리지 않고(이미지 영역은 뱃지가 몇 개든
// 높이가 그대로다) 정보는 그대로 유지한다. 텍스트 영역에는 접수 임박(booking_status)/
// 키즈 대상 뱃지만 남아 최대 2개로 줄었다.
const IMAGE_OVERLAY_BADGE_KEYS = new Set(['is_free', 'facility_type']);

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
  const allBadges = getParentalBadges(item).filter((badge) => !hideBadgeKeys.includes(badge.key));
  const imageBadges = allBadges.filter((badge) => IMAGE_OVERLAY_BADGE_KEYS.has(badge.key));
  const textBadges = allBadges.filter((badge) => !IMAGE_OVERLAY_BADGE_KEYS.has(badge.key));
  const priceBadge = imageBadges.find((badge) => badge.key === 'is_free');
  const facilityBadge = imageBadges.find((badge) => badge.key === 'facility_type');
  const status = getEventStatus(item);
  const dateBanner = getDateBannerBadge(item);
  const period = formatDateRange(item.start_date, item.end_date);
  // Task 9-1-3: "[장소명] · [시/군/구]" (예: "율동공원 야외무대 · 성남시 분당구")
  const venueLine = formatVenueLine(item.address, item.sigungu_name);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="h-full text-left rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-md transition-shadow flex flex-col"
    >
      <div className="relative flex-[5] min-h-0 bg-gray-100">
        {dateBanner && (
          <div
            className={`absolute top-0 left-0 right-0 z-10 px-2 py-1 text-[11px] font-bold text-white text-center ${
              dateBanner.kind === 'today_only' ? 'bg-amber-500' : 'bg-rose-600'
            }`}
          >
            {dateBanner.label}
          </div>
        )}
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
          className={`absolute ${dateBanner ? 'top-8' : 'top-2'} left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full text-white`}
          style={{ backgroundColor: meta.color }}
        >
          {item.category_min ?? meta.label}
        </span>
        <span
          className={`absolute ${dateBanner ? 'top-8' : 'top-2'} right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white`}
        >
          {status.label}
        </span>
        {/* [카드 높이/뱃지 정리](2026-09-03 사용자 지시): 무료/유료·실내/야외는 이미지
            하단 좌/우 오버레이로 — 텍스트 영역 줄 수를 늘리지 않는다. */}
        {priceBadge && (
          <span className="absolute bottom-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
            {priceBadge.label}
          </span>
        )}
        {facilityBadge && (
          <span className="absolute bottom-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/60 text-white">
            {facilityBadge.label}
          </span>
        )}
      </div>

      <div className="p-3 flex-[5] min-h-0 overflow-hidden flex flex-col gap-1.5">
        <p className="text-sm font-medium text-gray-900 line-clamp-2 min-h-[2.5rem]">{item.name}</p>
        {venueLine && <p className="text-xs text-gray-400 line-clamp-1">{venueLine}</p>}
        {period && <p className="text-xs text-gray-400 line-clamp-1">{period}</p>}
        {textBadges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {textBadges.map((badge) => (
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
