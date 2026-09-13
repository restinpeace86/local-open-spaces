'use client';

import { useState } from 'react';

// [맘스픽 게시글 카드 컴팩트화](2026-09-13 사용자 지시): "글 카드 프리뷰에 대하여
// 일단 사진은 사진 보기 버튼으로 대체하고 그거 누르면 올린 사진들 팝업으로
// 확인가능하게" — 카드 안에 사진 썸네일을 인라인으로 두지 않고, 이 모달에서
// 한 장씩 넘겨보게 한다(detail-modal.tsx의 이벤트 이미지 슬라이드와 동일한
// 좌우 화살표 관례 — 제5장 제4조 기존 구조 우선).
export function PostPhotoModal({ photoUrls, onClose }: { photoUrls: string[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center justify-between p-4">
        <span className="text-sm font-medium text-white">{index + 1} / {photoUrls.length}</span>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-white/80 hover:text-white">
          ✕
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrls[index]} alt={`후기 사진 ${index + 1}`} className="max-h-full max-w-full rounded-lg object-contain" />
        {photoUrls.length > 1 && (
          <>
            <button
              type="button"
              aria-label="이전 사진"
              onClick={() => setIndex((i) => (i === 0 ? photoUrls.length - 1 : i - 1))}
              className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="다음 사진"
              onClick={() => setIndex((i) => (i === photoUrls.length - 1 ? 0 : i + 1))}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30"
            >
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
}
