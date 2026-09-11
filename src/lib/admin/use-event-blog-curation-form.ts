'use client';

import { useEffect, useState } from 'react';
import { buildSmartBlogQuery, buildFallbackBlogQuery } from './naver-blog-search';
import { BlogBodyState, BlogSearchItem, BlogSortOption } from './use-spot-curation-form';

// [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, implementation/todo.md
// 개선사항7-2/8): "관리자가 Events 탭 상세 팝업에서 블로그 큐레이션 버튼을 눌러
// 블로그 후보 3개 중 체크하여 저장". open_spaces의 useSpotCurationForm(Decision 021)과
// 검색/본문 미리보기 로직은 같은 원리(같은 네이버 블로그 검색·본문 API를 그대로
// 재사용, 제5장 제4조)지만, 이벤트는 스팟 큐레이션(가격/영업시간/뱃지/노출 중분류)
// 개념이 없어 그 훅 전체를 재사용하지 않고 "검색 → 체크박스로 선택 → URL 배열만
// 저장"이라는 훨씬 단순한 모델을 새로 둔다 — 스팟처럼 블로그 1/2/3을 정해진 위치에
// 저장하는 게 아니라, 검색 결과 중 관리자가 고른 것만(순서대로, 최대 3개) 저장한다.
export function useEventBlogCurationForm(event: { id: string; title: string; sigunguName?: string | null }) {
  const [searchQuery, setSearchQuery] = useState(event.title);
  const [blogItems, setBlogItems] = useState<BlogSearchItem[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasRecentReview, setHasRecentReview] = useState(false);
  const [hasNoResults, setHasNoResults] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [sortOption, setSortOptionState] = useState<BlogSortOption>('date');
  const [bodyByLink, setBodyByLink] = useState<Record<string, BlogBodyState>>({});

  // 관리자가 체크해 저장할 URL 목록(순서 유지, 최대 3개).
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function runSearch(query: string, sort: BlogSortOption = sortOption): Promise<{ hasNoResults: boolean }> {
    setIsSearching(true);
    setSearchError(null);
    return fetch(`/api/admin/spot-curations/blog-search?query=${encodeURIComponent(query)}&sort=${sort}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '블로그 검색에 실패했습니다.');
        setBlogItems(data.items ?? []);
        setHasRecentReview(Boolean(data.hasRecentReview));
        setHasNoResults(Boolean(data.hasNoResults));
        setActiveTab(0);
        return { hasNoResults: Boolean(data.hasNoResults) };
      })
      .catch((err) => {
        setSearchError(err instanceof Error ? err.message : '블로그 검색에 실패했습니다.');
        return { hasNoResults: false };
      })
      .finally(() => setIsSearching(false));
  }

  function setSortOption(next: BlogSortOption) {
    setSortOptionState(next);
    runSearch(searchQuery, next);
  }

  // [On-Demand](Decision 021과 동일 원칙): 모달을 여는 것 자체가 트리거라 마운트 시
  // 1회 자동 검색한다. 기존에 저장된 curated_blog_urls(재편집 시 프리필)도 함께 조회.
  useEffect(() => {
    const smartQuery = buildSmartBlogQuery(event.title, event.sigunguName);
    setSearchQuery(smartQuery);
    runSearch(smartQuery).then((result) => {
      if (!result.hasNoResults) return;
      const fallbackQuery = buildFallbackBlogQuery(event.title, event.sigunguName);
      if (!fallbackQuery || fallbackQuery === smartQuery) return;
      setSearchQuery(fallbackQuery);
      runSearch(fallbackQuery);
    });

    fetch(`/api/admin/events/blog-curation?event_id=${encodeURIComponent(event.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && Array.isArray(data.urls)) setSelectedUrls(data.urls);
      })
      .catch(() => {
        // 기존 값 조회 실패해도 신규 저장은 계속 가능하게 화면을 막지 않는다(제5장 제11조).
      })
      .finally(() => setIsLoadingExisting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  // [전체 본문 보기](Decision 021과 동일 원칙): 활성 탭 링크의 본문을 지연 로딩한다.
  useEffect(() => {
    const link = blogItems?.[activeTab]?.link;
    if (!link || bodyByLink[link]) return;
    setBodyByLink((prev) => ({ ...prev, [link]: { text: null, isLoading: true, error: null } }));
    fetch(`/api/admin/spot-curations/blog-body?url=${encodeURIComponent(link)}`)
      .then(async (res) => {
        const data = await res.json();
        setBodyByLink((prev) => ({
          ...prev,
          [link]: { text: res.ok ? (data.text ?? null) : null, isLoading: false, error: res.ok ? null : data.error ?? null },
        }));
      })
      .catch(() => {
        setBodyByLink((prev) => ({ ...prev, [link]: { text: null, isLoading: false, error: '본문 조회 실패' } }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blogItems, activeTab]);

  function overrideActiveUrl(url: string) {
    setBlogItems((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[activeTab] = { ...next[activeTab], link: url };
      return next;
    });
  }

  const MAX_SELECTED = 3;
  // [체크박스로 후보 선택](요구사항 원문 "블로그 후보 3개 중 체크"): 이미 선택된
  // URL은 체크 해제 가능, 미선택인데 이미 3개 찼으면 더 담지 않는다(추가 UI 없이도
  // 자연스럽게 상한이 지켜지도록 — 새 제약을 만들지 않고 저장 시점 제약과 동일).
  function toggleUrl(url: string) {
    setSelectedUrls((prev) => {
      if (prev.includes(url)) return prev.filter((u) => u !== url);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, url];
    });
  }

  async function save(): Promise<boolean> {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/events/blog-curation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: event.id, urls: selectedUrls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const activeItem = blogItems?.[activeTab];
  const activeBody = activeItem ? bodyByLink[activeItem.link] : undefined;

  return {
    searchQuery,
    setSearchQuery,
    runSearch,
    blogItems,
    isSearching,
    searchError,
    hasRecentReview,
    hasNoResults,
    activeTab,
    setActiveTab,
    activeBody,
    overrideActiveUrl,
    sortOption,
    setSortOption,
    selectedUrls,
    toggleUrl,
    isLoadingExisting,
    isSaving,
    saveError,
    save,
  };
}
