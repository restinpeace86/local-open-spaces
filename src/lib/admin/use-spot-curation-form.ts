'use client';

import { useEffect, useState } from 'react';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시)를 만들면서
// BlogCurationModal(작은 팝업)이 이미 갖고 있던 "블로그 검색 + 뱃지/노출 중분류
// 폼 + 저장" 상태·로직을 이 훅으로 뽑아냈다 — 워크벤치(전체화면)와 모달(작은 팝업)
// 두 곳이 똑같은 로직을 필요로 하기 때문이다(제5장 제4조 기존 구조 우선: 새로
// 만들지 않고 이미 검증된 로직을 재사용). 렌더링(JSX)은 두 컴포넌트가 각자의
// 레이아웃에 맞게 따로 갖는다 — 이 훅은 상태와 fetch/저장 로직만 담당한다.

export type BlogSearchItem = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string;
  isRecent: boolean;
};

export type SpotCurationItem = {
  id: string;
  spot_id: string;
  blog_url_1: string | null;
  blog_url_2: string | null;
  blog_url_3: string | null;
  curation_badges: string[];
};

export type SpotForCuration = {
  id: string;
  name: string;
  address: string | null;
  service_category_id: string | null;
};

// [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시): "가져온 내용자체도
// 짧게하고 잘려서.." — 링크별로 전체 본문 조회 상태를 캐시한다. text가 있으면 그걸
// 우선 보여주고, 없으면(로딩 중이거나 네이버 블로그가 아니거나 실패) 기존 요약
// 스니펫(description)으로 조용히 폴백한다 — 어느 경우에도 화면이 비어 보이지 않는다.
export type BlogBodyState = { text: string | null; isLoading: boolean; error: string | null };

