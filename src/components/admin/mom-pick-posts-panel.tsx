'use client';

import { useState } from 'react';
import { CHECKLIST_ITEMS } from '@/lib/community/checklist-items';

// [Decision 019](2026-09-02) / spec/community/mom-pick-grades.md 3-1: 관리자 전용 "맘스픽
// 채택 관리" 탭. spot-curations-panel.tsx와 동일하게 자기완결적이고, 마운트 시 자동
// 조회하지 않는다(어드민 페이지 성능 최적화 관례 — 필요할 때 버튼을 눌러 불러온다).
type MomPickPostRow = {
  id: string;
  post_type: 'micro_review' | 'checklist';
  rating: number | null;
  content: string | null;
  checklist_answers: Record<string, boolean> | null;
  like_count: number;
  is_adopted: boolean;
  adopted_at: string | null;
  created_at: string;
  open_spaces: { name: string; address: string | null } | null;
};

const PAGE_SIZE = 20;

export function MomPickPostsPanel() {
  const [items, setItems] = useState<MomPickPostRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [adoptedOnly, setAdoptedOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function fetchItems(targetPage = page, targetAdoptedOnly = adoptedOnly) {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/admin/mom-pick-posts?page=${targetPage}&page_size=${PAGE_SIZE}&adopted_only=${targetAdoptedOnly}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '조회 실패');
      setItems(data.items);
      setTotal(data.total);
      setPage(targetPage);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '맘스픽 후기 목록 조회 실패');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleAdopt(row: MomPickPostRow) {
    setBusyId(row.id);
    try {
      const res = await fetch('/api/admin/mom-pick-posts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, is_adopted: !row.is_adopted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '채택 처리 실패');
      setItems((prev) => (prev ? prev.map((p) => (p.id === row.id ? data.item : p)) : prev));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '채택 처리 실패');
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    // [관리자 대시보드 모바일 레이아웃/스크롤 버그 긴급 수정](2026-09-05 사용자
    // 지시): 다른 자기완결 패널(SpotCurationsPanel/CuratedItemsPanel/SpotDedupPanel/
    // CategoryMappingPanel)과 달리 이 패널은 애초에 자체 스크롤 컨테이너가 없어
    // 목록이 길어지면 부모(overflow-hidden)에 그대로 잘렸다 — flex-1 min-h-0
    // overflow-y-auto를 추가해 동일하게 내부 스크롤이 되도록 맞춘다.
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fetchItems(1, adoptedOnly)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          {items == null ? '불러오기' : '새로고침'}
        </button>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={adoptedOnly}
            onChange={(e) => {
              setAdoptedOnly(e.target.checked);
              fetchItems(1, e.target.checked);
            }}
          />
          채택된 것만 보기
        </label>
        {isLoading && <span className="text-xs text-gray-400">불러오는 중...</span>}
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      {items && (
        <>
          <p className="text-xs text-gray-400">총 {total}건</p>
          <div className="flex flex-col gap-2">
            {items.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800">{row.open_spaces?.name ?? '(스팟 정보 없음)'}</p>
                  {row.post_type === 'micro_review' ? (
                    <p className="mt-1 text-sm text-gray-600">
                      {'★'.repeat(row.rating ?? 0)} {row.content}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">
                      체크리스트:{' '}
                      {CHECKLIST_ITEMS.filter((item) => row.checklist_answers?.[item.key])
                        .map((item) => item.label)
                        .join(', ') || '해당 없음'}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-gray-400">
                    {new Date(row.created_at).toLocaleString('ko-KR')} · 좋아요 {row.like_count}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleAdopt(row)}
                  disabled={busyId === row.id}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                    row.is_adopted ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {row.is_adopted ? '✨ 채택됨' : '채택하기'}
                </button>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <button type="button" disabled={page <= 1} onClick={() => fetchItems(page - 1)} className="disabled:opacity-30">
                이전
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button type="button" disabled={page >= totalPages} onClick={() => fetchItems(page + 1)} className="disabled:opacity-30">
                다음
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
