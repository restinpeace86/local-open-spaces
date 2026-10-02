'use client';

import { useState } from 'react';

// [이마트 컬처클럽 강좌 리스트 — data-grid 탭](2026-10-03 사용자 지시): "이마트
// 문화센터 등 다른곳에 대하여 홈플러스처럼 진행할예정이야" — 홈플러스 탭
// (homeplus-lecture-list-panel.tsx)과 동일한 패턴(자기완결 패널, 마운트 시 자동
// 조회 안 함, '조회하기' 버튼으로 시작). 전체 6,500건+ 규모라 카테고리/상태
// 필터로 좁혀 쓰는 게 기본 — 필터 없이 조회하면 최신 1,000건만 보이고
// "총 N건 중 1,000건 표시"로 안내한다.

type ClassRow = {
  id: number;
  class_id: string;
  class_title: string;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  sub_category_name: string | null;
  store_name: string | null;
  class_fee: number | null;
  class_capacity: number | null;
  occupied_full_flag: boolean | null;
  semester: string | null;
  semester_year: string | null;
  register_start_date: string | null;
  register_end_date: string | null;
  filter_status: '접수대기' | '접수중' | '정원마감';
  collected_at: string;
};

const CATEGORY_OPTIONS: { code: string; label: string }[] = [
  { code: '101', label: 'Club Originals' },
  { code: '402', label: 'With Mom' },
  { code: '403', label: 'With mom(event)' },
  { code: '404', label: 'Kids & Children' },
  { code: '406', label: 'Kids & Children(event)' },
];

const STATUS_OPTIONS: ClassRow['filter_status'][] = ['접수대기', '접수중', '정원마감'];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatTimeRange(start: string | null, end: string | null) {
  const fmt = (t: string | null) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t ?? '-');
  return `${fmt(start)} ~ ${fmt(end)}`;
}

export function EmartCultureClubPanel() {
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  function loadRows() {
    setIsLoading(true);
    setErrorMessage(null);
    const params = new URLSearchParams();
    if (categoryFilter) params.set('sub_category_code', categoryFilter);
    if (statusFilter) params.set('filter_status', statusFilter);

    fetch(`/api/admin/emart-culture-club?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { rows?: ClassRow[]; total?: number; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <p className="text-sm text-gray-500 mb-3">
        이마트 컬처클럽 강좌 리스트(검토용 — 공개 GraphQL API로 매일 자동 수집,
        scripts/ingest/emart-culture-club.mjs). 전체 6,500건+ 규모라 카테고리/상태로 좁혀서 조회하는 걸 권장합니다.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 text-xs px-2 py-1.5"
        >
          <option value="">전체 카테고리</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 text-xs px-2 py-1.5"
        >
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === '정원마감' ? '정원마감(대기접수 가능)' : s}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadRows}
          disabled={isLoading}
          className="rounded-full bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          {isLoading ? '불러오는 중...' : '조회하기'}
        </button>
        {rows !== null && (
          <span className="text-xs text-gray-500">
            총 {total.toLocaleString('ko-KR')}건{total > rows.length ? ` 중 최신 ${rows.length.toLocaleString('ko-KR')}건 표시` : ''}
          </span>
        )}
      </div>

      {errorMessage && <p className="text-sm text-red-500 mb-3">{errorMessage}</p>}
      {rows === null && !errorMessage && !isLoading && (
        <p className="text-sm text-gray-400">카테고리/상태를 선택하고 &apos;조회하기&apos;를 눌러 수집 결과를 불러오세요.</p>
      )}

      {rows !== null && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2 px-3">강좌명</th>
                <th className="py-2 px-3">지점</th>
                <th className="py-2 px-3">카테고리</th>
                <th className="py-2 px-3">요일/시간</th>
                <th className="py-2 px-3">상태</th>
                <th className="py-2 px-3">가격</th>
                <th className="py-2 px-3">정원</th>
                <th className="py-2 px-3">접수 기간</th>
                <th className="py-2 px-3">수집 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.filter_status === '정원마감' ? 'bg-amber-50' : 'bg-white'}>
                  <td className="py-2 px-3 max-w-xs truncate" title={row.class_title}>
                    {row.class_title}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{row.store_name ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">{row.sub_category_name ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {(row.class_day ?? []).join(',')} {formatTimeRange(row.start_time, row.end_time)}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        row.filter_status === '정원마감'
                          ? 'bg-amber-500 text-white'
                          : row.filter_status === '접수중'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.filter_status === '정원마감' ? '대기접수 가능' : row.filter_status}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {row.class_fee != null ? `${row.class_fee.toLocaleString('ko-KR')}원` : '-'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">{row.class_capacity ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">
                    {row.register_start_date ?? '-'} ~ {row.register_end_date ?? '-'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-400">{formatDateTime(row.collected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-gray-400 text-center py-6">조건에 맞는 데이터가 없습니다.</p>}
        </div>
      )}
    </div>
  );
}