export function useSpotCurationForm(spot: SpotForCuration) {
  // 검색어는 스팟명 기준으로 기본 채우되, 이름이 흔해 결과가 부정확할 수 있어
  // 관리자가 직접 수정 후 다시 검색할 수 있게 편집 가능한 입력으로 둔다(요구사항에
  // 명시되진 않았지만, "정확도순 상위 3개"가 실제로 이 스팟을 가리키게 하려면
  // 필요한 최소한의 보조 장치 — 저장 데이터 구조에는 영향 없음).
  const [searchQuery, setSearchQuery] = useState(spot.name);
  const [blogItems, setBlogItems] = useState<BlogSearchItem[] | null>(null);
  const [hasRecentReview, setHasRecentReview] = useState(true);
  const [hasNoResults, setHasNoResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [existingCuration, setExistingCuration] = useState<SpotCurationItem | null>(null);
  const [selectedBadges, setSelectedBadges] = useState<Set<string>>(new Set());
  const [serviceCategoryId, setServiceCategoryId] = useState(spot.service_category_id ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시) — 링크별 전체 본문 캐시.
  const [bodyByLink, setBodyByLink] = useState<Record<string, BlogBodyState>>({});

  function runSearch(query: string) {
    setIsSearching(true);
    setSearchError(null);
    fetch(`/api/admin/spot-curations/blog-search?query=${encodeURIComponent(query)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '블로그 검색에 실패했습니다.');
        setBlogItems(data.items ?? []);
        setHasRecentReview(Boolean(data.hasRecentReview));
        setHasNoResults(Boolean(data.hasNoResults));
        setActiveTab(0);
      })
      .catch((err) => setSearchError(err instanceof Error ? err.message : '블로그 검색에 실패했습니다.'))
      .finally(() => setIsSearching(false));
  }

  // [On-Demand](사용자 지시 원문): 모달/워크벤치를 여는 것 자체가 "버튼을 누른"
  // 시점 — 스팟이 바뀔 때마다(마운트 시 1회) 검색한다. 기존 큐레이션(재편집 시
  // 뱃지/블로그 URL 프리필용)도 함께 조회한다.
  useEffect(() => {
    runSearch(spot.name);
    fetch(`/api/admin/spot-curations?spot_id=${encodeURIComponent(spot.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.item) {
          const item = data.item as SpotCurationItem;
          setExistingCuration(item);
          setSelectedBadges(new Set(item.curation_badges ?? []));
        }
      })
      .catch(() => {
        // 기존 큐레이션 조회 실패해도 신규 등록으로 계속 진행 가능하므로 화면을
        // 막지 않는다(제5장 제11조).
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id]);

  // [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시): 현재 탭의 블로그가
  // 바뀔 때마다(검색 결과가 새로 오거나, 관리자가 다른 탭을 클릭할 때) 그 링크의
  // 전체 본문을 한 번만 시도한다 — 이미 시도한 링크(성공/실패 무관)는 다시 요청하지
  // 않는다. 네이버 블로그가 아니거나 실패하면 조용히 요약 스니펫으로 남는다.
  useEffect(() => {
    const activeLink = blogItems?.[activeTab]?.link;
    if (!activeLink || bodyByLink[activeLink]) return;

    setBodyByLink((prev) => ({ ...prev, [activeLink]: { text: null, isLoading: true, error: null } }));
    fetch(`/api/admin/spot-curations/blog-body?url=${encodeURIComponent(activeLink)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '본문을 가져오지 못했습니다.');
        setBodyByLink((prev) => ({ ...prev, [activeLink]: { text: data.text ?? null, isLoading: false, error: null } }));
      })
      .catch((err) => {
        setBodyByLink((prev) => ({
          ...prev,
          [activeLink]: { text: null, isLoading: false, error: err instanceof Error ? err.message : '본문 조회 실패' },
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, blogItems]);

  // [블로그 자동검색 결과가 실제와 다를 때 수동 교체](2026-09-05 사용자 지시): "가져오는데
  // 네이버 블로그 관련도순 검색했을때 이거아니야.." — 네이버 검색 API의 관련도 순위가
  // 실제 라이브 사이트와 다르거나 품질이 낮은 결과(스팸성 블로그 등)를 상위로 올리는
  // 경우가 실측으로 확인됐다(Naver 쪽 데이터 품질 문제 — 우리 쪽에서 순위 자체를
  // 바로잡을 방법은 없음). 관리자가 직접 찾은 정확한 블로그 URL로 현재 탭의 슬롯을
  // 바꿔치기할 수 있게 한다 — 저장 시 이 URL이 그대로 blog_url_N에 들어간다.
  function overrideActiveUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBlogItems((prev) => {
      if (!prev || !prev[activeTab]) return prev;
      const next = [...prev];
      next[activeTab] = {
        title: '(관리자가 직접 입력한 URL)',
        link: trimmed,
        description: '',
        bloggername: '',
        postdate: '',
        isRecent: true,
      };
      return next;
    });
  }

  function toggleBadge(key: string) {
    setSelectedBadges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // 저장 성공 시 true, 실패 시 false를 반환한다 — 호출부(모달은 "닫기", 워크벤치는
  // "다음 미처리 스팟으로 이동")가 서로 다른 후속 동작을 결정해야 하므로 이 훅은
  // 저장 자체만 책임지고 후속 동작은 호출부에 맡긴다.
  async function save(): Promise<boolean> {
    setIsSaving(true);
    setSaveError(null);
    try {
      // 1) 노출 중분류는 open_spaces.service_category_id를 그대로 재사용한다(기존
      // 대량/선택 매핑과 동일한 엔드포인트를 ids:[spot.id] 하나짜리로 재사용 —
      // 제5장 제4조 기존 구조 우선).
      if (serviceCategoryId !== (spot.service_category_id ?? '')) {
        const res = await fetch('/api/admin/open-spaces/bulk-category-mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [spot.id], service_category_id: serviceCategoryId || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '노출 중분류 저장에 실패했습니다.');
      }

      // 2) 블로그 URL 3개(본문은 절대 전송하지 않음) + 뱃지를 spot_curations에 저장한다.
      const payload = {
        blog_url_1: blogItems?.[0]?.link ?? null,
        blog_url_2: blogItems?.[1]?.link ?? null,
        blog_url_3: blogItems?.[2]?.link ?? null,
        curation_badges: [...selectedBadges],
      };
      const res = existingCuration
        ? await fetch('/api/admin/spot-curations', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: existingCuration.id, ...payload }),
          })
        : await fetch('/api/admin/spot-curations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spot_id: spot.id, ...payload }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '큐레이션 저장에 실패했습니다.');
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const activeLink = blogItems?.[activeTab]?.link;
  const activeBody = activeLink ? bodyByLink[activeLink] : undefined;

  return {
    searchQuery,
    setSearchQuery,
    runSearch,
    blogItems,
    hasRecentReview,
    hasNoResults,
    searchError,
    isSearching,
    activeTab,
    setActiveTab,
    activeBody,
    overrideActiveUrl,
    existingCuration,
    selectedBadges,
    toggleBadge,
    serviceCategoryId,
    setServiceCategoryId,
    isSaving,
    saveError,
    save,
  };
}
