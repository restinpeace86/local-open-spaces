'use client';

import { useEffect, useState } from 'react';

// [네이버 플레이스 공지 온디맨드 레이더](2026-09-19 사용자 지시): "유저가 스팟 상세
// 페이지뿐만 아니라 이벤트 상세 페이지 및 제휴 상품 상세 페이지에서도 연동된 스팟의
// 최신 상태를 동일하게 체크할 수 있도록" — 3개 진입점(DetailModal의 SPACE/EVENT
// 분기, CuratedItemDetailModal)이 전부 이 훅+컴포넌트 하나를 그대로 재사용한다
// (제5장 제4조 기존 구조 우선 — 진입점마다 fetch/렌더 로직을 복제하지 않음).
export type SpotNotice = {
  id: string;
  curated_title: string | null;
  curated_content: string | null;
  curated_image_url: string | null;
  raw_posted_at: string | null;
  published_at: string | null;
};

// spotId가 없으면(연동된 스팟이 없는 이벤트/제휴상품) 아무것도 하지 않는다 — 발행된
// 공지는 즉시 조회하고, 동시에 온디맨드 레이더를 결과를 기다리지 않고 트리거만
// 해둔다(새로 감지된 원문은 관리자 스테이징함에만 쌓이고 유저 화면과 무관하므로
// 렌더링을 늦출 이유가 없다).
export function usePublishedSpotNotices(spotId: string | null | undefined): SpotNotice[] {
  const [notices, setNotices] = useState<SpotNotice[]>([]);

  useEffect(() => {
    if (!spotId) {
      setNotices([]);
      return;
    }
    let cancelled = false;
    setNotices([]);
    fetch(`/api/spot-notices?spot_id=${encodeURIComponent(spotId)}`)
      .then((res) => res.json())
      .then((data: { notices?: SpotNotice[] }) => {
        if (!cancelled) setNotices(Array.isArray(data.notices) ? data.notices : []);
      })
      .catch(() => {
        if (!cancelled) setNotices([]);
      });
    // [실사용 확인](2026-09-20 사용자 지시, spot-curation-refresh 트리거와 동일한
    // 이유) keepalive로, 이 유저가 크롤링이 끝나기 전에 탭을 닫거나 페이지를
    // 이동해도 요청이 중간에 끊기지 않고 백그라운드로 계속 전송되게 한다.
    fetch('/api/spot-notice-radar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spot_id: spotId }),
      keepalive: true,
    }).catch(() => {}); // fire-and-forget — 실패해도 유저 화면에 영향 없음.
    return () => {
      cancelled = true;
    };
  }, [spotId]);

  return notices;
}

// [이미지 없는(텍스트 전용) 공지 표시 제안](요청 원문 "이미지가 아닌 공지로 발행할
// 수도 있게하는데 이경우는 어떻게 보여주는게 좋을지 제안해라") — 사진이 있으면 사진
// 카드, 없으면 이 프로젝트에 이미 있는 "인포 배너" 시각 언어(예: spot-curations-
// panel.tsx의 amber 안내 배너)를 재사용해 텍스트만으로 꽉 찬 배너 한 장을 보여준다.
export function SpotNoticesSection({ notices }: { notices: SpotNotice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold text-gray-500 mb-1.5">🔔 최신 소식</p>
      <div className="flex flex-col gap-1.5">
        {notices.map((notice) =>
          notice.curated_image_url ? (
            <div key={notice.id} className="rounded-lg border border-gray-200 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={notice.curated_image_url} alt="" className="w-full h-32 object-cover" />
              <div className="p-2.5">
                <p className="text-sm font-medium text-gray-800">{notice.curated_title}</p>
                {notice.curated_content && (
                  <p className="mt-0.5 text-xs text-gray-600 whitespace-pre-wrap">{notice.curated_content}</p>
                )}
              </div>
            </div>
          ) : (
            <div key={notice.id} className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
              <p className="text-sm font-medium text-amber-900">🔔 {notice.curated_title}</p>
              {notice.curated_content && (
                <p className="mt-0.5 text-xs text-amber-800 whitespace-pre-wrap">{notice.curated_content}</p>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
