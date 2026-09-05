'use client';

import { useState } from 'react';
import { highlightKeywords } from '@/lib/admin/curation-badges';
import { BlogBodyState, BlogSearchItem, BlogSortOption } from '@/lib/admin/use-spot-curation-form';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시)를 만들면서
// BlogCurationModal의 "블로그 탭 + 원문 링크 + 하이라이팅 뷰어 + 1년 룰 경고" 렌더링을
// 이 프레젠테이션 컴포넌트로 뽑아냈다 — 워크벤치와 모달이 완전히 동일한 UI를
// 그대로 재사용한다(제5장 제4조 기존 구조 우선). 상태는 useSpotCurationForm이 갖고
// 있고, 이 컴포넌트는 순수하게 props만 받아 그린다.
//
// [전체 본문 보기 + 수동 URL 교체](2026-09-05 사용자 지시): "가져온 내용자체도 짧게
// 하고 잘려서.." / "네이버 블로그 관련도순 검색했을때 이거아니야.." 두 가지를 함께
// 반영한다 — activeBody.text가 있으면(네이버 블로그 전체 본문 추출 성공) 그걸
// 요약 대신 보여주고, "다른 URL로 바꾸기"로 관리자가 직접 찾은 URL로 현재 탭을
// 교체할 수 있게 한다.
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
  activeBody,
  onOverrideUrl,
  sortOption,
  onSortOptionChange,
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
  activeBody?: BlogBodyState;
  onOverrideUrl?: (url: string) => void;
  // [정렬 기준을 화면에서 전환](2026-09-06 사용자 지시): "내가 화면에서 sim/date
  // 기준 변경해서도 호출할 수 있게.. default는 date로." 둘 다 없으면(기존
  // 호출부 호환) 정렬 토글을 숨긴다 — 이 컴포넌트를 쓰는 다른 곳이 생겨도 깨지지
  // 않도록 optional로 둔다.
  sortOption?: BlogSortOption;
  onSortOptionChange?: (next: BlogSortOption) => void;
}) {
  const activeItem = blogItems?.[activeTab] ?? null;
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  function startEditingUrl() {
    setUrlDraft(activeItem?.link ?? '');
    setIsEditingUrl(true);
  }

  function applyUrlOverride() {
    if (!urlDraft.trim() || !onOverrideUrl) return;
    onOverrideUrl(urlDraft);
    setIsEditingUrl(false);
  }

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

      {/* [정렬 기준 전환](2026-09-06 사용자 지시) — 바꾸는 즉시 재검색된다. */}
      {sortOption && onSortOptionChange && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-gray-400">정렬</span>
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(
              [
                { value: 'date' as const, label: '최신순' },
                { value: 'sim' as const, label: '정확도순' },
              ]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSortOptionChange(opt.value)}
                disabled={isSearching}
                className={`px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  sortOption === opt.value ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {searchError && <p className="text-xs text-red-600">{searchError}</p>}

      {isSearching && !blogItems && <p className="text-sm text-gray-400 py-6 text-center">블로그 검색 중...</p>}

      {blogItems && blogItems.length > 0 && (
        <>
          {/* 블로그 소스 탭 & URL 링크 */}
          <div className="flex items-center gap-1.5 flex-wrap" role="tablist">
            {blogItems.map((item, i) => (
              <button
                key={`${item.link}-${i}`}
                type="button"
                role="tab"
                aria-selected={activeTab === i}
                onClick={() => {
                  onActiveTabChange(i);
                  setIsEditingUrl(false);
                }}
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
              <div className="flex items-center justify-between text-xs text-gray-500 gap-2">
                <span className="truncate">
                  {activeItem.bloggername ? `${activeItem.bloggername} · ` : ''}
                  {formatPostdate(activeItem.postdate)}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={activeItem.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    원문 보기 ↗
                  </a>
                  {/* [수동 URL 교체](사용자 지시 원문): "가져오는데.. 이거아니야.." —
                      자동 검색 결과가 실제 스팟과 다를 때 관리자가 직접 찾은 URL로
                      바꿀 수 있는 탈출구. */}
                  {onOverrideUrl && !isEditingUrl && (
                    <button
                      type="button"
                      onClick={startEditingUrl}
                      className="text-gray-400 hover:text-gray-700 underline"
                    >
                      다른 URL로 바꾸기
                    </button>
                  )}
                </div>
              </div>

              {isEditingUrl && onOverrideUrl && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                    placeholder="https://blog.naver.com/..."
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={applyUrlOverride}
                    disabled={!urlDraft.trim()}
                    className="shrink-0 rounded-full bg-gray-900 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    적용
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingUrl(false)}
                    className="shrink-0 text-xs text-gray-500 hover:text-gray-800"
                  >
                    취소
                  </button>
                </div>
              )}

              <p className="font-medium text-sm text-gray-900">{activeItem.title}</p>

              {/* [핵심 기능: 자동 형광펜 하이라이팅](사용자 지시 원문) +
                  [전체 본문 보기](2026-09-05 사용자 지시): 네이버 블로그면 요약 대신
                  전체 본문을 시도한다 — 실패/미지원 출처는 요약으로 조용히 폴백한다. */}
              <div className="max-h-64 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                {activeBody?.text
                  ? highlightKeywords(activeBody.text)
                  : activeBody?.isLoading
                    ? (
                        <>
                          {activeItem.description ? highlightKeywords(activeItem.description) : null}
                          <p className="mt-2 text-[11px] text-gray-400">전체 본문 불러오는 중...</p>
                        </>
                      )
                    : activeItem.description
                      ? highlightKeywords(activeItem.description)
                      : '(요약을 가져오지 못했습니다 — 원문 보기로 확인해주세요.)'}
              </div>
              {activeBody?.text && (
                <p className="text-[11px] text-gray-400">✓ 전체 본문 표시 중(저장되지 않고 화면에만 표시됩니다)</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
