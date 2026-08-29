'use client';

import { useState } from 'react';

const TODAY_STR = new Date().toISOString().slice(0, 10);

// [스팟 자체 간편 예약/신청 시스템 MVP](2026-08-29 사용자 지시): 공식 홈페이지가 없는
// 스팟(DetailModal에서 info_url이 없을 때)을 위한 자체 신청 폼 — 날짜/인원수/연락처
// 3개 항목만 받는 최소 구성이다(MVP, 제3장 제3조). 배경 클릭/X 버튼으로 닫히는 기존
// 바텀시트 관례(map-preview-modal.tsx 등)를 그대로 따르되, DetailModal 위에 또 뜨는
// 모달이라 z-index를 한 단계 더 높게 둔다(DetailModal은 z-50).
export function ReservationRequestModal({
  spotId,
  spotName,
  onClose,
}: {
  spotId: string;
  spotName: string;
  onClose: () => void;
}) {
  const [visitDate, setVisitDate] = useState('');
  const [headcount, setHeadcount] = useState(1);
  const [contact, setContact] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!visitDate || !contact.trim() || headcount < 1) {
      setErrorMessage('날짜, 인원 수, 연락처를 모두 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_id: spotId,
          visit_date: visitDate,
          headcount,
          contact: contact.trim(),
        }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? '신청 접수에 실패했습니다.');

      // 요구사항: 신청 완료 시 안내 팝업과 함께 모달이 닫혀야 한다. 이 프로젝트에는 아직
      // 토스트/알림 컴포넌트가 없어(제5장 제4조 기존 구조 우선 — 새 알림 시스템을 이번
      // 범위에서 새로 만들지 않음) 요구사항이 명시한 그대로 브라우저 alert()을 쓴다.
      window.alert('예약 신청이 정상적으로 접수되었습니다!');
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '신청 접수에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full md:w-[420px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">📝 간편 예약/신청</h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4 line-clamp-1">{spotName}</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">방문 날짜</span>
            <input
              type="date"
              value={visitDate}
              min={TODAY_STR}
              onChange={(e) => setVisitDate(e.target.value)}
              required
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">인원 수</span>
            <input
              type="number"
              min={1}
              value={headcount}
              onChange={(e) => setHeadcount(Math.max(1, Number(e.target.value) || 1))}
              required
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">연락처</span>
            <input
              type="tel"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="010-0000-0000"
              required
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-lg bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
          >
            {isSubmitting ? '접수 중...' : '신청 접수'}
          </button>
        </form>
      </div>
    </div>
  );
}
