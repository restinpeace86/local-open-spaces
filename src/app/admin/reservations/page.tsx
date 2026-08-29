'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pagination } from '@/components/admin/pagination';

const PAGE_SIZE = 20;

type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

type ReservationRow = {
  id: string;
  spot_id: string;
  contact: string;
  visit_date: string;
  headcount: number;
  status: ReservationStatus;
  created_at: string;
  open_spaces: { name: string; address: string } | null;
};

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: '대기중',
  CONFIRMED: '확정',
  CANCELLED: '취소',
};

const STATUS_BADGE_CLASS: Record<ReservationStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

// [관리자 예약 관리 어드민 대시보드](2026-08-29 사용자 지시): 유저가 스팟 상세에서 남긴
// 간편 예약/신청 내역을 운영자가 확인하고 전화 조율 후 상태를 바꾸는 가벼운 어드민 뷰.
// 이 앱은 아직 로그인/세션 인증이 없어(known gap, /admin/data-grid와 동일한 상황)
// 이 페이지도 별도 접근 제어 없이 기존 관례를 그대로 따른다 — 인증은 이번 지시서 범위
// 밖이라 임의로 추가하지 않는다(제3장 제2조 Spec 우선, 제3장 제5조 추측 금지).
export default function AdminReservationsPage() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetch(`/api/reservations?page=${page}&page_size=${PAGE_SIZE}`)
      .then((res) => res.json())
      .then((data: { reservations?: ReservationRow[]; total?: number; error?: string }) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setRows(data.reservations ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  useEffect(() => load(), [load]);

  async function handleStatusChange(id: string, status: Extract<ReservationStatus, 'CONFIRMED' | 'CANCELLED'>) {
    setUpdatingId(id);
    try {
      const res = await fetch('/api/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? '상태 변경에 실패했습니다.');

      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    } finally {
      setUpdatingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const isEmpty = !isLoading && !errorMessage && rows.length === 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-bold text-gray-900">📋 예약/신청 관리</h1>
      <p className="text-sm text-gray-500 mt-1 mb-4">
        총 {total.toLocaleString('ko-KR')}건 — 전화 조율 후 상태를 확정/취소로 바꿔주세요.
      </p>

      {isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
      {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
      {isEmpty && <p className="text-sm text-gray-400">접수된 예약/신청이 없습니다.</p>}

      {!isLoading && !errorMessage && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2.5 px-3">스팟</th>
                <th className="py-2.5 px-3">방문 예정일</th>
                <th className="py-2.5 px-3">인원</th>
                <th className="py-2.5 px-3">연락처</th>
                <th className="py-2.5 px-3">접수 시각</th>
                <th className="py-2.5 px-3">상태</th>
                <th className="py-2.5 px-3">작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={index % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-gray-900">{row.open_spaces?.name ?? '(알 수 없는 스팟)'}</div>
                    {row.open_spaces?.address && (
                      <div className="text-xs text-gray-400">{row.open_spaces.address}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{row.visit_date}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{row.headcount}명</td>
                  <td className="py-2.5 px-3 whitespace-nowrap">{row.contact}</td>
                  <td className="py-2.5 px-3 whitespace-nowrap text-xs text-gray-500">
                    {new Date(row.created_at).toLocaleString('ko-KR')}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE_CLASS[row.status]}`}
                    >
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    {row.status === 'PENDING' ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          disabled={updatingId === row.id}
                          onClick={() => handleStatusChange(row.id, 'CONFIRMED')}
                          className="rounded-lg border border-emerald-300 text-emerald-700 text-xs font-medium px-2.5 py-1 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          확정
                        </button>
                        <button
                          type="button"
                          disabled={updatingId === row.id}
                          onClick={() => handleStatusChange(row.id, 'CANCELLED')}
                          className="rounded-lg border border-gray-300 text-gray-600 text-xs font-medium px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !errorMessage && totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
