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
