'use client';

import { Fragment, useEffect, useState } from 'react';
import { StoreMultiSelect, StoreOption } from '@/components/admin/store-multiselect';

// [문화센터 통합 관리자 화면](2026-10-06 사용자 지시, project/decision-log.md
// Decision 028): "동일하게 가는게 낫겠지.. 동일한구조로 조회/검색가능하게
// 관리자화면도" — emart-culture-club-panel.tsx/lottemart-culture-club-
// panel.tsx 2개를 culture_club_classes 하나를 보는 단일 패널로 합쳤다.
// 브랜드가 늘어나도(AK플라자 등) BRAND_OPTIONS에 원소만 추가하면 된다.

type Brand = 'emart' | 'lottemart' | 'ak_plaza' | 'shinsegae' | 'hyundai' | 'starfield' | 'lotte_department';

type ClassRow = {
  id: number;
  brand: Brand;
  source_class_id: string;
  class_title: string;
  store_code: string | null;
  store_name: string | null;
  main_category_name: string | null;
  sub_category_name: string | null;
  classroom: string | null;
  class_day: string[] | null;
  start_time: string | null;
  end_time: string | null;
  class_original_fee: number | null;
  class_fee: number | null;
  class_material_fee: number | null;
  instructor_name: string | null;
  min_age_months: number | null;
  max_age_months: number | null;
  schedule_start_date: string | null;
  total_sessions: number | null;
  normalized_status: 'OPEN' | 'CLOSED' | 'WAITING';
  raw_status: string | null;
  register_start_at: string | null;
  is_excluded: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_extra: Record<string, any>;
  detail_fetched_at: string | null;
  collected_at: string;
};

const BRAND_OPTIONS: { key: Brand; label: string }[] = [
  { key: 'emart', label: '이마트' },
  { key: 'lottemart', label: '롯데마트' },
  { key: 'shinsegae', label: '신세계 아카데미' },
  { key: 'hyundai', label: '현대백화점' },
  { key: 'ak_plaza', label: 'AK플라자' },
  { key: 'starfield', label: '스타필드' },
  { key: 'lotte_department', label: '롯데백화점' },
];

const STATUS_OPTIONS: { key: ClassRow['normalized_status']; label: string }[] = [
  { key: 'OPEN', label: 'OPEN(접수가능)' },
  { key: 'WAITING', label: 'WAITING(대기가능)' },
  { key: 'CLOSED', label: 'CLOSED(마감)' },
];

// 이미 본 소개 텍스트 필드(브랜드마다 raw_extra 키가 다름)는 별도 섹션으로
// 보여주고, 나머지 raw_extra 키는 "기타 정보"로 일괄 나열한다 — 브랜드마다
// 전용 레이아웃을 전부 손으로 만들면 5개가 될 때 유지보수 부담이 커진다.
const INTRO_KEYS = new Set(['class_detail_title', 'class_detail_content', 'class_intro', 'class_tip']);

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatTimeRange(start: string | null, end: string | null) {
  const fmt = (t: string | null) => (t && t.length === 4 ? `${t.slice(0, 2)}:${t.slice(2)}` : t ?? '-');
  return `${fmt(start)} ~ ${fmt(end)}`;
}

function statusBadgeClassName(status: ClassRow['normalized_status']) {
  if (status === 'OPEN') return 'bg-emerald-600 text-white';
  if (status === 'WAITING') return 'bg-amber-500 text-white';
  return 'bg-gray-300 text-gray-600';
}

