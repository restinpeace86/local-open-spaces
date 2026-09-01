'use client';

import { useState } from 'react';
import { AiChatSheet } from './ai-chat-sheet';

// [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시) 1. UI/UX: "스팟픽 또는 이벤트픽
// 화면 우측 하단의 플로팅 버튼(FAB) 클릭 시, 화면 하단에서 스르륵 올라오는 오버레이
// 대화창" — /nearby(스팟픽, map-explorer.tsx)와 /calendar(이벤트픽, calendar-view.tsx)
// 양쪽에 이 컴포넌트 하나를 그대로 마운트한다. 기존 "AI 추천" 칩(AiRecommendSheet, LLM
// 미사용 규칙기반 스마트 정렬)과는 완전히 별개의 신규 기능이다(사용자 원문 "기존에 구현
// 완료된 항목들을 제외하고").
export function AiChatFab({ center }: { center: { lat: number; lng: number } }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="AI 맞춤 추천 챗봇 열기"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-2xl shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6"
      >
        🤖
      </button>
      {isOpen && <AiChatSheet center={center} onClose={() => setIsOpen(false)} />}
    </>
  );
}
