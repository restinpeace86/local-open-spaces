'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { RawDataModal } from '@/components/admin/raw-data-modal';
import { CategoryRulesModal } from '@/components/admin/category-rules-modal';

export type AdminTable = 'open_spaces' | 'events' | 'raw_ingest_data';

export type AdminOpenSpaceRow = {
  id: string;
  external_id: string;
  source_type: string;
  source: string | null;
  name: string;
  category: string;
  category_min: string | null;
  category_min_source: string | null;
  address: string;
  location: unknown;
  location_precision: string;
  is_free: boolean | null;
  operating_hours: string | null;
  info_url: string | null;
  is_kids_friendly: boolean;
  has_parking: boolean;
  stroller_accessible: boolean;
  facility_type: string;
  target_age_group: string | null;
  raw_data: unknown;
  sigungu_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AdminEventRow = {
  id: string;
  external_id: string;
  source: string | null;
  title: string;
  event_type: string;
  category_min: string | null;
  category_min_source: string | null;
  venue_name: string | null;
  sigungu_name: string | null;
  start_date: string;
  end_date: string;
  location: unknown;
  location_precision: string;
  is_reservation_required: boolean | null;
  reservation_url: string | null;
  reservation_start_date: string | null;
  reservation_end_date: string | null;
  is_free: boolean | null;
  thumbnail_url: string | null;
  is_kids_friendly: boolean;
  has_parking: boolean;
  stroller_accessible: boolean;
  facility_type: string;
  target_age_group: string | null;
  booking_status: string | null;
  is_active: boolean | null;
  raw_data: unknown;
  created_at: string | null;
};

export type AdminRawIngestRow = {
  source: string;
  source_id: string;
  fetched_at: string;
  raw_payload: unknown;
};

export type AdminRow = AdminOpenSpaceRow | AdminEventRow | AdminRawIngestRow;

type FilterOptions = {
  open_spaces: {
    sourceTypes: string[];
    sources: string[];
    categories: string[];
    minClassNames: string[];
    svcStatNms: string[];
    categoryMins: string[];
  };
  events: {
    sources: string[];
    categories: string[];
    minClassNames: string[];
    svcStatNms: string[];
    categoryMins: string[];
  };
  raw_ingest_data: { sources: string[] };
};

type SummaryMetrics = Record<string, number | null>;

type TriState = 'all' | 'true' | 'false';
const TRI_STATE_LABEL: Record<TriState, string> = { all: '전체', true: '예', false: '아니오' };

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const TAB_LABEL: Record<AdminTable, string> = {
  open_spaces: 'open_spaces (공간·시설)',
  events: 'events (행사·체험)',
  raw_ingest_data: 'raw_ingest_data (원천 보존)',
};

function extractLngLat(location: unknown): { lng: number; lat: number } | null {
  const geometry = location as { coordinates?: [number, number] } | null;
  if (!geometry?.coordinates) return null;
  return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
}

function rawField(raw: unknown, key: string): string | null {
  const obj = raw as Record<string, unknown> | null;
  const value = obj?.[key];
  return typeof value === 'string' ? value : null;
}

function TriStateToggle({ label, value, onChange }: { label: string; value: TriState; onChange: (next: TriState) => void }) {
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

function ChipMultiSelect({
  label,
  options,
  selected,
  onToggle,
  colorFor,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  colorFor?: (value: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="text-xs text-gray-500 self-center shrink-0">{label}</span>
      {options.map((opt) => {
        const isActive = selected.includes(opt);
        const color = colorFor?.(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors"
            style={
              color
                ? isActive
                  ? { backgroundColor: color, borderColor: color, color: 'white' }
                  : { borderColor: '#d1d5db', color: '#374151', backgroundColor: 'white' }
                : isActive
                  ? { backgroundColor: '#111827', borderColor: '#111827', color: 'white' }
                  : { borderColor: '#d1d5db', color: '#374151', backgroundColor: 'white' }
            }
          >
            {label === '카테고리' ? getCategoryMeta(opt).label : opt}
          </button>
        );
      })}
    </div>
  );
}

// [카테고리 정제 & 어드민 확장](2026-08-26): category_min_source(RAW/RULE/MANUAL) 출처 뱃지.
const CATEGORY_MIN_SOURCE_STYLE: Record<string, string> = {
  RAW: 'bg-emerald-100 text-emerald-700',
  RULE: 'bg-blue-100 text-blue-700',
  MANUAL: 'bg-purple-100 text-purple-700',
};

function CategoryMinBadge({ categoryMin, source }: { categoryMin: string | null; source: string | null }) {
  if (!categoryMin) return <span className="text-xs text-gray-300">NULL</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-gray-700">{categoryMin}</span>
      {source && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_MIN_SOURCE_STYLE[source] ?? 'bg-gray-100 text-gray-600'}`}>
          {source}
        </span>
      )}
    </span>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: number | null; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2 min-w-[110px]">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">
        {value === null ? <span className="text-sm text-gray-300">집계 지연</span> : value.toLocaleString('ko-KR')}
      </p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}

export function AdminDataGridClient({ filterOptions }: { filterOptions: FilterOptions }) {
  const [tab, setTab] = useState<AdminTable>('open_spaces');

  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/data-grid/summary')
      .then((res) => res.json())
      .then((json: SummaryMetrics) => {
        if (!cancelled) setSummary(json);
      })
      .catch(() => {
        if (!cancelled) setSummary({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [minClassName, setMinClassName] = useState('');
  const [svcStatNm, setSvcStatNm] = useState('');
  const [categoryMin, setCategoryMin] = useState('');
  const [missingCategoryMin, setMissingCategoryMin] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  // [0순위 우선 요청](2026-08-26): "기본 조회 조건에 WHERE is_active = true를 적용" — 다른
  // tri-state 필터와 달리 기본값이 'all'이 아니라 'true'다(비활성 만료 데이터가 기본적으로
  // 섞여 나오지 않도록). events 탭에만 의미가 있다(open_spaces에는 is_active 컬럼이 없음).
  const [isActive, setIsActive] = useState<TriState>('true');
  const [isFree, setIsFree] = useState<TriState>('all');
  const [hasParking, setHasParking] = useState<TriState>('all');
  const [strollerAccessible, setStrollerAccessible] = useState<TriState>('all');
  const [isKidsFriendly, setIsKidsFriendly] = useState<TriState>('all');
  const [missingLocation, setMissingLocation] = useState(false);
  const [missingFee, setMissingFee] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<AdminRow | null>(null);

  const resetFilters = () => {
    setQ('');
    setSourceTypes([]);
    setSources([]);
    setCategories([]);
    setMinClassName('');
    setSvcStatNm('');
    setCategoryMin('');
    setMissingCategoryMin(false);
    setIsActive('true');
    setIsFree('all');
    setHasParking('all');
    setStrollerAccessible('all');
    setIsKidsFriendly('all');
    setMissingLocation(false);
    setMissingFee(false);
  };

  const switchTab = (next: AdminTable) => {
    setTab(next);
    resetFilters();
    setPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, sourceTypes, sources, categories, minClassName, svcStatNm, categoryMin, missingCategoryMin, isActive, isFree, hasParking, strollerAccessible, isKidsFriendly, missingLocation, missingFee]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    params.set('table', tab);
    if (debouncedQ) params.set('q', debouncedQ);
    if (sourceTypes.length > 0) params.set('source_type', sourceTypes.join(','));
    if (sources.length > 0) params.set('source', sources.join(','));
    if (categories.length > 0) params.set('category', categories.join(','));
    if (minClassName) params.set('min_class_name', minClassName);
    if (svcStatNm) params.set('svc_stat_nm', svcStatNm);
    if (categoryMin) params.set('category_min', categoryMin);
    if (missingCategoryMin) params.set('missing_category_min', 'true');
    if (tab === 'events') params.set('is_active', isActive);
    if (isFree !== 'all') params.set('is_free', isFree);
    if (hasParking !== 'all') params.set('has_parking', hasParking);
    if (strollerAccessible !== 'all') params.set('stroller_accessible', strollerAccessible);
    if (isKidsFriendly !== 'all') params.set('is_kids_friendly', isKidsFriendly);
    if (missingLocation) params.set('missing_location', 'true');
    if (missingFee) params.set('missing_fee', 'true');
    params.set('page', String(page));
    params.set('page_size', String(pageSize));

    fetch(`/api/admin/data-grid?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '데이터 조회 실패');
        return json as { rows: AdminRow[]; total: number };
      })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedQ, sourceTypes, sources, categories, minClassName, svcStatNm, categoryMin, missingCategoryMin, isActive, isFree, hasParking, strollerAccessible, isKidsFriendly, missingLocation, missingFee, page, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);
  const currentOptions = filterOptions[tab];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 p-4 border-b border-gray-100 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-sm font-bold text-gray-900">Admin Data Grid</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsRulesModalOpen(true)}
              className="text-xs font-semibold text-white bg-gray-900 rounded-full px-3 py-1.5 hover:bg-gray-700"
            >
              카테고리 키워드 규칙 관리
            </button>
            <button type="button" onClick={resetFilters} className="text-xs text-gray-500 hover:text-gray-800 underline">
              필터 초기화
            </button>
          </div>
        </div>

        {/* 1. 요약 메트릭 카드 */}
        <div className="flex flex-wrap gap-2">
          <MetricCard label="open_spaces 총 건수" value={summary?.open_spaces_count ?? null} />
          <MetricCard label="events 총 건수" value={summary?.events_count ?? null} />
          <MetricCard label="raw_ingest_data 총 건수" value={summary?.raw_ingest_data_count ?? null} />
          <MetricCard label="위치/좌표 NULL" value={(summary?.open_spaces_missing_location ?? 0) + (summary?.events_missing_location ?? 0)} sub="open_spaces+events" />
          <MetricCard label="주소 NULL(open_spaces)" value={summary?.open_spaces_missing_address ?? null} />
          <MetricCard label="요금 NULL" value={(summary?.open_spaces_missing_fee ?? 0) + (summary?.events_missing_fee ?? 0)} sub="open_spaces+events" />
          <MetricCard label="예약/정보 URL NULL" value={(summary?.open_spaces_missing_url ?? 0) + (summary?.events_missing_reservation_url ?? 0)} sub="open_spaces+events" />
        </div>

        {/* 2. 탭 구성 */}
        <div className="flex gap-1.5 border-b border-gray-100 -mb-3 pb-3">
          {(Object.keys(TAB_LABEL) as AdminTable[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg transition-colors ${
                tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {/* 3. 필터 및 검색 바 */}
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === 'raw_ingest_data' ? 'source_id 검색' : '제목/시설명, 주소 키워드 검색'}
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />

        {tab === 'open_spaces' && (
          <ChipMultiSelect
            label="출처(source_type)"
            options={filterOptions.open_spaces.sourceTypes}
            selected={sourceTypes}
            onToggle={(v) => setSourceTypes((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))}
          />
        )}
        <ChipMultiSelect
          label="출처(source)"
          options={currentOptions.sources}
          selected={sources}
          onToggle={(v) => setSources((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))}
        />
        {tab !== 'raw_ingest_data' && 'categories' in currentOptions && (
          <ChipMultiSelect
            label="카테고리"
            options={currentOptions.categories}
            selected={categories}
            onToggle={(v) => setCategories((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))}
            colorFor={(v) => getCategoryMeta(v).color}
          />
        )}

        {tab !== 'raw_ingest_data' && 'categoryMins' in currentOptions && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              표준 중분류(category_min)
              <select
                value={categoryMin}
                onChange={(e) => setCategoryMin(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">전체</option>
                {currentOptions.categoryMins.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={missingCategoryMin}
                onChange={(e) => setMissingCategoryMin(e.target.checked)}
              />
              중분류 NULL만 보기
            </label>
          </div>
        )}

        {tab !== 'raw_ingest_data' && 'minClassNames' in currentOptions && (
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              원천 중분류
              <select
                value={minClassName}
                onChange={(e) => setMinClassName(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">전체</option>
                {currentOptions.minClassNames.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              접수/이용 상태
              <select
                value={svcStatNm}
                onChange={(e) => setSvcStatNm(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="">전체</option>
                {currentOptions.svcStatNms.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {tab === 'events' && (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <TriStateToggle label="✅ 활성 상태(is_active)" value={isActive} onChange={setIsActive} />
          </div>
        )}

        {tab !== 'raw_ingest_data' && (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <TriStateToggle label="무료" value={isFree} onChange={setIsFree} />
            <TriStateToggle label="🅿️ 주차" value={hasParking} onChange={setHasParking} />
            <TriStateToggle label="👶 유모차" value={strollerAccessible} onChange={setStrollerAccessible} />
            <TriStateToggle label="🛝 키즈친화" value={isKidsFriendly} onChange={setIsKidsFriendly} />
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={missingLocation} onChange={(e) => setMissingLocation(e.target.checked)} />
              주소/좌표 NULL만 보기
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={missingFee} onChange={(e) => setMissingFee(e.target.checked)} />
              요금 NULL만 보기
            </label>
          </div>
        )}
      </div>

      {/* 4. 테이블 그리드 */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && <p className="text-sm text-gray-400">불러오는 중...</p>}
        {errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
        {!isLoading && !errorMessage && rows.length === 0 && <p className="text-sm text-gray-400">조건에 맞는 데이터가 없습니다.</p>}

        {!isLoading && !errorMessage && rows.length > 0 && (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">출처</th>
                {tab !== 'raw_ingest_data' && <th className="py-2 pr-3">원천 대/중분류</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2 pr-3">표준 중분류</th>}
                <th className="py-2 pr-3">{tab === 'raw_ingest_data' ? '수집 시각' : '제목/명칭'}</th>
                {tab === 'events' && <th className="py-2 pr-3">행사기간(start~end)</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2 pr-3">장소/시설명</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2 pr-3">주소</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2 pr-3">위도/경도</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2 pr-3">요금</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2 pr-3">접수상태</th>}
                <th className="py-2 pr-3">{tab === 'raw_ingest_data' ? '' : '수정/적재일'}</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                if (tab === 'raw_ingest_data') {
                  const r = row as AdminRawIngestRow;
                  return (
                    <tr key={`${r.source}-${r.source_id}`} onClick={() => setSelectedRow(row)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                      <td className="py-2 pr-3 font-mono text-xs text-gray-900">{r.source_id}</td>
                      <td className="py-2 pr-3 text-gray-600">{r.source}</td>
                      <td className="py-2 pr-3 text-gray-600">{new Date(r.fetched_at).toLocaleString('ko-KR')}</td>
                      <td className="py-2 pr-3" />
                      <td className="py-2 pr-3 text-right text-xs text-blue-600">상세</td>
                    </tr>
                  );
                }

                const isEvent = tab === 'events';
                const r = row as AdminOpenSpaceRow | AdminEventRow;
                const titleText = isEvent ? (r as AdminEventRow).title : (r as AdminOpenSpaceRow).name;
                const venueText = isEvent ? (r as AdminEventRow).venue_name ?? '-' : (r as AdminOpenSpaceRow).name;
                const addressText = isEvent ? (r as AdminEventRow).sigungu_name ?? '-' : (r as AdminOpenSpaceRow).address;
                const categoryValue = isEvent ? (r as AdminEventRow).event_type : (r as AdminOpenSpaceRow).category;
                const meta = getCategoryMeta(categoryValue);
                const coords = extractLngLat(r.location);
                const maxClass = rawField(r.raw_data, 'MAXCLASSNM');
                const minClass = rawField(r.raw_data, 'MINCLASSNM');
                const svcStat = rawField(r.raw_data, 'SVCSTATNM');
                const updatedAt = isEvent ? (r as AdminEventRow).created_at : (r as AdminOpenSpaceRow).updated_at ?? (r as AdminOpenSpaceRow).created_at;

                return (
                  <tr key={r.id} onClick={() => setSelectedRow(row)} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="py-2 pr-3 font-mono text-[11px] text-gray-500 max-w-[140px] truncate">{r.external_id}</td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{r.source ?? (isEvent ? '-' : (r as AdminOpenSpaceRow).source_type)}</td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">
                      {maxClass || minClass ? (
                        <span>
                          {maxClass ?? '-'} / {minClass ?? '-'}
                        </span>
                      ) : (
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: meta.color }}
                        >
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <CategoryMinBadge categoryMin={r.category_min} source={r.category_min_source} />
                    </td>
                    <td className="py-2 pr-3 font-medium text-gray-900 max-w-[220px] truncate">{titleText}</td>
                    {isEvent && (
                      <td className="py-2 pr-3 text-gray-600 whitespace-nowrap text-xs">
                        {(r as AdminEventRow).start_date} ~ {(r as AdminEventRow).end_date}
                        {(r as AdminEventRow).is_active === false && (
                          <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">
                            비활성
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3 text-gray-600 max-w-[160px] truncate">{venueText}</td>
                    <td className="py-2 pr-3 text-gray-600 max-w-[200px] truncate">{addressText}</td>
                    <td className="py-2 pr-3 text-gray-500 whitespace-nowrap text-xs">
                      {coords ? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}` : <span className="text-red-500">미존재</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.is_free === true && <span className="text-xs text-green-600">🎁 무료</span>}
                      {r.is_free === false && <span className="text-xs text-gray-600">💰 유료</span>}
                      {r.is_free === null && <span className="text-xs text-gray-300">NULL</span>}
                    </td>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{svcStat ?? '-'}</td>
                    <td className="py-2 pr-3 text-gray-400 whitespace-nowrap text-xs">{updatedAt ? new Date(updatedAt).toLocaleDateString('ko-KR') : '-'}</td>
                    <td className="py-2 pr-3 text-right text-xs text-blue-600">상세</td>
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            페이지당
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}건
                </option>
              ))}
            </select>
          </label>
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
      </div>

      {selectedRow && tab !== 'raw_ingest_data' && (
        <RawDataModal
          table={tab}
          row={selectedRow}
          categoryMinOptions={currentOptions && 'categoryMins' in currentOptions ? currentOptions.categoryMins : []}
          onClose={() => setSelectedRow(null)}
          onCategoryMinUpdated={(id, nextCategoryMin, nextSource) => {
            setRows((prev) =>
              prev.map((row) =>
                'id' in row && row.id === id
                  ? { ...row, category_min: nextCategoryMin, category_min_source: nextSource }
                  : row
              )
            );
            setSelectedRow((prev) =>
              prev && 'id' in prev && prev.id === id
                ? { ...prev, category_min: nextCategoryMin, category_min_source: nextSource }
                : prev
            );
          }}
        />
      )}
      {selectedRow && tab === 'raw_ingest_data' && (
        <RawDataModal table={tab} row={selectedRow} categoryMinOptions={[]} onClose={() => setSelectedRow(null)} />
      )}

      {isRulesModalOpen && <CategoryRulesModal onClose={() => setIsRulesModalOpen(false)} />}
    </div>
  );
}
