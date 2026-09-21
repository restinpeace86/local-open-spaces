'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteBookingAsHq } from '@/actions/hq/bookings';

// [HQ 전체 파트너 데이터 열람/삭제 권한](2026-09-22 사용자 지시): 파트너의
// BookingCard(src/components/partner/booking-card.tsx)와 동일한 삭제 확인 패턴
// (window.confirm)이지만, 호출하는 액션이 다르다(HQ는 소유자가 아니라 전체 권한으로
// 삭제 — deleteBookingAsHq). 목록 형태도 다르고(카드가 아니라 표 형태 행) 재사용할
// 만큼 겹치지 않아 별도 컴포넌트로 뒀다.
export type HqBookingRowData = {
  id: string;
  customer_name: string;
  customer_phone: string;
  booking_date: string;
  booking_time: string;
  headcount: number;
  source: string;
  status: string;
  product_name: string | null;
  total_price: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: '확정',
  completed: '완료',
  noshow: '노쇼',
  cancelled: '취소',
};

function formatTime(time: string): string {
  return time.slice(0, 5);
}

export function HqBookingRow({ booking }: { booking: HqBookingRowData }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;
    if (!window.confirm(`${booking.customer_name} 고객의 예약을 삭제할까요? 삭제하면 되돌릴 수 없어요.`)) return;
    setIsDeleting(true);
    setErrorMessage(null);
    const result = await deleteBookingAsHq(booking.id);
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
    <tr className="border-b border-gray-100 text-sm">
      <td className="whitespace-nowrap px-3 py-2 text-gray-500">
        {booking.booking_date} {formatTime(booking.booking_time)}
      </td>
      <td className="px-3 py-2 font-medium text-gray-900">{booking.customer_name}</td>
      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{booking.customer_phone}</td>
      <td className="px-3 py-2 text-gray-500">{booking.headcount}명</td>
      <td className="px-3 py-2 text-gray-500">{booking.product_name ?? '-'}</td>
      <td className="whitespace-nowrap px-3 py-2 text-gray-500">
        {booking.total_price != null ? `${booking.total_price.toLocaleString('ko-KR')}원` : '-'}
      </td>
      <td className="px-3 py-2 text-gray-500">{booking.source === 'naver' ? '네이버' : '수기'}</td>
      <td className="px-3 py-2 text-gray-500">{STATUS_LABEL[booking.status] ?? booking.status}</td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
        >
          {isDeleting ? '삭제 중...' : '삭제'}
        </button>
        {errorMessage && <p className="mt-1 text-xs text-red-600">{errorMessage}</p>}
      </td>
    </tr>
  );
}
