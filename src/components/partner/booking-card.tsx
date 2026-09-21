'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateBookingStatus, deleteBooking } from '@/actions/partner/bookings';
import { BookingStatus, BOOKING_STATUSES } from '@/lib/partner/booking-status';

// [나드리픽 파트너 PMS — 일간 뷰](2026-09-20 사용자 지시): "채널 구분 뱃지... 색상
// 분기". 이 코드베이스에 예약 출처를 색으로 구분한 기존 전례가 없어(조사 완료) 이번에
// 새로 정한다 — 네이버는 네이버 브랜드 그린 계열, 수기 등록은 이 프로젝트가 이미
// 기본 강조색으로 쓰는 파랑(bg-blue-600 등)과 어울리는 톤으로 맞춘다.
// [2026-09-21] source 값 'nadripik'→'manual' 이름 변경(actions/partner/bookings.ts
// 주석 참고) — 같은 의미(파트너 수기 등록)를 그대로 유지, 라벨/색상도 동일.
const SOURCE_META: Record<string, { label: string; className: string }> = {
  naver: { label: '네이버 예약', className: 'bg-emerald-100 text-emerald-700' },
  manual: { label: '수기 등록', className: 'bg-blue-100 text-blue-700' },
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: '확정',
  completed: '완료',
  noshow: '노쇼',
  cancelled: '취소',
};

export type BookingCardData = {
  id: string;
  customer_name: string;
  customer_phone: string;
  booking_time: string;
  headcount: number;
  source: string;
  status: string;
  memo: string | null;
  product_name: string | null;
  total_price: number | null;
};

// [2026-09-21] "결제 금액" 표시 — 이 프로젝트의 다른 가격 표시(deals/event-tickets)와
// 동일하게 원화 콤마 구분만 하고 소수점은 다루지 않는다(정수 KRW 컬럼).
function formatPrice(price: number): string {
  return `${price.toLocaleString('ko-KR')}원`;
}

// booking_time은 Postgres "time" 컬럼이라 "14:30:00" 형태로 온다 — 사장님이 보기엔
// 초 단위까지 필요 없어 "HH:MM"만 자른다.
function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function BookingCard({ booking }: { booking: BookingCardData }) {
  const router = useRouter();
  const [status, setStatus] = useState<string>(booking.status);
  const [isUpdating, setIsUpdating] = useState<BookingStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  const sourceMeta = SOURCE_META[booking.source] ?? { label: booking.source, className: 'bg-gray-100 text-gray-600' };

  async function handleStatusChange(nextStatus: BookingStatus) {
    if (nextStatus === status || isUpdating) return;
    setIsUpdating(nextStatus);
    setErrorMessage(null);
    const previousStatus = status;
    // [즉시 DB 반영](요구사항 3): 낙관적으로 먼저 화면에 반영하고, 실패하면 되돌린다
    // — 사장님이 버튼을 누른 즉시 반응이 보여야 "즉시 반영"이라는 의도에 맞다.
    setStatus(nextStatus);
    const result = await updateBookingStatus(booking.id, nextStatus);
    if ('error' in result) {
      setStatus(previousStatus);
      setErrorMessage(result.error);
    } else {
      router.refresh();
    }
    setIsUpdating(null);
  }

  // [파트너 예약 삭제](2026-09-22 사용자 지시): "각 계정 파트너 사장님도 자기꺼는
  // 앱에서 삭제할수 있어야하고" — 상태를 '취소'로 바꾸는 것과 달리 행 자체를
  // 영구히 지운다. window.confirm으로 실수 클릭을 막는다(이 코드베이스의 기존
  // 삭제 확인 관례 — raw-data-modal.tsx/category-mapping-panel.tsx와 동일 패턴).
  async function handleDelete() {
    if (isDeleting) return;
    if (!window.confirm('이 예약을 삭제할까요? 삭제하면 되돌릴 수 없어요.')) return;
    setIsDeleting(true);
    setErrorMessage(null);
    const result = await deleteBooking(booking.id);
    if ('error' in result) {
      setErrorMessage(result.error);
      setIsDeleting(false);
    } else {
      setIsDeleted(true);
      router.refresh();
    }
  }

  if (isDeleted) return null;

  return (
    <div className={`rounded-2xl border p-4 ${status === 'cancelled' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${sourceMeta.className}`}>
            {sourceMeta.label}
          </span>
          <p className="mt-1.5 text-lg font-bold text-gray-900">{formatTime(booking.booking_time)}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold text-gray-900">{booking.customer_name}</p>
          <p className="text-sm text-gray-500">{booking.headcount}명</p>
        </div>
      </div>

      {booking.product_name && <p className="mt-1.5 text-sm font-medium text-gray-700">{booking.product_name}</p>}

      {/* [빠른 연락](요구사항 3): 전화번호 클릭 시 tel: 링크 */}
      <a href={`tel:${booking.customer_phone}`} className="mt-2 flex items-center gap-1.5 text-base text-blue-600">
        📞 {booking.customer_phone}
      </a>

      {booking.total_price != null && (
        <p className="mt-1.5 text-sm font-semibold text-gray-900">{formatPrice(booking.total_price)}</p>
      )}

      {booking.memo && <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{booking.memo}</p>}

      <div className="mt-3 flex gap-2">
        {BOOKING_STATUSES.map((s) => {
          const isActive = status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => handleStatusChange(s)}
              disabled={isUpdating !== null}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isUpdating === s ? '처리 중...' : STATUS_LABEL[s]}
            </button>
          );
        })}
      </div>
      {errorMessage && <p className="mt-2 text-xs text-red-600">{errorMessage}</p>}

      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="mt-3 w-full text-center text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
      >
        {isDeleting ? '삭제 중...' : '예약 삭제'}
      </button>
    </div>
  );
}
