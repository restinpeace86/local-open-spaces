'use client';

import { useState } from 'react';
import { ServiceCategory, NULL_CATEGORY_MIN_TOKEN } from '@/lib/admin/service-category';

// [노출 중분류 매핑/중복 스팟 검수 탭 분리](2026-09-05 사용자 지시): "중분류 매핑과
// 중복 스팟 검수 탭을 분리해라" — 기존 SpotDedupPanel 하나에 몰려 있던 "노출 중분류
// 관리"/"노출 중분류 대량 매핑" 두 섹션을 이 자기완결적인 새 탭으로 옮기고, 여기에
// 요청받은 신규 기능(원본 중분류의 데이터 중 여러 건을 골라 노출 중분류로 이동)을
// 추가한다. 중복 스팟 검수/그룹 병합 기능은 spot-dedup-panel.tsx에 그대로 남는다.

const PARENT_CATEGORY_OPTIONS = ['키즈/놀이시설', '농장/체험', '자연/공원', '문화시설'];

// [row-level 다건 매핑](2026-09-05 사용자 지시): "현재 중분류 그냥 노출중분류로 전체
// 선택하는거만 있는데.. 원본 중분류의 데이터들의 다건에 대하여 노출중분류로 다수
// 이동과 관련된 기능도 있으면 좋겠다." 아래 RowPicker가 이 요구사항을 담당한다 —
// 원본 중분류 하나를 고르면 그 중분류에 속한 행을 목록(페이지 단위)으로 보여주고,
// 관리자가 체크박스로 원하는 행만 골라 노출 중분류를 적용한다(카테고리 전체가 아니라
// 그중 일부만).
type AdminOpenSpaceRowLite = { id: string; name: string; address: string | null; category_min: string | null };
const ROW_PICKER_PAGE_SIZE = 50;

