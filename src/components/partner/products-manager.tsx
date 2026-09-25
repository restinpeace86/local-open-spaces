'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPartnerProduct, deletePartnerProduct, updatePartnerProduct } from '@/actions/partner/products';
import { PricingUnit } from '@/lib/partner/pricing-unit';
import { TimeMode } from '@/lib/partner/time-mode';
import { formatPriceInput, parsePriceInput } from '@/lib/partner/format-price';
import { Toast } from '@/components/map/toast';
import { ProductSessionsManager } from '@/components/partner/product-sessions-manager';

const TOAST_DURATION_MS = 3000;

export type PartnerProduct = {
  id: string;
  name: string;
  price: number;
  pricing_unit: PricingUnit;
  time_mode: TimeMode;
};

const PRICING_UNIT_LABELS: Record<PricingUnit, string> = { flat: '팀당(인원수 무관)', per_person: '인당(인원수만큼 곱함)' };

// [상품별 시간 세팅 방식](2026-09-25 사용자 지시): "지금 우리꺼는 시간은 딱히
// 없는데 시간은 고객이 정하는거라는것처럼 되어있는데 이게 아니고 체험 시간도
// 체험농장 사장님이 정하는거네" → "아니 우리도 그럼 자유롭게 할수있도록 하되
// 상품에 대하여 시간도 세팅가능하게 하는건?" — free(자유 시간)는 지금처럼
// 예약 등록 시 날짜/시간을 그때그때 고르고, session(고정 회차)은 미리 등록해둔
// 회차 중에서만 고른다.
const TIME_MODE_LABELS: Record<TimeMode, string> = { free: '자유 시간', session: '고정 회차' };

// [파트너 상품 관리](2026-09-23 사용자 지시): "더보기에서 화면 하나 만들어서 세팅할 수
// 있게해놓고 거기있는 데이터 가져와서 리스트로 나오게 하고 그중 선택하게해" — 예약
// 추가 화면(add-booking-fab.tsx)의 상품 콤보박스가 여기서 등록한 상품을 그대로
// 가져다 쓴다. "상품에 대하여 팀당 1개인지 아니면 인당 1개인지" 요구사항에 따라
// 상품마다 가격 기준(팀당/인당)을 고를 수 있게 한다.
function ProductForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  initial?: PartnerProduct;
  onSubmit: (input: { name: string; price: number; pricing_unit: PricingUnit; time_mode: TimeMode }) => void;
  onCancel?: () => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [priceDisplay, setPriceDisplay] = useState(initial ? initial.price.toLocaleString('ko-KR') : '');
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>(initial?.pricing_unit ?? 'flat');
  const [timeMode, setTimeMode] = useState<TimeMode>(initial?.time_mode ?? 'free');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ name, price: parsePriceInput(priceDisplay) ?? 0, pricing_unit: pricingUnit, time_mode: timeMode });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
      <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
        상품명
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="예: 캠핑사이트 A형(1박)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-gray-600">
          가격
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              value={priceDisplay}
              onChange={(e) => setPriceDisplay(formatPriceInput(e.target.value))}
              placeholder="0"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              원
            </span>
          </div>
        </label>
      </div>
      <div className="flex flex-col gap-1.5 text-xs font-semibold text-gray-600">
        가격 기준
        <div className="flex gap-3">
          {(Object.entries(PRICING_UNIT_LABELS) as [PricingUnit, string][]).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 text-sm font-normal text-gray-700">
              <input
                type="radio"
                name="pricing_unit"
                value={value}
                checked={pricingUnit === value}
                onChange={() => setPricingUnit(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-xs font-semibold text-gray-600">
        시간 세팅 방식
        <div className="flex gap-3">
          {(Object.entries(TIME_MODE_LABELS) as [TimeMode, string][]).map(([value, label]) => (
            <label key={value} className="flex items-center gap-1.5 text-sm font-normal text-gray-700">
              <input
                type="radio"
                name="time_mode"
                value={value}
                checked={timeMode === value}
                onChange={() => setTimeMode(value)}
              />
              {label}
            </label>
          ))}
        </div>
        {timeMode === 'session' && (
          <span className="text-xs font-normal text-gray-400">
            상품을 저장한 뒤 목록에서 "회차 관리"를 눌러 날짜/시간/정원을 등록해 주세요.
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? '저장 중...' : initial ? '수정 완료' : '상품 추가'}
        </button>
      </div>
    </form>
  );
}

export function ProductsManager({ initialProducts }: { initialProducts: PartnerProduct[] }) {
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedSessionsId, setExpandedSessionsId] = useState<string | null>(null);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), TOAST_DURATION_MS);
  }

  async function handleCreate(input: { name: string; price: number; pricing_unit: PricingUnit; time_mode: TimeMode }) {
    setIsSubmitting(true);
    setErrorMessage(null);
    const result = await createPartnerProduct(input);
    setIsSubmitting(false);
    if ('error' in result) {
      setErrorMessage(result.error);
      return;
    }
    setIsAdding(false);
    showToast('상품을 추가했어요.');
    router.refresh();
  }

  async function handleUpdate(id: string, input: { name: string; price: number; pricing_unit: PricingUnit; time_mode: TimeMode }) {
    setIsSubmitting(true);
    setErrorMessage(null);
    const result = await updatePartnerProduct(id, input);
    setIsSubmitting(false);
    if ('error' in result) {
      setErrorMessage(result.error);
      return;
    }
    setEditingId(null);
    showToast('상품을 수정했어요.');
    router.refresh();
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`"${name}" 상품을 삭제할까요?`)) return;
    const result = await deletePartnerProduct(id);
    if ('error' in result) {
      showToast(result.error);
      return;
    }
    showToast('상품을 삭제했어요.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {toastMessage && <Toast message={toastMessage} />}

      {isAdding ? (
        <ProductForm onSubmit={handleCreate} onCancel={() => setIsAdding(false)} isSubmitting={isSubmitting} />
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="rounded-xl border border-dashed border-blue-300 bg-blue-50/50 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50"
        >
          + 상품 추가
        </button>
      )}
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      {initialProducts.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">등록된 상품이 없어요. 위에서 추가해 보세요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {initialProducts.map((product) =>
            editingId === product.id ? (
              <li key={product.id}>
                <ProductForm
                  initial={product}
                  onSubmit={(input) => handleUpdate(product.id, input)}
                  onCancel={() => setEditingId(null)}
                  isSubmitting={isSubmitting}
                />
              </li>
            ) : (
              <li key={product.id} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      {product.price.toLocaleString('ko-KR')}원 · {PRICING_UNIT_LABELS[product.pricing_unit]} ·{' '}
                      {TIME_MODE_LABELS[product.time_mode]}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(product.id)}
                      className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(product.id, product.name)}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                {product.time_mode === 'session' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setExpandedSessionsId(expandedSessionsId === product.id ? null : product.id)}
                      className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      {expandedSessionsId === product.id ? '회차 관리 닫기 ▲' : '회차 관리 ▼'}
                    </button>
                    {expandedSessionsId === product.id && <ProductSessionsManager productId={product.id} />}
                  </>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
