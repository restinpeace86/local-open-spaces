'use client';

import { useState } from 'react';

// [관리자 화면(/admin/data-grid) 기능 고도화 및 범용 제휴 상품 테이블 개편](2026-08-30
// 사용자 지시) 요구사항 2: "[+ 신규 상품 등록]"/각 행의 "[수정]"이 여는 팝업 폼. 신규
// 등록과 수정을 하나의 컴포넌트로 처리한다 — `initial`이 있으면 수정(PATCH), 없으면
// 등록(POST)이다. reservation-request-modal.tsx와 동일한 바텀시트 관례(배경 클릭/X로
// 닫힘, 제출 중 이중 클릭 방지)를 따른다.
const CATEGORY_OPTIONS = [
  { value: 'ticket', label: 'ticket (티켓/체험)' },
  { value: 'coupang', label: 'coupang (쿠팡 등 커머스)' },
];

export type CuratedItemFormValue = {
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

export function CuratedItemFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: CuratedItemFormValue;
  onClose: () => void;
  onSaved: (item: CuratedItemFormValue) => void;
}) {
  const isEdit = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? '');
  const [bookingUrl, setBookingUrl] = useState(initial?.booking_url ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'ticket');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [operationStart, setOperationStart] = useState(initial?.operation_start_date ?? '');
  const [operationEnd, setOperationEnd] = useState(initial?.operation_end_date ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim()) {
      setErrorMessage('상품명을 입력해 주세요.');
      return;
    }
    if (!bookingUrl.trim()) {
      setErrorMessage('제휴 링크(booking_url)를 입력해 주세요.');
      return;
    }
    if (operationStart && operationEnd && operationStart > operationEnd) {
      setErrorMessage('운영 종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = {
        title: title.trim(),
        image_url: imageUrl.trim() || null,
        booking_url: bookingUrl.trim(),
        category,
        is_active: isActive,
        operation_start_date: operationStart || null,
        operation_end_date: operationEnd || null,
      };
      const res = isEdit
        ? await fetch('/api/admin/curated-items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: initial!.id, ...payload }),
          })
        : await fetch('/api/admin/curated-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data: { item?: CuratedItemFormValue; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '저장에 실패했습니다.');

      onSaved(data.item);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[440px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">{isEdit ? '상품 수정' : '+ 신규 상품 등록'}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">상품명</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">이미지 URL</span>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">제휴 링크(booking_url)</span>
            <input
              type="text"
              value={bookingUrl}
              onChange={(e) => setBookingUrl(e.target.value)}
              required
              placeholder="https://..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">카테고리</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex gap-3">
            <label className="flex-1 flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">운영(예약 가능) 시작일</span>
              <input
                type="date"
                value={operationStart}
                onChange={(e) => setOperationStart(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex-1 flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">운영(예약 가능) 종료일</span>
              <input
                type="date"
                value={operationEnd}
                onChange={(e) => setOperationEnd(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-gray-400 -mt-1">비워두면 상시 노출됩니다.</p>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span className="font-medium text-gray-700">노출 활성화(is_active)</span>
          </label>

          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded-lg bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '저장 중...' : isEdit ? '수정 저장' : '등록하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
