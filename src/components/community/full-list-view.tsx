'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardPost } from '@/lib/community/mom-pick-dashboard';
import { DashboardPostCard } from './dashboard-post-card';

// [맘스픽 메인 화면 기획](2026-09-02 사용자 지시) "전체보기" 3개 페이지(/mom-pick/expert,
// /mom-pick/trending, /mom-pick/live)가 공유하는 페이지네이션 목록 뷰.
export function FullListView({ title, apiPath }: { title: string; apiPath: string }) {
  const [items, setItems] = useState<DashboardPost[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(`${apiPath}?page=${page}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setErrorMessage(data.error);
          return;
        }
        setItems(data.items);
        setTotal(data.total);
        setPageSize(data.pageSize);
      })
      .catch(() => {
        if (!cancelled) setErrorMessage('목록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiPath, page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-y-auto p-5">
      <div className="flex items-center gap-2">
        <Link href="/mom-pick" className="text-sm text-gray-400 hover:text-gray-600">
          ‹
        </Link>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      {isLoading ? (
        <p className="text-sm text-gray-400">불러오는 중...</p>
      ) : items && items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {items.map((post) => (
            <DashboardPostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        !errorMessage && <p className="text-sm text-gray-400">아직 등록된 글이 없어요.</p>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30">
            이전
          </button>
          <span className="text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="disabled:opacity-30"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}
