'use client';

import { useEffect, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDistance } from '@/lib/spaces/format';

// [지도 마커 인터랙션 — 마커에 붙는 프리뷰 카드](2026-09-10 사용자 지시): "마커 클릭시
// 프리뷰 카드는 마커 위에 떠서 마커랑 같이 이동해야 한다(가운데 고정으로 뜨면 마커랑
// 따로 노는 것처럼 보임). PC에서는 클릭이 아니라 마커에 호버하면 프리뷰가 뜨고,
// 클릭 시 상세 카드가 뜬다." — 이 카드는 이제 KakaoMapView가 마커 좌표에 앵커한
// CustomOverlay 안(포털)으로 렌더링된다. 따라서 이 컴포넌트는 화면 고정 위치
// 래퍼를 갖지 않고, 마커 바로 위에 뜨는 말풍선(아래쪽 꼬리) 카드 그 자체다.
//
// [프리뷰 카드에 대표 이미지/핵심 뱃지](2026-09-08 개선사항3-4): DetailModal과 동일한
// 공개 엔드포인트(/api/spot-curations)를 가볍게 한 번 호출해 대표 이미지/뱃지를
// 보여준다. 실패/큐레이션 없음이면 카테고리 색상 아이콘으로 조용히 폴백(제5장 제11조).
type PreviewCuration = { image_url: string | null; badge_labels: string[] };

export function MarkerPreviewCard({
  item,
  deal = null,
  onOpenDetail,
  onClose,
  onMouseEnter,
  onMouseLeave,
}: {
  item: NearbyItem;
  // [제휴 상품 ↔ 스팟픽 마커 연동](2026-09-10 개선사항6): 연동 제휴 상품이 있으면 "🔥".
  deal?: { title: string; bookingUrl: string } | null;
  onOpenDetail: () => void;
  onClose: () => void;
  // PC 호버 유지용 — 마커에서 카드로 마우스를 옮기는 사이 카드가 사라지지 않게 한다.
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const meta = getCategoryMeta(item.category);
  const [curation, setCuration] = useState<PreviewCuration | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCuration(null);
    fetch(`/api/spot-curations?spot_id=${encodeURIComponent(item.id)}`)
      .then((res) => res.json())
      .then((data: { item?: PreviewCuration | null }) => {
        if (!cancelled) setCuration(data.item ?? null);
      })
      .catch(() => {
        // 조회 실패해도 카드 자체는 계속 보여줘야 하므로 아이콘 폴백으로 둔다.
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  // 카드가 좁아 핵심 뱃지 2개까지만.
  const coreBadges = (curation?.badge_labels ?? []).slice(0, 2);

  return (
    // 부모(previewEl)는 마커 꼭지 지점의 0×0 기준점 — 카드는 그 위쪽에 뜨도록
    // absolute + bottom(=기준점) 기준으로 배치하고 아래로 말꼬리를 단다.
    <div
      className="absolute bottom-9 left-1/2 w-64 -translate-x-1/2"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="relative rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="미리보기 닫기"
          className="absolute top-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-400 shadow hover:text-gray-600"
        >
          ✕
        </button>
        {/* 카드 전체가 상세 진입 타겟(모바일 탭 / PC는 마커 클릭으로도 진입). */}
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`${item.name} 상세보기`}
          className="flex w-full items-center gap-3 p-3 pr-8 text-left"
        >
          {curation?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={curation.image_url} alt={item.name} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-2xl"
              style={{ backgroundColor: `${meta.color}22` }}
              aria-hidden
            >
              🖼️
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-sm font-semibold text-gray-900">
                {deal && <span className="mr-1 text-amber-500">🔥</span>}
                {item.name}
              </p>
              {item.distance_meters >= 0 && (
                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  🧭 {formatDistance(item.distance_meters)}
                </span>
              )}
            </div>
            {item.address && <p className="truncate text-xs text-gray-500">{item.address}</p>}
            {coreBadges.length > 0 && (
              <div className="mt-1 flex gap-1">
                {coreBadges.map((label) => (
                  <span
                    key={label}
                    className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </button>
      </div>
      {/* 아래쪽 꼬리(말풍선) — 마커를 가리킨다. */}
      <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r border-gray-200 bg-white" />
    </div>
  );
}
