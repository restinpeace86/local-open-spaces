'use client';

import { useEffect, useState } from 'react';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { formatDistance } from '@/lib/spaces/format';

// [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1 "지도 마커 인터랙션 2단계 UX
// 개편(표준 지도 앱 방식)": 마커 클릭 즉시 무거운 전체 상세 모달을 띄우지 않고, 먼저
// 썸네일/장소명/간단 주소만 담은 가벼운 말풍선형 카드를 보여준다. 이 카드를 한 번 더
// 터치해야만(2단계) 전체 상세 모달로 들어간다(map-explorer.tsx가 onOpenDetail에서
// selectedItem을 세팅해 DetailModal을 연다).
//
// [프리뷰 카드에 대표 이미지/핵심 뱃지 추가](2026-09-08 사용자 지시, todo.md
// 개선사항3-4): "[요약 프리뷰 카드] (대표 이미지, 이름, 핵심 뱃지)" — 예전엔
// "가벼운 1단계 카드의 취지에 맞게 별도 네트워크 요청 없이" 카테고리 색상
// 아이콘만 보여줬는데, 이번 지시가 실제 대표 이미지/뱃지를 명시적으로 요구해
// DetailModal과 동일한 공개 엔드포인트(/api/spot-curations)를 가볍게 한 번
// 호출한다(단건 조회라 부담은 크지 않음). 큐레이션이 없거나 조회 실패하면
// 기존처럼 카테고리 색상 아이콘으로 조용히 폴백한다(제5장 제11조).
type PreviewCuration = { image_url: string | null; badge_labels: string[] };

export function MarkerPreviewCard({
  item,
  onOpenDetail,
  onClose,
}: {
  item: NearbyItem;
  onOpenDetail: () => void;
  onClose: () => void;
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
        // 조회 실패해도 카드 자체는 계속 보여줘야 하므로 기존 아이콘 폴백으로 둔다.
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  // 핵심 뱃지만 간단히 — 카드가 좁아 2개까지만 보여준다.
  const coreBadges = (curation?.badge_labels ?? []).slice(0, 2);

  return (
    // [마커 미리보기 카드가 바텀시트를 가리는 문제 수정](2026-09-05 사용자 지시): "지도에
    // 마커 누르면 하단에 정보가 뜨는데.. 하단의 바텀시트를 가리게 됨.. 마커 위에 뜨게
    // 하던가.." 모바일 바텀시트(map-explorer.tsx)는 화면 바닥에서 bottom-16(64px) 띄운
    // 위치에, 접힌 상태 높이가 112px다 — 즉 시트 윗면은 화면 바닥에서 64+112=176px
    // 지점에 있다. 기존 bottom-4(16px)로는 이 카드가 시트 윗면(핸들/"목록 보기" 버튼)을
    // 그대로 덮었다. 시트 윗면보다 위(184px, 8px 여유)로 옮겨 마커 대신 "바텀시트 바로
    // 위"에 뜨도록 한다 — 데스크톱은 이 모바일 전용 바텀시트가 없어(별도 사이드 패널
    // 구조) 기존 위치(md:bottom-4)를 그대로 유지한다.
    <div className="absolute left-3 right-3 bottom-[184px] z-30 md:left-1/2 md:right-auto md:bottom-4 md:-translate-x-1/2 md:w-96">
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="미리보기 닫기"
          className="absolute top-1.5 right-1.5 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-white/90 text-gray-400 shadow hover:text-gray-600"
        >
          ✕
        </button>
        {/* 요구사항 "카드 터치 시 상세 모달 진입" — 카드 전체가 하나의 터치 타겟이다.
            위로 스와이프해서 여는 동작(요구사항 예시 "위로 올릴 때")까지는 이 MVP
            단계에서 제스처로 구현하지 않았다 — 탭으로 동일한 결과에 도달할 수 있다. */}
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`${item.name} 상세보기`}
          className="w-full flex items-center gap-3 p-3 pr-8 text-left"
        >
          {curation?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={curation.image_url}
              alt={item.name}
              className="shrink-0 w-14 h-14 rounded-xl object-cover"
            />
          ) : (
            <div
              className="shrink-0 w-14 h-14 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${meta.color}22` }}
              aria-hidden
            >
              🖼️
            </div>
          )}
          <div className="flex-1 min-w-0">
            {/* [마커 카드 ↔ 상세 카드 일원화](2026-09-10 개선사항2-6): 상호명 + 거리
                한 줄, 주소 다음 줄, 맞춤형 뱃지. 구형 레거시 라벨(meta.label)은 더
                이상 폴백으로 쓰지 않는다(개선사항2-2·3-2). */}
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
              {item.distance_meters >= 0 && (
                <span className="shrink-0 text-xs font-semibold text-blue-600">
                  🧭 {formatDistance(item.distance_meters)}
                </span>
              )}
            </div>
            {item.address && <p className="text-xs text-gray-500 truncate">{item.address}</p>}
            {coreBadges.length > 0 && (
              <div className="mt-1 flex gap-1">
                {coreBadges.map((label) => (
                  <span
                    key={label}
                    className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
                  >
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="shrink-0 text-gray-300" aria-hidden>
            ▲
          </span>
        </button>
      </div>
    </div>
  );
}
