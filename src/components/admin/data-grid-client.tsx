'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { RawDataModal } from '@/components/admin/raw-data-modal';

export type AdminSpaceRow = {
  id: string;
  external_id: string;
  source_type: string;
  name: string;
  category: string;
  address: string;
  is_free: boolean | null;
  operating_hours: string | null;
  info_url: string | null;
  is_kids_friendly: boolean;
  has_parking: boolean;
  stroller_accessible: boolean;
  facility_type: string;
  target_age_group: string | null;
  raw_data: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type TriState = 'all' | 'true' | 'false';

const TRI_STATE_LABEL: Record<TriState, string> = { all: '전체', true: '예', false: '아니오' };

function TriStateToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriState;
  onChange: (next: TriState) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
        {(['all', 'true', 'false'] as TriState[]).map((state) => (
          <button
            key={state}
            type="button"
            onClick={() => onChange(state)}
            className={`px-2 py-1 text-xs font-medium transition-colors ${
              value === state ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {TRI_STATE_LABEL[state]}
          </button>
        ))}
      </div>
    </div>
  );
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function triStateParam(value: TriState): string | undefined {
  return value === 'all' ? undefined : value;
}

export function AdminDataGridClient({
  sourceTypeOptions,
  categoryOptions,
}: {
  sourceTypeOptions: string[];
  categoryOptions: string[];
}) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isFree, setIsFree] = useState<TriState>('all');
  const [hasParking, setHasParking] = useState<TriState>('all');
  const [strollerAccessible, setStrollerAccessible] = useState<TriState>('all');
  const [isKidsFriendly, setIsKidsFriendly] = useState<TriState>('all');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<AdminSpaceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<AdminSpaceRow | null>(null);

  // 검색어는 300ms 디바운스 후 반영해 타이핑 중 과도한 재조회를 방지한다.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  // 검색/필터가 바뀌면 1페이지부터 다시 조회한다.
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sourceTypes, categories, isFree, hasParking, strollerAccessible, isKidsFriendly]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    if (sourceTypes.length > 0) params.set('source_type', sourceTypes.join(','));
    if (categories.length > 0) params.set('category', categories.join(','));
    const isFreeParam = triStateParam(isFree);
    if (isFreeParam) params.set('is_free', isFreeParam);
    const hasParkingParam = triStateParam(hasParking);
    if (hasParkingParam) params.set('has_parking', hasParkingParam);
    const strollerParam = triStateParam(strollerAccessible);
    if (strollerParam) params.set('stroller_accessible', strollerParam);
    const kidsParam = triStateParam(isKidsFriendly);
    if (kidsParam) params.set('is_kids_friendly', kidsParam);
    params.set('page', String(page));

    fetch(`/api/admin/data-grid?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '데이터 조회 실패');
        return json as { rows: AdminSpaceRow[]; total: number; pageSize: number };
      })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
        setPageSize(result.pageSize);
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
  }, [debouncedQ, sourceTypes, categories, isFree, hasParking, strollerAccessible, isKidsFriendly, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const resetFilters = () => {
    setQ('');
    setSourceTypes([]);
    setCategories([]);
    setIsFree('all');
    setHasParking('all');
    setStrollerAccessible('all');
    setIsKidsFriendly('all');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-sm font-bold text-gray-900">Admin Data Grid (open_spaces)</h1>
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-gray-500 hover:text-gray-800 underline"
          >
            필터 초기화
          </button>
        </div>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="시설명, 주소 키워드 검색"
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />

        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500 self-center shrink-0">출처</span>
          {sourceTypeOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSourceTypes((prev) => toggleInList(prev, opt))}
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                sourceTypes.includes(opt)
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-gray-500 self-center shrink-0">카테고리</span>
          {categoryOptions.map((opt) => {
            const meta = getCategoryMeta(opt);
            const isActive = categories.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setCategories((prev) => toggleInList(prev, opt))}
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors"
                style={
                  isActive
                    ? { backgroundColor: meta.color, borderColor: meta.color, color: 'white' }
                    : { borderColor: '#d1d5db', color: '#374151', backgroundColor: 'white' }
                }
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <TriStateToggle label="무료" value={isFree} onChange={setIsFree} />
          <TriStateToggle label="🅿️ 주차" value={hasParking} onChange={setHasParking} />
          <TriStateToggle label="👶 유모차" value={strollerAccessible} onChange={setStrollerAccessible} />
          <TriStateToggle label="🛝 키즈친화" value={isKidsFriendly} onChange={setIsKidsFriendly} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}

        {!isLoading && !errorMessage && rows.length === 0 && (
          <p className="text-sm text-gray-400">조건에 맞는 데이터가 없습니다.</p>
        )}

        {!isLoading && !errorMessage && rows.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 pr-3">시설명</th>
                <th className="py-2 pr-3">출처</th>
                <th className="py-2 pr-3">카테고리</th>
                <th className="py-2 pr-3">주소</th>
                <th className="py-2 pr-3">무료</th>
                <th className="py-2 pr-3">뱃지</th>
                <th className="py-2 pr-3">시설유형</th>
                <th className="py-2 pr-3">수집일</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = getCategoryMeta(row.category);
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedRow(row)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="py-2 pr-3 font-medium text-gray-900">{row.name}</td>
                    <td className="py-2 pr-3 text-gray-600">{row.source_type}</td>
                    <td className="py-2 pr-3">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{row.address}</td>
                    <td className="py-2 pr-3 text-gray-600">{row.is_free ? '무료' : '유료'}</td>
                    <td className="py-2 pr-3 text-gray-600">
                      {row.has_parking && '🅿️'}
                      {row.stroller_accessible && '👶'}
                      {row.is_kids_friendly && '🛝'}
                    </td>
                    <td className="py-2 pr-3 text-gray-600">{row.facility_type}</td>
                    <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString('ko-KR') : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between gap-3 border-t border-gray-100 p-3">
        <span className="text-xs text-gray-500">
          총 {total.toLocaleString('ko-KR')}건 · {page} / {totalPages} 페이지
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            이전
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 disabled:opacity-40 hover:bg-gray-50"
          >
            다음
          </button>
        </div>
      </div>

      {selectedRow && <RawDataModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
