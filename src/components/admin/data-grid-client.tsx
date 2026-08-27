'use client';

import { useEffect, useMemo, useState } from 'react';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { RawDataModal } from '@/components/admin/raw-data-modal';
import { CategoryRulesModal } from '@/components/admin/category-rules-modal';
import { Pagination } from '@/components/admin/pagination';

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
  category_maj: string | null;
  category_min: string | null;
  category_min_source: string | null;
  target_audience: string | null;
  target_audience_source: string | null;
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

type TriState = 'all' | 'true' | 'false';
const TRI_STATE_LABEL: Record<TriState, string> = { all: '전체', true: '예', false: '아니오' };

const PAGE_SIZE_OPTIONS = [50, 100, 200];

// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
// 서버(src/app/api/admin/data-grid/route.ts)와 동일한 NULL 선택 예약 토큰. 실제 category_min/
// target_audience 값과 절대 겹치지 않도록 이중 밑줄로 감싼 식별자를 쓴다.
const NULL_FILTER_TOKEN = '__NULL__';

// [10대 타겟 분류 체계 실제 적용](2026-08-27): 고정 태그라 category_min과 달리 RPC로
// DB에서 discover하지 않고 하드코딩한다(값 자체가 스펙으로 확정된 enum).
// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선] 후속 지시(2026-08-27): NULL/ALL
// 중 유아/어린이/가족 관련 신호가 있어 수동 검수가 필요한 행을 모아두는 'OTHER'(기타) 추가.
const TARGET_AUDIENCE_TAGS = [
  'INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY', 'TEEN', 'YOUTH', 'ADULT', 'SENIOR', 'ALL', 'FACILITY', 'OTHER',
] as const;

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

