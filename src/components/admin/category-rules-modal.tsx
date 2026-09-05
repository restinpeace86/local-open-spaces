'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBackdropDismiss } from '@/lib/admin/use-backdrop-dismiss';

// [카테고리 정제 & 어드민 확장](2026-08-26): "[카테고리 키워드 규칙 관리]" 모달 — 49종 표준
// 중분류별 키워드를 칩으로 조회하고, 관리자가 직접 추가/삭제하며, 최신 규칙으로 미분류 행을
// 일괄 재분류할 수 있다.
type CategoryRule = {
  id: number;
  target_table: 'open_spaces' | 'events';
  category_min: string;
  keyword: string;
  is_exclude: boolean;
};

type ReclassifyResult = {
  open_spaces: { scanned: number; matched: number };
  events: { scanned: number; matched: number };
};

function groupRules(rules: CategoryRule[]) {
  const byCategory = new Map<string, CategoryRule[]>();
  for (const rule of rules) {
    const list = byCategory.get(rule.category_min) ?? [];
    list.push(rule);
    byCategory.set(rule.category_min, list);
  }
  return [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function CategoryRulesModal({ onClose }: { onClose: () => void }) {
  // [드래그 시 팝업 닫힘 버그 수정](2026-09-05 사용자 지시) 참고: use-backdrop-dismiss.ts
  const backdropDismiss = useBackdropDismiss(onClose);
  const [targetTable, setTargetTable] = useState<'open_spaces' | 'events'>('open_spaces');
  const [rules, setRules] = useState<CategoryRule[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newCategory, setNewCategory] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [newIsExclude, setNewIsExclude] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isReclassifying, setIsReclassifying] = useState(false);
  const [reclassifyResult, setReclassifyResult] = useState<ReclassifyResult | null>(null);

  const loadRules = () => {
    setRules(null);
    setErrorMessage(null);
    fetch(`/api/admin/category-rules?target_table=${targetTable}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '키워드 규칙 조회 실패');
        return json as { rules: CategoryRule[] };
      })
      .then((json) => setRules(json.rules))
      .catch((err: Error) => setErrorMessage(err.message));
  };

  useEffect(loadRules, [targetTable]);

  const grouped = useMemo(() => groupRules(rules ?? []), [rules]);
  const categoryOptions = useMemo(() => [...new Set((rules ?? []).map((r) => r.category_min))].sort(), [rules]);

  const handleAddKeyword = async () => {
    const category = newCategory.trim();
    const keyword = newKeyword.trim();
    if (!category || !keyword) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/category-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_table: targetTable, category_min: category, keyword, is_exclude: newIsExclude }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '키워드 추가 실패');
      setNewKeyword('');
      loadRules();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '키워드 추가 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteKeyword = async (id: number) => {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/category-rules?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '키워드 삭제 실패');
      setRules((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '키워드 삭제 실패');
    }
  };

  const handleReclassify = async () => {
    setIsReclassifying(true);
    setErrorMessage(null);
    setReclassifyResult(null);
    try {
      const res = await fetch('/api/admin/category-rules/reclassify', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '일괄 재분류 실행 실패');
      setReclassifyResult(json as ReclassifyResult);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '일괄 재분류 실행 실패');
    } finally {
      setIsReclassifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center" {...backdropDismiss}>
      <div
        className="w-full md:w-[820px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">카테고리 키워드 규칙 관리</h2>
            <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
              ✕
            </button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            {(['open_spaces', 'events'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTargetTable(t)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                  targetTable === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {errorMessage && <p className="mt-3 text-xs text-red-500">{errorMessage}</p>}

          <div className="mt-4 rounded-xl border border-gray-200 p-3">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">[+ 키워드 추가]</h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                list="category-min-options"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="중분류명 (예: 수영장)"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs w-40"
              />
              <datalist id="category-min-options">
                {categoryOptions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="키워드 (예: 수영장)"
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs w-40"
              />
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input type="checkbox" checked={newIsExclude} onChange={(e) => setNewIsExclude(e.target.checked)} />
                제외 키워드
              </label>
              <button
                type="button"
                onClick={handleAddKeyword}
                disabled={isSubmitting || !newCategory.trim() || !newKeyword.trim()}
                className="rounded-full bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-blue-700"
              >
                추가
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-500">
              {targetTable} — {grouped.length}개 중분류 · {rules?.length ?? 0}개 키워드
            </h3>
            <button
              type="button"
              onClick={handleReclassify}
              disabled={isReclassifying}
              className="rounded-full bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-emerald-700"
            >
              {isReclassifying ? '재분류 실행 중...' : '[규칙 기반 일괄 재분류 실행]'}
            </button>
          </div>

          {reclassifyResult && (
            <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
              이번 실행: open_spaces {reclassifyResult.open_spaces.matched}/{reclassifyResult.open_spaces.scanned}건,
              events {reclassifyResult.events.matched}/{reclassifyResult.events.scanned}건 신규 매칭됨
            </p>
          )}

          <div className="mt-3 flex flex-col gap-3 max-h-[40vh] overflow-y-auto">
            {rules === null && <p className="text-xs text-gray-400">불러오는 중...</p>}
            {rules !== null && grouped.length === 0 && <p className="text-xs text-gray-400">등록된 키워드가 없습니다.</p>}
            {grouped.map(([category, categoryRules]) => (
              <div key={category} className="rounded-xl border border-gray-100 p-3">
                <p className="text-sm font-semibold text-gray-900 mb-1.5">{category}</p>
                <div className="flex flex-wrap gap-1.5">
                  {categoryRules.map((rule) => (
                    <span
                      key={rule.id}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                        rule.is_exclude ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {rule.is_exclude ? '제외: ' : ''}
                      {rule.keyword}
                      <button
                        type="button"
                        onClick={() => handleDeleteKeyword(rule.id)}
                        className="text-gray-400 hover:text-red-600"
                        aria-label={`${rule.keyword} 삭제`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
