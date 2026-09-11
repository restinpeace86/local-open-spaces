'use client';

import { useEffect, useState } from 'react';
import { buildSmartBlogQuery, buildFallbackBlogQuery } from './naver-blog-search';
import { BlogBodyState, BlogSearchItem, BlogSortOption } from './use-spot-curation-form';
import { parsePriceFromText } from './parse-price-from-text';

// [블로그 검수 결과를 바로 반영](2026-09-11 사용자 지시): "기껏 블로그에서 가격
// 찾았는데.. 어디다 반영을 못하네.. 타겟 연령도 체크할 수 있도록 해줘" — 이 모달이
// 다루는 target_audience는 이벤트픽 노출 4대 조건(EVENT_PICK_TARGET_AUDIENCES,
// get-home-feed.ts와 동일 목록)으로만 좁힌다.
export const EVENT_PICK_TARGET_AUDIENCE_OPTIONS = [
  { value: 'INFANT', label: '영유아' },
  { value: 'KIDS_PRE', label: '미취학' },
  { value: 'KIDS_SCHOOL', label: '취학아동' },
  { value: 'FAMILY', label: '가족' },
] as const;

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

  // [블로그 검수 결과를 바로 반영](2026-09-11 사용자 지시): 가격/타겟 연령을 이
  // 모달에서 함께 입력·저장한다. initial* 값은 "건드리지 않았으면 저장 시 그대로
  // 둔다"를 판단하는 기준선이다(현재 값과 같으면 PUT body에서 아예 빼서, 실수로
  // 다른 화면에서 이미 검수해 둔 값을 덮어쓰지 않는다).
  const [priceText, setPriceText] = useState('');
  const [initialPriceText, setInitialPriceText] = useState('');
  const [targetAudience, setTargetAudience] = useState<string | null>(null);
  const [initialTargetAudience, setInitialTargetAudience] = useState<string | null>(null);

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
        if (res.ok) {
          const price = typeof data.price_text === 'string' ? data.price_text : '';
          setPriceText(price);
          setInitialPriceText(price);
          const audience = typeof data.target_audience === 'string' ? data.target_audience : null;
          setTargetAudience(audience);
          setInitialTargetAudience(audience);
        }
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

  const activeItemForPrice = blogItems?.[activeTab];
  const activeBodyForPrice = activeItemForPrice ? bodyByLink[activeItemForPrice.link] : undefined;
  // [블로그글 복붙하면 파싱](2026-09-11 사용자 지시): 현재 보고 있는 블로그(전체
  // 본문이 있으면 본문, 없으면 요약)에서 가격을 자동으로 찾아 입력란에 채운다.
  // 못 찾으면 안내만 하고 입력란은 그대로 둔다(추측으로 채우지 않음) — 어느 쪽이든
  // 관리자가 직접 다시 고쳐 쓸 수 있다.
  function autoFillPriceFromActiveBlog(): { found: boolean } {
    const source = activeBodyForPrice?.text ?? activeItemForPrice?.description ?? null;
    const parsed = parsePriceFromText(source);
    if (parsed) setPriceText(parsed);
    return { found: Boolean(parsed) };
  }

  // [타겟 연령 체크](2026-09-11 사용자 지시): 4개 중 하나만 고를 수 있다(단일
  // 컬럼) — 이미 선택된 것을 다시 누르면 "미선택"으로 되돌린다(명시적으로 지운
  // 것으로 간주해 저장 시 null로 반영된다).
  function toggleTargetAudience(value: string) {
    setTargetAudience((prev) => (prev === value ? null : value));
  }

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
      // [건드리지 않은 필드는 보내지 않는다](2026-09-11 사용자 지시 반영): 가격/타겟
      // 연령이 처음 불러온 값과 같으면(관리자가 이번엔 그 부분을 검토하지 않은 것)
      // body에서 아예 뺀다 — 서버(route.ts)가 "키가 없으면 건드리지 않는다"로
      // 처리하므로, 다른 화면에서 이미 검수해 둔 값을 실수로 지우지 않는다.
      const body: { event_id: string; urls: string[]; price_text?: string; target_audience?: string | null } = {
        event_id: event.id,
        urls: selectedUrls,
      };
      if (priceText !== initialPriceText) body.price_text = priceText;
      if (targetAudience !== initialTargetAudience) body.target_audience = targetAudience;

      const res = await fetch('/api/admin/events/blog-curation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    priceText,
    setPriceText,
    autoFillPriceFromActiveBlog,
    targetAudience,
    toggleTargetAudience,
    isLoadingExisting,
    isSaving,
    saveError,
    save,
  };
}