function RowPicker({ categoryMinOptions, serviceCategories }: { categoryMinOptions: string[]; serviceCategories: ServiceCategory[] }) {
  const [categoryMin, setCategoryMin] = useState('');
  const [rows, setRows] = useState<AdminOpenSpaceRowLite[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowServiceCategoryId, setRowServiceCategoryId] = useState('');
  const [isApplyingRows, setIsApplyingRows] = useState(false);
  const [rowsResultMessage, setRowsResultMessage] = useState<string | null>(null);

  // [기존 구조 우선] /admin/data-grid가 이미 category_min 필터 + 페이지네이션을
  // 지원하므로(data-grid-client.tsx가 쓰는 것과 동일한 라우트), 행 목록 조회를 위한
  // 새 엔드포인트를 만들지 않고 그대로 재사용한다.
  function fetchRowsPage(targetPage: number) {
    if (!categoryMin) return;
    setIsLoadingRows(true);
    setRowsError(null);
    const params = new URLSearchParams({
      table: 'open_spaces',
      category_min: categoryMin,
      page: String(targetPage),
      page_size: String(ROW_PICKER_PAGE_SIZE),
    });
    fetch(`/api/admin/data-grid?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '목록 조회에 실패했습니다.');
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setPage(targetPage);
      })
      .catch((err) => setRowsError(err instanceof Error ? err.message : '목록 조회에 실패했습니다.'))
      .finally(() => setIsLoadingRows(false));
  }

  function handleSearch() {
    setHasSearched(true);
    setRowsResultMessage(null);
    fetchRowsPage(1);
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApplyRows() {
    if (selectedIds.size === 0) {
      setRowsError('선택된 항목이 없습니다.');
      return;
    }
    if (!rowServiceCategoryId) {
      setRowsError('노출 중분류를 선택해주세요.');
      return;
    }
    const confirmed = window.confirm(`선택한 ${selectedIds.size}건에 노출 중분류를 반영합니다. 계속할까요?`);
    if (!confirmed) return;

    setIsApplyingRows(true);
    setRowsError(null);
    setRowsResultMessage(null);
    fetch('/api/admin/open-spaces/bulk-category-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selectedIds], service_category_id: rowServiceCategoryId }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '적용에 실패했습니다.');
        setRowsResultMessage(`${data.updated_count}건에 노출 중분류를 반영했습니다.`);
        setSelectedIds(new Set());
      })
      .catch((err) => setRowsError(err instanceof Error ? err.message : '적용에 실패했습니다.'))
      .finally(() => setIsApplyingRows(false));
  }

  const totalPages = Math.max(1, Math.ceil(total / ROW_PICKER_PAGE_SIZE));

  return (
    <section className="rounded-xl border border-gray-200 p-4">
      <h2 className="text-sm font-bold text-gray-900 mb-3">🎯 선택 항목 노출 중분류 매핑</h2>
      <p className="mb-3 text-xs text-gray-500">
        원본 중분류 전체가 아니라, 그중 원하는 행만 골라 노출 중분류를 반영합니다. 목록에서 체크박스로 선택하세요.
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryMin}
            onChange={(e) => {
              setCategoryMin(e.target.value);
              setHasSearched(false);
              setRows([]);
              setSelectedIds(new Set());
              setRowsResultMessage(null);
            }}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            <option value="">원본 중분류 선택</option>
            <option value={NULL_CATEGORY_MIN_TOKEN}>(미분류 — category_min 없음)</option>
            {categoryMinOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSearch}
            disabled={!categoryMin || isLoadingRows}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoadingRows ? '조회 중...' : '조회'}
          </button>
        </div>

        {rowsError && <p className="text-xs text-red-600">{rowsError}</p>}

        {hasSearched && !isLoadingRows && rows.length === 0 && !rowsError && (
          <p className="text-xs text-gray-400">해당 중분류에 데이터가 없습니다.</p>
        )}

        {rows.length > 0 && (
          <>
            <p className="text-[11px] text-gray-400">
              전체 {total.toLocaleString()}건 중 {page}/{totalPages}페이지 · 선택 {selectedIds.size}건
            </p>
            <ul className="max-h-64 overflow-y-auto flex flex-col divide-y divide-gray-100 rounded-lg border border-gray-100">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    aria-label={`${row.name} 선택`}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="flex-1 min-w-0 truncate text-xs text-gray-800">{row.name}</span>
                  <span className="shrink-0 text-[11px] text-gray-400 truncate max-w-[40%]">{row.address ?? '-'}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchRowsPage(page - 1)}
                disabled={page <= 1 || isLoadingRows}
                className="rounded-full border border-gray-300 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                이전 페이지
              </button>
              <button
                type="button"
                onClick={() => fetchRowsPage(page + 1)}
                disabled={page >= totalPages || isLoadingRows}
                className="rounded-full border border-gray-300 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                다음 페이지
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={rowServiceCategoryId}
                onChange={(e) => setRowServiceCategoryId(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
              >
                <option value="">노출 중분류 선택</option>
                {serviceCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_category} &gt; {c.category_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyRows}
                disabled={isApplyingRows || selectedIds.size === 0 || !rowServiceCategoryId}
                className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
              >
                {isApplyingRows ? '적용 중...' : `선택 ${selectedIds.size}건 적용`}
              </button>
            </div>
          </>
        )}

        {rowsResultMessage && <p className="text-xs text-emerald-600">{rowsResultMessage}</p>}
      </div>
    </section>
  );
}

export function CategoryMappingPanel({ categoryMinOptions }: { categoryMinOptions: string[] }) {
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [hasLoadedCategories, setHasLoadedCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [newParentCategory, setNewParentCategory] = useState(PARENT_CATEGORY_OPTIONS[0]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const [bulkCategoryMin, setBulkCategoryMin] = useState('');
  const [bulkServiceCategoryId, setBulkServiceCategoryId] = useState('');
  const [bulkOnlyUnmapped, setBulkOnlyUnmapped] = useState(true);
  const [bulkPreviewCount, setBulkPreviewCount] = useState<number | null>(null);
  const [isPreviewingBulk, setIsPreviewingBulk] = useState(false);
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null);

  function loadServiceCategories() {
    setHasLoadedCategories(true);
    setCategoriesError(null);
    fetch('/api/admin/service-categories')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '중분류 조회에 실패했습니다.');
        setServiceCategories(data.items ?? []);
      })
      .catch((err) => setCategoriesError(err instanceof Error ? err.message : '중분류 조회에 실패했습니다.'));
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsCreatingCategory(true);
    try {
      const res = await fetch('/api/admin/service-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_category: newParentCategory, category_name: newCategoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '중분류 생성에 실패했습니다.');
      setServiceCategories((prev) => [...prev, data.item]);
      setNewCategoryName('');
    } catch (err) {
      setCategoriesError(err instanceof Error ? err.message : '중분류 생성에 실패했습니다.');
    } finally {
      setIsCreatingCategory(false);
    }
  }

  function handlePreviewBulk() {
    if (!bulkCategoryMin) {
      setBulkError('원본 중분류를 선택해주세요.');
      return;
    }
    setIsPreviewingBulk(true);
    setBulkError(null);
    setBulkResultMessage(null);
    fetch(
      `/api/admin/open-spaces/bulk-category-mapping?category_min=${encodeURIComponent(bulkCategoryMin)}&only_unmapped=${bulkOnlyUnmapped}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '대상 건수 조회에 실패했습니다.');
        setBulkPreviewCount(data.matching_count);
      })
      .catch((err) => setBulkError(err instanceof Error ? err.message : '대상 건수 조회에 실패했습니다.'))
      .finally(() => setIsPreviewingBulk(false));
  }

  function handleApplyBulk() {
    if (!bulkCategoryMin) {
      setBulkError('원본 중분류를 선택해주세요.');
      return;
    }
    if (!bulkServiceCategoryId) {
      setBulkError('노출 중분류를 선택해주세요.');
      return;
    }
    const confirmed = window.confirm(
      bulkPreviewCount != null
        ? `${bulkPreviewCount}건에 노출 중분류를 일괄 반영합니다. 계속할까요?`
        : '아직 [미리보기]로 대상 건수를 확인하지 않았습니다. 그래도 계속할까요?'
    );
    if (!confirmed) return;

    setIsApplyingBulk(true);
    setBulkError(null);
    setBulkResultMessage(null);
    fetch('/api/admin/open-spaces/bulk-category-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_min: bulkCategoryMin,
        service_category_id: bulkServiceCategoryId,
        only_unmapped: bulkOnlyUnmapped,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '일괄 매핑에 실패했습니다.');
        setBulkResultMessage(`${data.updated_count}건에 노출 중분류를 반영했습니다.`);
        setBulkPreviewCount(null);
      })
      .catch((err) => setBulkError(err instanceof Error ? err.message : '일괄 매핑에 실패했습니다.'))
      .finally(() => setIsApplyingBulk(false));
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
      {/* [관리자 페이지 성능 최적화](2026-08-30 사용자 지시) 관례 그대로 — 탭 진입 시
          자동으로 조회하지 않고, 관리자가 각 영역의 "불러오기"를 눌러야 조회한다. */}
      <section className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">🏷️ 노출 중분류 관리</h2>
          {hasLoadedCategories && (
            <button
              type="button"
              onClick={loadServiceCategories}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              새로고침
            </button>
          )}
        </div>
        <form onSubmit={handleCreateCategory} className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={newParentCategory}
            onChange={(e) => setNewParentCategory(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            {PARENT_CATEGORY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="새 중분류명 (예: 야외 물놀이터)"
            className="flex-1 min-w-[160px] rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={isCreatingCategory}
            className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + 추가
          </button>
        </form>
        {categoriesError && <p className="text-xs text-red-600 mb-2">{categoriesError}</p>}
        {!hasLoadedCategories ? (
          <button
            type="button"
            onClick={loadServiceCategories}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            📥 불러오기
          </button>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {serviceCategories.map((c) => (
              <span key={c.id} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600">
                {c.parent_category} &gt; {c.category_name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">🗂️ 노출 중분류 대량 매핑</h2>
        <p className="mb-3 text-xs text-gray-500">
          원본 중분류(category_min) 하나를 골라, 그 전체를 노출 중분류로 한 번에 반영합니다. 중복 여부와
          무관하게 적용됩니다.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkCategoryMin}
              onChange={(e) => {
                setBulkCategoryMin(e.target.value);
                setBulkPreviewCount(null);
                setBulkResultMessage(null);
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="">원본 중분류 선택</option>
              <option value={NULL_CATEGORY_MIN_TOKEN}>(미분류 — category_min 없음)</option>
              {categoryMinOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">→</span>
            <select
              value={bulkServiceCategoryId}
              onChange={(e) => setBulkServiceCategoryId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="">노출 중분류 선택</option>
              {serviceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_category} &gt; {c.category_name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={bulkOnlyUnmapped}
              onChange={(e) => {
                setBulkOnlyUnmapped(e.target.checked);
                setBulkPreviewCount(null);
              }}
              className="h-3.5 w-3.5"
            />
            아직 노출 중분류가 없는 행만 대상으로(이미 매핑된 행은 덮어쓰지 않음)
          </label>

          {serviceCategories.length === 0 && hasLoadedCategories && (
            <p className="text-[11px] text-amber-600">위 "노출 중분류 관리"에서 먼저 중분류를 만들거나 불러와주세요.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePreviewBulk}
              disabled={isPreviewingBulk || !bulkCategoryMin}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {isPreviewingBulk ? '조회 중...' : '미리보기(대상 건수 확인)'}
            </button>
            <button
              type="button"
              onClick={handleApplyBulk}
              disabled={isApplyingBulk || !bulkCategoryMin || !bulkServiceCategoryId}
              className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {isApplyingBulk ? '적용 중...' : '일괄 매핑 적용'}
            </button>
            {bulkPreviewCount != null && <span className="text-xs text-gray-600">대상 {bulkPreviewCount.toLocaleString()}건</span>}
          </div>

          {bulkError && <p className="text-xs text-red-600">{bulkError}</p>}
          {bulkResultMessage && <p className="text-xs text-emerald-600">{bulkResultMessage}</p>}
        </div>
      </section>

      <RowPicker categoryMinOptions={categoryMinOptions} serviceCategories={serviceCategories} />
    </div>
  );
}