function DetailModal({ row, onClose }: { row: ClassRow; onClose: () => void }) {
  const introTitle = (row.raw_extra.class_detail_title ?? null) as string | null;
  const introBody = (row.raw_extra.class_detail_content ?? row.raw_extra.class_intro ?? null) as string | null;
  const introTip = (row.raw_extra.class_tip ?? null) as string | null;
  const otherExtraEntries = Object.entries(row.raw_extra).filter(([key, value]) => !INTRO_KEYS.has(key) && value != null && value !== '');

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <span className="text-[11px] font-semibold text-gray-400">{BRAND_OPTIONS.find((b) => b.key === row.brand)?.label ?? row.brand}</span>
            <h2 className="text-sm font-bold text-gray-900">{row.class_title}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 shrink-0">
            ✕
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600 mb-4">
          <dt className="text-gray-400">지점</dt>
          <dd>{row.store_name ?? '-'}</dd>
          <dt className="text-gray-400">분류</dt>
          <dd>
            {row.main_category_name ?? '-'}
            {row.sub_category_name ? ` > ${row.sub_category_name}` : ''}
          </dd>
          <dt className="text-gray-400">연령</dt>
          <dd>
            {row.min_age_months ?? '-'}~{row.max_age_months ?? '-'}개월
          </dd>
          <dt className="text-gray-400">강사</dt>
          <dd>{row.instructor_name ?? '-'}</dd>
          <dt className="text-gray-400">요일/시간</dt>
          <dd>
            {(row.class_day ?? []).join(',')} {formatTimeRange(row.start_time, row.end_time)}
          </dd>
          <dt className="text-gray-400">수강료</dt>
          <dd>
            {row.total_sessions != null ? `${row.total_sessions}회 ` : ''}
            {row.class_original_fee != null && <span className="line-through mr-1">{row.class_original_fee.toLocaleString('ko-KR')}원</span>}
            {row.class_fee != null ? `${row.class_fee.toLocaleString('ko-KR')}원` : '-'}
            {row.class_material_fee != null ? ` (+재료비 ${row.class_material_fee.toLocaleString('ko-KR')}원)` : ''}
          </dd>
          <dt className="text-gray-400">개강일</dt>
          <dd>{row.schedule_start_date ?? '-'}</dd>
          <dt className="text-gray-400">상태</dt>
          <dd>
            {row.raw_status ?? row.normalized_status}({row.normalized_status})
          </dd>
        </dl>

        {(introBody || introTip) && (
          <div className="mb-4 flex flex-col gap-2">
            {introTitle && <p className="text-sm font-semibold text-gray-900">{introTitle}</p>}
            {introBody && <p className="text-sm text-gray-700 whitespace-pre-line">{introBody}</p>}
            {introTip && (
              <div>
                <p className="text-xs font-semibold text-gray-900 mb-1">수강 Tip</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{introTip}</p>
              </div>
            )}
          </div>
        )}
        {!row.detail_fetched_at && <p className="text-xs text-gray-400 mb-4">아직 상세정보가 수집되지 않았습니다.</p>}

        {otherExtraEntries.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-900 mb-1">기타 정보(브랜드 전용 필드)</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500">
              {otherExtraEntries.map(([key, value]) => (
                <Fragment key={key}>
                  <dt className="text-gray-400">{key}</dt>
                  <dd className="break-words">{String(value)}</dd>
                </Fragment>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

export function CultureClubPanel() {
  const [rows, setRows] = useState<ClassRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<Set<Brand>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [storeFilter, setStoreFilter] = useState<Set<string>>(new Set());
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [selectedRow, setSelectedRow] = useState<ClassRow | null>(null);

  // [지점 목록 — 브랜드별 전용 목록을 복합 값으로 합친다] store_code
  // 네임스페이스가 브랜드마다 달라 `${brand}:${storeCode}`로 구분한다.
  useEffect(() => {
    Promise.all([
      fetch('/api/culture-club/stores')
        .then((res) => res.json())
        .then((data: { stores?: { storeCode: string; label: string }[] }) =>
          (data.stores ?? []).map((s) => ({ storeCode: `emart:${s.storeCode}`, label: `[이마트] ${s.label}` }))
        )
        .catch(() => []),
      fetch('/api/culture-club/lottemart-stores')
        .then((res) => res.json())
        .then((data: { stores?: { storeCode: string; label: string }[] }) =>
          (data.stores ?? []).map((s) => ({ storeCode: `lottemart:${s.storeCode}`, label: `[롯데마트] ${s.label}` }))
        )
        .catch(() => []),
      fetch('/api/culture-club/shinsegae-stores')
        .then((res) => res.json())
        .then((data: { stores?: { storeCode: string; label: string }[] }) =>
          (data.stores ?? []).map((s) => ({ storeCode: `shinsegae:${s.storeCode}`, label: `[신세계] ${s.label}` }))
        )
        .catch(() => []),
      fetch('/api/culture-club/hyundai-stores')
        .then((res) => res.json())
        .then((data: { stores?: { storeCode: string; label: string }[] }) =>
          (data.stores ?? []).map((s) => ({ storeCode: `hyundai:${s.storeCode}`, label: `[현대백화점] ${s.label}` }))
        )
        .catch(() => []),
      fetch('/api/culture-club/akplaza-stores')
        .then((res) => res.json())
        .then((data: { stores?: { storeCode: string; label: string }[] }) =>
          (data.stores ?? []).map((s) => ({ storeCode: `ak_plaza:${s.storeCode}`, label: `[AK플라자] ${s.label}` }))
        )
        .catch(() => []),
      fetch('/api/culture-club/starfield-stores')
        .then((res) => res.json())
        .then((data: { stores?: { storeCode: string; label: string }[] }) =>
          (data.stores ?? []).map((s) => ({ storeCode: `starfield:${s.storeCode}`, label: `[스타필드] ${s.label}` }))
        )
        .catch(() => []),
      fetch('/api/culture-club/lotte-department-stores')
        .then((res) => res.json())
        .then((data: { stores?: { storeCode: string; label: string }[] }) =>
          (data.stores ?? []).map((s) => ({ storeCode: `lotte_department:${s.storeCode}`, label: `[롯데백화점] ${s.label}` }))
        )
        .catch(() => []),
    ]).then(([emartStores, lottemartStores, shinsegaeStores, hyundaiStores, akplazaStores, starfieldStores, lotteDepartmentStores]) =>
      setStores([
        ...emartStores,
        ...lottemartStores,
        ...shinsegaeStores,
        ...hyundaiStores,
        ...akplazaStores,
        ...starfieldStores,
        ...lotteDepartmentStores,
      ])
    );
  }, []);

  function toggleBrand(brand: Brand) {
    setBrandFilter((prev) => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  }

  function loadRows() {
    setIsLoading(true);
    setErrorMessage(null);
    const params = new URLSearchParams();
    if (brandFilter.size > 0) params.set('brand', [...brandFilter].join(','));
    if (statusFilter) params.set('normalized_status', statusFilter);
    if (storeFilter.size > 0) params.set('store', [...storeFilter].join(','));

    fetch(`/api/admin/culture-club?${params.toString()}`)
      .then((res) => res.json())
      .then((data: { rows?: ClassRow[]; total?: number; error?: string }) => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setIsLoading(false));
  }

  function toggleExcluded(id: number, nextExcluded: boolean) {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, is_excluded: nextExcluded } : r)) ?? null);

    fetch('/api/admin/culture-club', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_excluded: nextExcluded }),
    })
      .then((res) => res.json())
      .then((data: { error?: string }) => {
        if (data.error) throw new Error(data.error);
      })
      .catch((err: Error) => {
        setErrorMessage(`노출 제외 처리 실패: ${err.message}`);
        setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, is_excluded: !nextExcluded } : r)) ?? null);
      });
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <p className="text-sm text-gray-500 mb-3">
        문화센터 강좌 통합 리스트(검토용 — 이마트/롯데마트 외 브랜드가 늘어나도 이 화면 하나로 조회합니다). 전체 2만여 건 규모라
        브랜드/상태/지점으로 좁혀서 조회하는 걸 권장합니다.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1">
          {BRAND_OPTIONS.map((brand) => (
            <button
              key={brand.key}
              type="button"
              aria-pressed={brandFilter.has(brand.key)}
              onClick={() => toggleBrand(brand.key)}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                brandFilter.has(brand.key) ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {brand.label}
            </button>
          ))}
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-300 text-xs px-2 py-1.5">
          <option value="">전체 상태</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <StoreMultiSelect stores={stores} selected={storeFilter} onChange={setStoreFilter} />
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
        <p className="text-sm text-gray-400">브랜드/상태/지점을 선택하고 &apos;조회하기&apos;를 눌러 수집 결과를 불러오세요.</p>
      )}

      {rows !== null && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600">
                <th className="py-2 px-3">노출 제외</th>
                <th className="py-2 px-3">브랜드</th>
                <th className="py-2 px-3">강좌명</th>
                <th className="py-2 px-3">지점</th>
                <th className="py-2 px-3">요일/시간</th>
                <th className="py-2 px-3">상태</th>
                <th className="py-2 px-3">가격</th>
                <th className="py-2 px-3">수집 시각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedRow(row)}
                  className={`cursor-pointer hover:bg-blue-50/50 ${
                    row.is_excluded ? 'bg-gray-100 opacity-60' : row.normalized_status === 'WAITING' ? 'bg-amber-50' : 'bg-white'
                  }`}
                >
                  <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={row.is_excluded}
                      onChange={(e) => toggleExcluded(row.id, e.target.checked)}
                      aria-label={`${row.class_title} 노출 제외`}
                    />
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-500">
                    {BRAND_OPTIONS.find((b) => b.key === row.brand)?.label ?? row.brand}
                  </td>
                  <td className={`py-2 px-3 max-w-xs truncate ${row.is_excluded ? 'line-through' : ''}`} title={row.class_title}>
                    {row.class_title}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">{row.store_name ?? '-'}</td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {(row.class_day ?? []).join(',')} {formatTimeRange(row.start_time, row.end_time)}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadgeClassName(row.normalized_status)}`}>
                      {row.raw_status ?? row.normalized_status}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-600">
                    {row.class_fee != null ? `${row.class_fee.toLocaleString('ko-KR')}원` : '-'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap text-xs text-gray-400">{formatDateTime(row.collected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-sm text-gray-400 text-center py-6">조건에 맞는 데이터가 없습니다.</p>}
        </div>
      )}

      {selectedRow && <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
