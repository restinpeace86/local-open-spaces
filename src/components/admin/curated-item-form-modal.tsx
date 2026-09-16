'use client';

import { useEffect, useRef, useState } from 'react';
import { useBackdropDismiss } from '@/lib/admin/use-backdrop-dismiss';
import { SpotPicker, SpotOption } from '@/components/community/spot-picker';
import { SpotServiceCategoryCheck } from '@/components/admin/spot-service-category-check';
import { ServiceCategory } from '@/lib/admin/service-category';

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
  // [제휴 상품 ↔ 스팟 연동](2026-09-10 사용자 지시, todo.md 개선사항6): 연동된 스팟.
  // spot_id는 1:1 매핑 저장값, spot은 폼 편집 프리필/목록 표기용 조인 결과.
  spot_id?: string | null;
  spot?: { id: string; name: string; address: string | null } | null;
};

export function CuratedItemFormModal({
  initial,
  prefill,
  onClose,
  onSaved,
}: {
  initial?: CuratedItemFormValue;
  // [마이리얼트립 검색 결과에서 등록](2026-09-16 사용자 지시): "검색어 입력 →
  // 결과 카드에서 선택 → 자동입력" 흐름에서 쓴다. `initial`(수정 모드, id가 있는
  // 기존 행)과 달리 이건 "신규 등록인데 값만 미리 채워 넣기"라 isEdit 판정에는
  // 영향을 주지 않는다 — id가 없는 신규 행이므로 그대로 두면 PATCH를 시도해 버려
  // initial과 절대 같은 의미로 취급하면 안 된다.
  prefill?: Partial<Pick<CuratedItemFormValue, 'title' | 'image_url' | 'booking_url' | 'category'>> & {
    // [스팟 연결 후 등록 시 중복 작업 제거](2026-09-16 사용자 보고: "마이리얼트립
    // 에서 내 스팟과 연결있는데 그거하고나서.. 제휴마케팅만들기 들어가면 스팟
    // 연결안되어있어서 거기서 다시하고.. 그래서 2번 하는걸로 되나?") — 마이리얼
    // 트립 검색에서 이미 이 상품을 우리 스팟과 연결해 뒀다면, 그 스팟을 여기서도
    // 다시 검색해 고르지 않아도 되게 그대로 넘겨받는다.
    spot?: { id: string; name: string; address: string | null } | null;
  };
  onClose: () => void;
  onSaved: (item: CuratedItemFormValue) => void;
}) {
  const isEdit = Boolean(initial);
  // [드래그 시 팝업 닫힘 버그 수정](2026-09-05 사용자 지시) 참고: use-backdrop-dismiss.ts
  const backdropDismiss = useBackdropDismiss(onClose);
  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? '');
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? prefill?.image_url ?? '');
  const [bookingUrl, setBookingUrl] = useState(initial?.booking_url ?? prefill?.booking_url ?? '');
  const [category, setCategory] = useState(initial?.category ?? prefill?.category ?? 'ticket');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [operationStart, setOperationStart] = useState(initial?.operation_start_date ?? '');
  const [operationEnd, setOperationEnd] = useState(initial?.operation_end_date ?? '');
  const [spot, setSpot] = useState<SpotOption | null>(
    initial?.spot
      ? { id: initial.spot.id, name: initial.spot.name, address: initial.spot.address }
      : prefill?.spot
        ? { id: prefill.spot.id, name: prefill.spot.name, address: prefill.spot.address }
        : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // [중복 등록 버그 수정](2026-09-16 사용자 보고: "반응 늦어서 똑같은거 2번
  // 입력한거에 대하여 큐레이션/제휴상품에 똑같은게 2개 들어가 있어") —
  // isSubmitting은 React state라 다시 렌더링돼야 반영된다. 응답이 느릴 때
  // 두 번 빠르게 클릭하면(또는 더블클릭) 두 번째 클릭의 핸들러가 아직 갱신
  // 안 된 이전 isSubmitting=false를 그대로 읽어 통과해 버릴 수 있다(실측
  // 재현 가능한 React 흔한 더블 서브밋 패턴) — 렌더링 주기와 무관하게 즉시
  // 갱신되는 ref로 동기적으로 막는다.
  const isSubmittingRef = useRef(false);

  // [노출 중분류 확인/입력](2026-09-13 사용자 지시): "큐레이션/제휴 상품 등록탭에서도
  // 장소 입력하면 해당 장소가 노출 중분류 없으면 관리자가 입력할수있도록.. events쪽의
  // 관리자 상세 팝업에서.. 하는것처럼" — 이 폼은 원래 serviceCategories를 쓸 일이
  // 없어 조회하지 않았는데, SpotServiceCategoryCheck에 넘겨주려고 자체적으로
  // 조회한다(다른 자기완결 모달과 동일한 관례 — 새 prop을 부모 체인에 꿰지 않음).
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  useEffect(() => {
    fetch('/api/admin/service-categories')
      .then((res) => res.json())
      .then((data: { items?: ServiceCategory[] }) => setServiceCategories(data.items ?? []))
      .catch(() => {
        // 실패해도 노출 중분류 상태만 안 보일 뿐 상품 등록/수정 자체는 그대로 가능하다.
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmittingRef.current) return;

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

    isSubmittingRef.current = true;
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
        spot_id: spot?.id ?? null,
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
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center" {...backdropDismiss}>
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

          {/* [제휴 상품 ↔ 스팟 연동](2026-09-10 사용자 지시, todo.md 개선사항6):
              통합 장소 검색(내부 DB → 카카오 로컬 Fallback → Auto-Upsert)을 그대로
              재사용한다(글쓰기 SpotPicker와 동일 파이프라인). 선택된 스팟의 id가
              spot_id로 저장돼 스팟픽 지도에서 특가 마커로 강조된다. */}
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">연동 장소(Spot) — 선택</span>
            <SpotPicker selected={spot} onSelect={setSpot} />
            <p className="text-xs text-gray-400">
              장소를 연동하면 노출 활성화 시 스팟픽 지도에서 특가/Hot 마커로 강조됩니다.
            </p>
            <SpotServiceCategoryCheck spotId={spot?.id ?? null} serviceCategories={serviceCategories} />
          </div>

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
