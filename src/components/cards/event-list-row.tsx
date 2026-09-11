'use client';

import { useEffect, useRef } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getParentalBadges } from '@/lib/spaces/parental-badges';
import { formatDateRange, formatDistance, formatReservationPeriod } from '@/lib/spaces/format';

// [개선사항3](2026-09-11 사용자 지시, implementation/todo.md): "전체보기" 바텀시트 4곳
// (이벤트픽 대/중분류 선택 바텀시트=MajorCategoryGrid, "지금 이 순간 함께하기 좋은 알찬
// 픽"/"놓치면 후회하는 인기 만점 예약 픽"/"오늘 전체보기"=EventBrowseSheet)이 각자
// EventCard/FeedCard(이미지 포함 2~3열 그리드)를 쓰고 있었다 — "카드별 이미지 렌더링
// 로직을 완전히 제거해 대량 리스트 렌더링 시 버벅임(지연)이 없도록 성능 최적화"하는
// 이미지 없는 1열 리스트로 통일한다. EventCard/FeedCard 자체는 다른 화면(가로 슬라이더
// 등)에서 계속 이미지가 필요한 채로 쓰이므로 건드리지 않고(제5장 제4조 기존 구조 우선),
// 이 목적 전용 신규 컴포넌트를 추가한다.
//
// 요구사항 원문 그대로 4단 라인 구조를 유지한다:
// 1) 제목(왼쪽, Bold) + 현재 위치와의 거리(오른쪽, 서브 텍스트)
// 2) 뱃지 영역(카테고리 + 상태 뱃지)
// 3) 행사/운영기간
// 4) 예약기간
// 3/4번째 줄은 해당 데이터가 없으면(예: 상시 운영 공간에 예약기간이 없는 경우) 그 줄
// 자체를 생략한다 — 없는 정보를 지어내지 않는다(제3장 제5조 추측 금지, EventCard의
// 기존 조건부 렌더링 패턴과 동일).
// [전체보기 목록 복귀 포커스](2026-09-12 사용자 지시): "상세카드 취소시 바로 전단계인
// 리스트 목록 열리고 방금전에 누른 리스트가 포커스되어야 하는데.. 그냥 사라져버리고
// 이벤트픽 화면이 뜬다" — 상세카드에서 취소해 목록으로 돌아왔을 때 방금 눌렀던 행을
// 시각적으로 표시(테두리 강조)하고 화면 안으로 스크롤해 준다. isFocused는 부모
// (EventBrowseSheet/MajorCategoryGrid)가 "마지막으로 선택한 item.id"와 비교해 넘긴다.
export function EventListRow({
  item,
  onSelect,
  isFocused = false,
}: {
  item: NearbyItem;
  onSelect: (item: NearbyItem) => void;
  isFocused?: boolean;
}) {
  const meta = getCategoryMeta(item.category);
  const badges = getParentalBadges(item);
  const period = formatDateRange(item.start_date, item.end_date);
  // event-status.ts getEventStatus와 동일한 조건(시작/종료일이 둘 다 없음)일 때만 "상시"로
  // 간주한다 — 실제 이벤트는 start_date/end_date가 NOT NULL이라 이 분기에 오지 않고,
  // open_spaces 공유 항목(캠핑장 등)만 해당한다(실측 확인, 기존 로직 재사용).
  const periodLabel = period ?? (!item.start_date && !item.end_date ? '상시' : null);
  const reservationPeriod = formatReservationPeriod(item.reservation_start_date, item.reservation_end_date);

  const rowRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    // jsdom(테스트 환경)에는 scrollIntoView 구현체가 없어 존재 여부를 방어적으로
    // 확인한다(제5장 제11조 — 없는 환경에서도 화면이 죽지 않아야 함).
    if (isFocused && typeof rowRef.current?.scrollIntoView === 'function') {
      rowRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isFocused]);

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={() => onSelect(item)}
      className={`w-full text-left rounded-xl border px-3 py-2.5 hover:shadow-md transition-shadow flex flex-col gap-1 ${
        isFocused ? 'border-blue-300 ring-2 ring-blue-200 bg-blue-50/50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-gray-900 line-clamp-1">{item.name}</p>
        {item.distance_meters >= 0 && (
          <span className="shrink-0 text-xs text-gray-400">{formatDistance(item.distance_meters)}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white"
          style={{ backgroundColor: meta.color }}
        >
          {item.category_min ?? meta.label}
        </span>
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
      {periodLabel && <p className="text-xs text-gray-400 line-clamp-1">🗓 {periodLabel}</p>}
      {reservationPeriod && <p className="text-xs text-gray-400 line-clamp-1">📌 예약 {reservationPeriod}</p>}
    </button>
  );
}
