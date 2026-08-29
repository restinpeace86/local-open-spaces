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

type StatusCounts = Record<ReservationStatus, number>;

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: '대기중',
  CONFIRMED: '확정',
  CANCELLED: '취소',
};

// [어드민 예약 대시보드 뱃지 및 요약 카운트 폴리싱](2026-08-29 사용자 지시): PENDING은
// "처리가 시급한 건"이라 확정/취소보다 한 단계 더 눈에 띄어야 한다 — 확정/취소는 옅은
// 파스텔 배경(기존 스타일 유지), PENDING만 채워진 진한 배경 + 흰 글자로 대비를 준다.
const STATUS_BADGE_CLASS: Record<ReservationStatus, string> = {
  PENDING: 'bg-amber-500 text-white',
  CONFIRMED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function MetricCard({
  label,
  value,
  isLoading,
  emphasize = false,
}: {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        emphasize ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-900'
      }`}
    >
      <div className={`text-xs font-medium ${emphasize ? 'text-amber-50' : 'text-gray-500'}`}>{label}</div>
      <div className="mt-1 text-2xl font-bold">
        {isLoading ? (
          <span className={`inline-block h-6 w-10 rounded animate-pulse ${emphasize ? 'bg-amber-400' : 'bg-gray-200'}`} />
        ) : (
          `${(value ?? 0).toLocaleString('ko-KR')}건`
        )}
      </div>
    </div>
  );
}

// [관리자 예약 관리 어드민 대시보드](2026-08-29 사용자 지시): 유저가 스팟 상세에서 남긴
// 간편 예약/신청 내역을 운영자가 확인하고 전화 조율 후 상태를 바꾸는 가벼운 어드민 뷰.
// 이 앱은 아직 로그인/세션 인증이 없어(known gap, /admin/data-grid와 동일한 상황)
// 이 페이지도 별도 접근 제어 없이 기존 관례를 그대로 따른다 — 인증은 이번 지시서 범위
// 밖이라 임의로 추가하지 않는다(제3장 제2조 Spec 우선, 제3장 제5조 추측 금지).
export default function AdminReservationsPage() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState<StatusCounts | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    fetch(`/api/reservations?page=${page}&page_size=${PAGE_SIZE}`)
      .then((res) => res.json())
      .then(
        (data: {
          reservations?: ReservationRow[];
          total?: number;
          statusCounts?: StatusCounts;
          error?: string;
        }) => {
          if (cancelled) return;
          if (data.error) throw new Error(data.error);
          setRows(data.reservations ?? []);
          setTotal(data.total ?? 0);
          // [어드민 예약 대시보드 뱃지 및 요약 카운트 폴리싱](2026-08-29 사용자 지시): 요약
          // 카드는 "전체 예약 현황"을 보여줘야 해서 페이지 이동과 무관하게 항상 최신값을
          // 유지해야 한다 — 매 페이지 조회마다 함께 내려오는 statusCounts로 갱신한다.
          if (data.statusCounts) setStatusCounts(data.statusCounts);
        }
      )
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

      setRows((prev) => {
        const target = prev.find((row) => row.id === id);
        // 요약 카드는 현재 이 목록에 실려온 행의 이전 상태를 알아야 정확히 옮길 수 있다
        // (다른 페이지에서 바뀐 게 아니라 지금 이 화면에서 바뀌는 것이므로 안전하게 로컬로
        // 갱신 — 목록을 통째로 다시 불러오지 않아 체감 속도를 유지한다).
        if (target && target.status !== status) {
          setStatusCounts((prevCounts) =>
            prevCounts
              ? {
                  ...prevCounts,
                  [target.status]: Math.max(0, prevCounts[target.status] - 1),
                  [status]: prevCounts[status] + 1,
                }
              : prevCounts
          );
        }
        return prev.map((row) => (row.id === id ? { ...row, status } : row));
      });
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
      <p className="text-sm text-gray-500 mt-1 mb-4">전화 조율 후 상태를 확정/취소로 바꿔주세요.</p>

      {/* 요구사항 1: 상단 요약 카드 — 대기중은 강조 색상(주황)으로, 전체/확정/취소는
          차분한 톤으로 구성한 메트릭 바. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <MetricCard label="전체" value={total} isLoading={isLoading} />
        <MetricCard label="🔴 신규 대기" value={statusCounts?.PENDING} isLoading={isLoading} emphasize />
        <MetricCard label="확정 완료" value={statusCounts?.CONFIRMED} isLoading={isLoading} />
        <MetricCard label="취소" value={statusCounts?.CANCELLED} isLoading={isLoading} />
      </div>

      {isLoading && rows.length === 0 && <p className="text-sm text-gray-400">불러오는 중...</p>}
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
              {rows.map((row, index) => {
                // 요구사항 2: PENDING 행은 줄무늬 배경 규칙보다 우선해 눈에 띄는 배경 +
                // 왼쪽 강조선을 준다 — "전화 조율이 필요한 건"을 스캔 한 번에 찾을 수 있게.
                const isPending = row.status === 'PENDING';
                const rowClass = isPending
                  ? 'bg-amber-50 border-l-4 border-amber-400'
                  : index % 2 === 1
                  ? 'bg-gray-50/60'
                  : 'bg-white';

                return (
                  <tr key={row.id} className={rowClass}>
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
                      {isPending ? (
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
                );
              })}
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