// [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
// 표준 중분류/타겟 연령 필터를 단일 셀렉트 드롭다운에서 실제 체크박스 목록으로 변경한다.
// includeNullOption이 true면 목록 맨 앞에 "미지정(NULL)" 체크박스를 추가로 렌더링한다 —
// 기존 값 배열(options)에는 실제 NULL이 포함될 수 없으므로(DB distinct values), 이 옵션을
// 별도로 붙여야 사용자가 NULL 데이터도 체크박스로 선택해 조회할 수 있다.
function CheckboxMultiSelect({
  label,
  options,
  selected,
  onToggle,
  includeNullOption = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  includeNullOption?: boolean;
}) {
  if (options.length === 0 && !includeNullOption) return null;
  return (
    <div className="flex flex-wrap items-start gap-1.5">
      <span className="text-xs text-gray-500 shrink-0 pt-1">{label}</span>
      <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-2xl">
        {includeNullOption && (
          <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
            <input
              type="checkbox"
              checked={selected.includes(NULL_FILTER_TOKEN)}
              onChange={() => onToggle(NULL_FILTER_TOKEN)}
            />
            미지정(NULL)
          </label>
        )}
        {options.map((opt) => (
          <label key={opt} className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
            <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

// [카테고리 정제 & 어드민 확장](2026-08-26): category_min_source(RAW/RULE/MANUAL) 출처 뱃지.
const CATEGORY_MIN_SOURCE_STYLE: Record<string, string> = {
  RAW: 'bg-emerald-100 text-emerald-700',
  RULE: 'bg-blue-100 text-blue-700',
  MANUAL: 'bg-purple-100 text-purple-700',
};

// [7대 대분류 실제 적용](2026-08-26): categoryMaj가 있으면(events, category_maj 컬럼 신규)
// "대분류 › 중분류" 형태로 함께 보여준다 — open_spaces는 이 컬럼이 없어 categoryMaj가 항상
// undefined이며 기존과 동일하게 중분류만 표시된다.
function CategoryMinBadge({
  categoryMin,
  categoryMaj,
  source,
}: {
  categoryMin: string | null;
  categoryMaj?: string | null;
  source: string | null;
}) {
  if (!categoryMin) return <span className="text-xs text-gray-300">NULL</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-gray-700">
        {categoryMaj && <span className="text-gray-400">{categoryMaj} › </span>}
        {categoryMin}
      </span>
      {source && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${CATEGORY_MIN_SOURCE_STYLE[source] ?? 'bg-gray-100 text-gray-600'}`}>
          {source}
        </span>
      )}
    </span>
  );
}

// [10대 타겟 분류 체계 실제 적용](2026-08-27): target_audience_source(RAW_FIELD/CATEGORY/
// TEXT/MANUAL) 출처 뱃지 — CATEGORY_MIN_SOURCE_STYLE과 동일 관례, 색만 별도 팔레트로 구분.
const TARGET_AUDIENCE_SOURCE_STYLE: Record<string, string> = {
  RAW_FIELD: 'bg-emerald-100 text-emerald-700',
  CATEGORY: 'bg-amber-100 text-amber-700',
  TEXT: 'bg-blue-100 text-blue-700',
  MANUAL: 'bg-purple-100 text-purple-700',
  // NULL/ALL 중 유아/어린이/가족 관련 신호가 있어 수동 검수가 필요한 행 — 눈에 띄도록 경고색.
  OTHER: 'bg-red-100 text-red-700',
};

function TargetAudienceBadge({ targetAudience, source }: { targetAudience: string | null; source: string | null }) {
  if (!targetAudience) return <span className="text-xs text-gray-300">NULL</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-gray-700">{targetAudience}</span>
      {source && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TARGET_AUDIENCE_SOURCE_STYLE[source] ?? 'bg-gray-100 text-gray-600'}`}>
          {source}
        </span>
      )}
    </span>
  );
}

export function AdminDataGridClient({ filterOptions }: { filterOptions: FilterOptions }) {
  const [tab, setTab] = useState<AdminTable>('open_spaces');

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [minClassName, setMinClassName] = useState('');
  // [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
  // 체크박스를 누를 때마다 즉시 쿼리가 나가지 않도록, 선택 상태를 "대기(pending)"와
  // "적용(applied)" 두 단계로 나눈다 — 체크박스는 pending만 바꾸고, 실제 조회 파라미터/
  // fetch effect는 applied만 바라본다. [조회하기] 버튼을 눌러야 pending → applied로 반영되어
  // 그 순간 단 한 번만 쿼리가 실행된다. 다른 필터(검색어/칩/토글)는 기존처럼 즉시 반영이라
  // 이 두 필터만 별도로 관리한다.
  const [pendingCategoryMin, setPendingCategoryMin] = useState<string[]>([]);
  const [appliedCategoryMin, setAppliedCategoryMin] = useState<string[]>([]);
  const [pendingTargetAudience, setPendingTargetAudience] = useState<string[]>([]);
  const [appliedTargetAudience, setAppliedTargetAudience] = useState<string[]>([]);
  const hasPendingFilterChanges =
    pendingCategoryMin.join(',') !== appliedCategoryMin.join(',') ||
    pendingTargetAudience.join(',') !== appliedTargetAudience.join(',');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  // [0순위 우선 요청](2026-08-26): "기본 조회 조건에 WHERE is_active = true를 적용" — 다른
  // tri-state 필터와 달리 기본값이 'all'이 아니라 'true'다(비활성 만료 데이터가 기본적으로
  // 섞여 나오지 않도록). events 탭에만 의미가 있다(open_spaces에는 is_active 컬럼이 없음).
  const [isActive, setIsActive] = useState<TriState>('true');
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
    setPendingCategoryMin([]);
    setAppliedCategoryMin([]);
    setPendingTargetAudience([]);
    setAppliedTargetAudience([]);
    setIsActive('true');
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
  }, [debouncedQ, sourceTypes, sources, categories, minClassName, appliedCategoryMin, appliedTargetAudience, isActive]);

  // [행사 데이터 수집/정제 파이프라인 및 홈 피드 필터링 개선](2026-08-27) 사용자 지시 4번:
  // [조회하기] 버튼 클릭 시 pending → applied로 한 번에 반영한다 — 이 시점에만 아래 fetch
  // effect가 재실행된다(체크박스를 누르는 매 순간이 아니라).
  const applyPendingFilters = () => {
    setAppliedCategoryMin(pendingCategoryMin);
    setAppliedTargetAudience(pendingTargetAudience);
  };

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
    if (appliedCategoryMin.length > 0) params.set('category_min', appliedCategoryMin.join(','));
    if (tab === 'events' && appliedTargetAudience.length > 0) params.set('target_audience', appliedTargetAudience.join(','));
    if (tab === 'events') params.set('is_active', isActive);
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
  }, [tab, debouncedQ, sourceTypes, sources, categories, minClassName, appliedCategoryMin, appliedTargetAudience, isActive, page, pageSize]);

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
          <CheckboxMultiSelect
            label="표준 중분류(category_min)"
            options={currentOptions.categoryMins}
            selected={pendingCategoryMin}
            includeNullOption
            onToggle={(v) =>
              setPendingCategoryMin((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
            }
          />
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
          </div>
        )}

        {tab === 'events' && (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <TriStateToggle label="✅ 활성 상태(is_active)" value={isActive} onChange={setIsActive} />
          </div>
        )}

        {tab === 'events' && (
          <CheckboxMultiSelect
            label="타겟 연령(target_audience)"
            options={[...TARGET_AUDIENCE_TAGS]}
            selected={pendingTargetAudience}
            includeNullOption
            onToggle={(v) =>
              setPendingTargetAudience((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]))
            }
          />
        )}

        {tab !== 'raw_ingest_data' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={applyPendingFilters}
              className={`text-xs font-semibold rounded-full px-3 py-1.5 transition-colors ${
                hasPendingFilterChanges ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              🔍 조회하기
            </button>
            {hasPendingFilterChanges && (
              <span className="text-[11px] text-amber-600">
                중분류/타겟 연령 선택이 변경됐습니다 — 조회하기를 눌러야 반영됩니다.
              </span>
            )}
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
              <tr className="sticky top-0 z-10 bg-white border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-600 shadow-[0_1px_0_0_rgba(0,0,0,0.04)]">
                <th className="py-2.5 pr-3">ID</th>
                <th className="py-2.5 pr-3">출처</th>
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">원천 대/중분류</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">표준 중분류</th>}
                {tab === 'events' && <th className="py-2.5 pr-3">타겟 연령</th>}
                <th className="py-2.5 pr-3">{tab === 'raw_ingest_data' ? '수집 시각' : '제목/명칭'}</th>
                {tab === 'events' && <th className="py-2.5 pr-3">행사기간(start~end)</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">장소/시설명</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">주소</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">위도/경도</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">요금</th>}
                {tab !== 'raw_ingest_data' && <th className="py-2.5 pr-3">접수상태</th>}
                <th className="py-2.5 pr-3">{tab === 'raw_ingest_data' ? '' : '수정/적재일'}</th>
                <th className="py-2.5 pr-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const zebraClass = rowIndex % 2 === 1 ? 'bg-gray-50/60' : 'bg-white';
                if (tab === 'raw_ingest_data') {
                  const r = row as AdminRawIngestRow;
                  return (
                    <tr
                      key={`${r.source}-${r.source_id}`}
                      onClick={() => setSelectedRow(row)}
                      className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer ${zebraClass}`}
                    >
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
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRow(row)}
                    className={`border-b border-gray-100 hover:bg-blue-50 cursor-pointer ${zebraClass}`}
                  >
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
                      <CategoryMinBadge
                        categoryMin={r.category_min}
                        categoryMaj={isEvent ? (r as AdminEventRow).category_maj : undefined}
                        source={r.category_min_source}
                      />
                    </td>
                    {isEvent && (
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <TargetAudienceBadge
                          targetAudience={(r as AdminEventRow).target_audience}
                          source={(r as AdminEventRow).target_audience_source}
                        />
                      </td>
                    )}
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
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      </div>

      {selectedRow && tab !== 'raw_ingest_data' && (
        <RawDataModal
          table={tab}
          row={selectedRow}
          categoryMinOptions={currentOptions && 'categoryMins' in currentOptions ? currentOptions.categoryMins : []}
          targetAudienceOptions={tab === 'events' ? [...TARGET_AUDIENCE_TAGS] : []}
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
          onTargetAudienceUpdated={(id, nextTargetAudience, nextSource) => {
            setRows((prev) =>
              prev.map((row) =>
                'id' in row && row.id === id
                  ? { ...row, target_audience: nextTargetAudience, target_audience_source: nextSource }
                  : row
              )
            );
            setSelectedRow((prev) =>
              prev && 'id' in prev && prev.id === id
                ? { ...prev, target_audience: nextTargetAudience, target_audience_source: nextSource }
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
