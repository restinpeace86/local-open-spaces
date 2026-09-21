'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBooking } from '@/actions/partner/bookings';
import { formatPhoneNumber } from '@/lib/partner/format-phone';
import { formatPriceInput, parsePriceInput } from '@/lib/partner/format-price';
import { Toast } from '@/components/map/toast';

// [나드리픽 파트너 PMS — 수기 예약 등록](2026-09-20 사용자 지시): "일간 뷰 화면
// 우측 하단에 눈에 띄는 [+ 예약 추가] 플로팅 액션 버튼(FAB)... 클릭 시 화면을 덮는
// 바텀 시트". FAB과 시트를 하나의 컴포넌트로 묶었다 — 열림 상태 하나로 둘 다
// 제어하면 되는, 서로 완전히 독립적이지 않은 짝이라 굳이 분리하지 않았다.
const TOAST_DURATION_MS = 3000;

// 30분 단위 드롭다운(요구사항 2 "타임 피커 또는 30분 단위 드롭다운" 중 후자를
// 선택 — 네이티브 time input은 브라우저별 UI가 제각각이라 이 쪽이 더 일관적이다).
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = String(Math.floor(i / 2)).padStart(2, '0');
  const minute = i % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
});

// [입력 간편화](2026-09-21 사용자 지시) "이 필드들을 간편하게 입력하는 법이
// 없나" — 상품명은 매번 새로 치기보다, 이 파트너가 예전에 등록했던 이름 중
// 고르는 게 훨씬 빠르다. 별도 검색 UI 없이 네이티브 <datalist>만으로 자동완성
// 제안을 붙인다(제5장 제4조 — 새 컴포넌트/라이브러리 없이 HTML 표준 기능만 사용).
export function AddBookingFab({ defaultDate, recentProductNames = [] }: { defaultDate: string; recentProductNames?: string[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [bookingDate, setBookingDate] = useState(defaultDate);
  const [bookingTime, setBookingTime] = useState(TIME_OPTIONS[0]);
  const [headcount, setHeadcount] = useState(1);
  const [memo, setMemo] = useState('');
  // [2026-09-21 필드 확장] "네이버 예약 호환 수동 예약 등록 폼" 요청이 추가한
  // 상품명/결제 금액 — 둘 다 선택 입력이라 빈 문자열을 허용한다.
  const [productName, setProductName] = useState('');
  const [totalPrice, setTotalPrice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function resetForm() {
    setCustomerName('');
    setCustomerPhone('');
    setBookingDate(defaultDate);
    setBookingTime(TIME_OPTIONS[0]);
    setHeadcount(1);
    setMemo('');
    setProductName('');
    setTotalPrice('');
    setFormError(null);
  }

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), TOAST_DURATION_MS);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      const result = await createBooking({
        customer_name: customerName,
        customer_phone: customerPhone,
        booking_date: bookingDate,
        booking_time: bookingTime,
        headcount,
        memo: memo || null,
        product_name: productName || null,
        total_price: parsePriceInput(totalPrice),
      });
      if ('error' in result) {
        // [유효성 검사 및 에러 핸들링](요구사항 4): "필수값 누락 시 폼 에러 표시 /
        // 네트워크 오류 등으로 INSERT 실패 시 토스트로 안내" — 이 액션은 두 종류의
        // 실패를 구분하지 않고 항상 { error }만 돌려주므로(어차피 폼이 이미 클라이언트
        // 단에서 required로 필수값을 막고 있어 실제로 여기 도달하는 에러는 거의
        // 서버/DB 쪽 문제다), 폼 안 에러 문구와 토스트를 함께 보여준다 — 어느 쪽만
        // 보고도 원인을 알 수 있게.
        setFormError(result.error);
        showToast(result.error);
      } else {
        resetForm();
        setIsOpen(false);
        showToast('예약이 등록됐어요.');
        router.refresh();
      }
    } catch {
      const message = '예약 등록에 실패했어요. 잠시 후 다시 시도해 주세요.';
      setFormError(message);
      showToast(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {toastMessage && <Toast message={toastMessage} />}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-1.5 rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-lg hover:bg-blue-700"
      >
        + 예약 추가
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={() => setIsOpen(false)}>
          <div
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">예약 추가</h2>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                예약자명
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                연락처
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(formatPhoneNumber(e.target.value))}
                  placeholder="010-0000-0000"
                  required
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-gray-700">
                  예약 날짜
                  <input
                    type="date"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    required
                    className="rounded-xl border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium text-gray-700">
                  예약 시간
                  <select
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    required
                    className="rounded-xl border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {TIME_OPTIONS.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                상품명/객실명(선택)
                <input
                  type="text"
                  list="product-name-suggestions"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {recentProductNames.length > 0 && (
                  <datalist id="product-name-suggestions">
                    {recentProductNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                )}
              </label>

              <div className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                방문 인원
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setHeadcount((n) => Math.max(1, n - 1))}
                    disabled={headcount <= 1}
                    aria-label="인원 줄이기"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-700 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-10 text-center text-lg font-bold text-gray-900">{headcount}</span>
                  <button
                    type="button"
                    onClick={() => setHeadcount((n) => n + 1)}
                    aria-label="인원 늘리기"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-700"
                  >
                    +
                  </button>
                  <span className="text-sm text-gray-500">명</span>
                </div>
              </div>

              {/* [입력 간편화] "원" 단위 표시를 라벨이 감싸는 구조로 넣으면(다른 필드들처럼
                  <label>텍스트<input/></label>) 라벨의 접근성 이름에 "원"까지 섞여
                  들어가 다른 필드와 동일한 방식(라벨 텍스트만으로 매칭)이 깨진다 — 이
                  필드만 htmlFor/id로 명시적으로 연결해 라벨 텍스트를 깨끗하게 유지한다. */}
              <div className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                <label htmlFor="add-booking-total-price">결제 금액(선택)</label>
                <div className="relative">
                  <input
                    id="add-booking-total-price"
                    type="text"
                    inputMode="numeric"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(formatPriceInput(e.target.value))}
                    placeholder="0"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 pr-10 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-sm font-medium text-gray-700">
                메모(선택)
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={2}
                  className="rounded-xl border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-1 rounded-xl bg-blue-600 py-3.5 text-base font-semibold text-white disabled:opacity-50"
              >
                {isSubmitting ? '등록 중...' : '예약 등록'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
