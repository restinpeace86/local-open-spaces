'use client';

import { highlightKeywords } from '@/lib/admin/curation-badges';
import { BlogSearchItem } from '@/lib/admin/use-spot-curation-form';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시)를 만들면서
// BlogCurationModal의 "블로그 탭 + 원문 링크 + 하이라이팅 뷰어 + 1년 룰 경고" 렌더링을
// 이 프레젠테이션 컴포넌트로 뽑아냈다 — 워크벤치와 모달이 완전히 동일한 UI를
// 그대로 재사용한다(제5장 제4조 기존 구조 우선). 상태는 useSpotCurationForm이 갖고
// 있고, 이 컴포넌트는 순수하게 props만 받아 그린다.
const RECENT_WINDOW_WARNING = '⚠️ 최근 1년간 후기 없음 - 폐업/방치 검토';

function formatPostdate(postdate: string): string {
  if (!/^\d{8}$/.test(postdate)) return postdate;
  return `${postdate.slice(0, 4)}.${postdate.slice(4, 6)}.${postdate.slice(6, 8)}`;
}

export function BlogReferenceViewer({
  searchQuery,
  onSearchQueryChange,
  onSearch,
  isSearching,
  searchError,
  blogItems,
  hasRecentReview,
  hasNoResults,
  activeTab,
  onActiveTabChange,
}: {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  isSearching: boolean;
  searchError: string | null;
  blogItems: BlogSearchItem[] | null;
  hasRecentReview: boolean;
  hasNoResults: boolean;
  activeTab: number;
  onActiveTabChange: (index: number) => void;
}) {
  const activeItem = blogItems?.[activeTab] ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* [최신성 검증 1년 룰](사용자 지시 원문) */}
      {!isSearching && !searchError && blogItems && (hasNoResults || !hasRecentReview) && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-semibold text-amber-700">
          {hasNoResults ? '⚠️ 관련 블로그 글을 찾지 못했습니다 - 폐업/방치 검토' : RECENT_WINDOW_WARNING}
        </p>
      )}

      {/* 검색어 재조정 — 스팟명이 흔해 결과가 부정확할 때 대비 */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={() => onSearch(searchQuery)}
          disabled={isSearching || !searchQuery.trim()}
          className="shrink-0 rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {isSearching ? '검색 중...' : '다시 검색'}
        </button>
      </div>

      {searchError && <p className="text-xs text-red-600">{searchError}</p>}

      {isSearching && !blogItems && <p className="text-sm text-gray-400 py-6 text-center">블로그 검색 중...</p>}

      {blogItems && blogItems.length > 0 && (
        <>
          {/* 블로그 소스 탭 & URL 링크 */}
          <div className="flex items-center gap-1.5 flex-wrap" role="tablist">
            {blogItems.map((item, i) => (
              <button
                key={item.link}
                type="button"
                role="tab"
                aria-selected={activeTab === i}
                onClick={() => onActiveTabChange(i)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  activeTab === i ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                블로그 {i + 1}
                {!item.isRecent && ' ⚠️'}
              </button>
            ))}
          </div>

          {activeItem && (
            <>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {activeItem.bloggername} · {formatPostdate(activeItem.postdate)}
                </span>
                <a
                  href={activeItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-600 hover:underline"
                >
                  원문 보기 ↗
                </a>
              </div>
              <p className="font-medium text-sm text-gray-900">{activeItem.title}</p>

              {/* [핵심 기능: 자동 형광펜 하이라이팅](사용자 지시 원문) */}
              <div className="max-h-40 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                {highlightKeywords(activeItem.description)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
