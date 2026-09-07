'use client';

import { useEffect, useState } from 'react';
import { buildSmartBlogQuery, buildFallbackBlogQuery, extractAllSigunguCoreNames } from './naver-blog-search';
import { getBadgeGroupsForCategory, getBadgeOptionsForCategory, matchBadgeKeysFromText, resolveCurationCategoryId } from './curation-badges';
import { ServiceCategory } from './service-category';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시)를 만들면서
// BlogCurationModal(작은 팝업)이 이미 갖고 있던 "블로그 검색 + 뱃지/노출 중분류
// 폼 + 저장" 상태·로직을 이 훅으로 뽑아냈다 — 워크벤치(전체화면)와 모달(작은 팝업)
// 두 곳이 똑같은 로직을 필요로 하기 때문이다(제5장 제4조 기존 구조 우선: 새로
// 만들지 않고 이미 검증된 로직을 재사용). 렌더링(JSX)은 두 컴포넌트가 각자의
// 레이아웃에 맞게 따로 갖는다 — 이 훅은 상태와 fetch/저장 로직만 담당한다.

// [정렬 기준을 화면에서 전환 가능하게](2026-09-06 사용자 지시): "나중에는 sim
// 기준으로도 변경할수있도록.. 아니면 내가 화면에서 sim/date 기준 변경해서도
// 호출할수 있게.. default는 date로" — 기본은 date(실측상 지금 더 정확함,
// Decision 021 8항)로 두되, 관리자가 필요하면 sim으로 즉시 바꿔 다시 검색할 수
// 있게 한다.
export type BlogSortOption = 'sim' | 'date';

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
  curation_note: string | null;
};

export type SpotForCuration = {
  id: string;
  name: string;
  address: string | null;
  service_category_id: string | null;
  // [스마트 검색 쿼리 조합](2026-09-07 사용자 지시): "서울시 노원구라고 하면 상호명 +
  // 노원 이런식으로" — 1차 검색 쿼리와 지역명 하이라이팅에 쓴다. 옵셔널로 둔 이유는
  // 호출부(SpotCurationsPanel 등)가 아직 이 필드를 안 넘겨도 기존처럼 상호명만으로
  // 동작해야 하기 때문(점진적 적용, 기존 호출부 깨짐 방지).
  sigungu_name?: string | null;
};

// [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시): "가져온 내용자체도
// 짧게하고 잘려서.." — 링크별로 전체 본문 조회 상태를 캐시한다. text가 있으면 그걸
// 우선 보여주고, 없으면(로딩 중이거나 네이버 블로그가 아니거나 실패) 기존 요약
// 스니펫(description)으로 조용히 폴백한다 — 어느 경우에도 화면이 비어 보이지 않는다.
export type BlogBodyState = { text: string | null; isLoading: boolean; error: string | null };

// [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07, implementation/todo.md
// 개선사항4 — 사용자 지시): "노출 중분류에 대하여 적용시 [전부] 같이 가도록" —
// 이 훅이 "노출 중분류"(serviceCategoryId) 선택값과 serviceCategories 목록을 보고
// 현재 활성 뱃지 카테고리(curationCategoryId)를 계산해, 그 카테고리의 뱃지
// 목록/키워드로만 동작하게 한다. serviceCategories는 두 호출부(BlogCurationModal/
// MobileCurationWorkbench)가 이미 props로 받고 있던 값을 그대로 넘겨받는다(제5장
// 제4조 — 이 훅이 별도로 다시 조회하지 않음).
export function useSpotCurationForm(spot: SpotForCuration, serviceCategories: ServiceCategory[]) {
  // 검색어는 스팟명 기준으로 기본 채우되, 이름이 흔해 결과가 부정확할 수 있어
  // 관리자가 직접 수정 후 다시 검색할 수 있게 편집 가능한 입력으로 둔다(요구사항에
  // 명시되진 않았지만, "정확도순 상위 3개"가 실제로 이 스팟을 가리키게 하려면
  // 필요한 최소한의 보조 장치 — 저장 데이터 구조에는 영향 없음).
  const [searchQuery, setSearchQuery] = useState(spot.name);
  // [정렬 기준 전환](2026-09-06 사용자 지시): 기본값 date.
  const [sortOption, setSortOptionState] = useState<BlogSortOption>('date');
  const [blogItems, setBlogItems] = useState<BlogSearchItem[] | null>(null);
  const [hasRecentReview, setHasRecentReview] = useState(true);
  const [hasNoResults, setHasNoResults] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [existingCuration, setExistingCuration] = useState<SpotCurationItem | null>(null);
  // [키워드 하이라이팅에 따른 뱃지 자동 체크](2026-09-07 개선사항3 4번): 기존
  // 큐레이션 조회가 끝나기 전에 본문 로딩이 먼저 끝나 자동 체크가 기존 뱃지를
  // 덮어써 버리는 경쟁 상태를 막기 위한 플래그(둘 다 비동기 fetch라 순서가
  // 보장되지 않음).
  const [hasCheckedExistingCuration, setHasCheckedExistingCuration] = useState(false);
  const [hasAutoCheckedBadges, setHasAutoCheckedBadges] = useState(false);
  const [selectedBadges, setSelectedBadges] = useState<Set<string>>(new Set());
  const [serviceCategoryId, setServiceCategoryIdState] = useState(spot.service_category_id ?? '');

  // [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07 개선사항4): "노출 중분류"가
  // 가리키는 category_name으로 현재 활성 뱃지 config를 찾는다. 순수 파생값이라 별도
  // state 없이 매 렌더마다 계산한다.
  const activeExposureCategoryName = serviceCategories.find((c) => c.id === serviceCategoryId)?.category_name ?? null;
  const curationCategoryId = resolveCurationCategoryId(activeExposureCategoryName);
  const badgeGroups = getBadgeGroupsForCategory(curationCategoryId);
  const badgeOptions = getBadgeOptionsForCategory(curationCategoryId);

  // 관리자가 콤보박스로 노출 중분류를 바꾸면, 이전 카테고리에서만 유효했던 뱃지
  // 선택이 새 카테고리엔 존재하지 않는 키일 수 있어 그대로 남기지 않고 걸러낸다
  // (예: 식당 카테고리에서 고른 "좌식/온돌"은 키즈카페 카테고리로 바꾸면 사라짐).
  function setServiceCategoryId(nextServiceCategoryId: string) {
    setServiceCategoryIdState(nextServiceCategoryId);
    const nextCategoryName = serviceCategories.find((c) => c.id === nextServiceCategoryId)?.category_name ?? null;
    const nextCurationCategoryId = resolveCurationCategoryId(nextCategoryName);
    const validKeys = new Set(getBadgeOptionsForCategory(nextCurationCategoryId).map((opt) => opt.key));
    setSelectedBadges((prev) => new Set([...prev].filter((key) => validKeys.has(key))));
  }
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // [큐레이션 메모 입력란](2026-09-06 사용자 지시): "내가 입력란에 좀.. 붙여넣을
  // 수 있게.. 입력가능한 란도 하나 만들어줘" — 새 필드를 만들지 않고, 기존
  // spot_curations.curation_note("큐레이션 메모(선택)", SpotCurationsPanel에서
  // 이미 쓰던 자유 입력 필드)를 그대로 재사용한다(제5장 제4조).
  const [curationNote, setCurationNote] = useState('');

  // [블로그 큐레이션 전체 본문 보기](2026-09-05 사용자 지시) — 링크별 전체 본문 캐시.
  const [bodyByLink, setBodyByLink] = useState<Record<string, BlogBodyState>>({});

  // sort를 명시하지 않으면 현재 선택된 정렬 기준(sortOption)을 그대로 쓴다 —
  // "다시 검색" 버튼처럼 검색어만 바뀌는 경우 정렬 선택은 유지돼야 하기 때문이다.
  // 정렬 자체를 바꾸는 경우(setSortOption)는 상태 갱신이 비동기라 값을 직접
  // 넘겨받아야 최신 값으로 즉시 재검색할 수 있다.
  // [지역명 접미사 폴백 재검색을 위한 반환값](2026-09-07 사용자 지시): "모심갈비..
  // 남동으로 찾으면 안나와.. 모심갈비 남동구는 나오고" — 1차 쿼리가 결과 없음이면
  // 호출부(마운트 시 최초 검색)가 폴백 쿼리로 한 번 더 재검색할 수 있도록
  // hasNoResults를 반환한다. "다시 검색" 버튼 등 다른 호출부는 이 반환값을
  // 그냥 무시하면 되므로 기존 사용처는 전혀 바뀌지 않는다.
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

  // [정렬 기준을 화면에서 전환](2026-09-06 사용자 지시): 정렬을 바꾸면 그 즉시
  // 현재 검색어로 다시 검색한다(관리자가 별도로 "다시 검색"을 또 누르지 않아도 됨).
  function setSortOption(next: BlogSortOption) {
    setSortOptionState(next);
    runSearch(searchQuery, next);
  }

  // [On-Demand](사용자 지시 원문): 모달/워크벤치를 여는 것 자체가 "버튼을 누른"
  // 시점 — 스팟이 바뀔 때마다(마운트 시 1회) 검색한다. 기존 큐레이션(재편집 시
  // 뱃지/블로그 URL 프리필용)도 함께 조회한다.
  // [스마트 검색 쿼리 조합](2026-09-07 사용자 지시): 상호명만이 아니라
  // buildSmartBlogQuery로 "상호명 + 시군구 핵심 지역명"을 1차 검색어로 쓴다.
  // [지역명 접미사 폴백 재검색](2026-09-07 사용자 지시): "모심갈비.. 남동으로
  // 찾으면 안나와.. 모심갈비 남동구는 나오고" — 지역명 접미사(구/시/군)를 뗀
  // 1차 쿼리가 결과 없음(hasNoResults)이면, 접미사를 그대로 둔 폴백 쿼리로
  // 딱 한 번만 자동 재검색한다(무한 재시도 방지 — 폴백은 이 한 번뿐).
  useEffect(() => {
    const smartQuery = buildSmartBlogQuery(spot.name, spot.sigungu_name);
    setSearchQuery(smartQuery);
    runSearch(smartQuery).then((result) => {
      if (!result.hasNoResults) return;
      const fallbackQuery = buildFallbackBlogQuery(spot.name, spot.sigungu_name);
      if (!fallbackQuery || fallbackQuery === smartQuery) return;
      setSearchQuery(fallbackQuery);
      runSearch(fallbackQuery);
    });
    fetch(`/api/admin/spot-curations?spot_id=${encodeURIComponent(spot.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && data.item) {
          const item = data.item as SpotCurationItem;
          setExistingCuration(item);
          setSelectedBadges(new Set(item.curation_badges ?? []));
          setCurationNote(item.curation_note ?? '');
        }
      })
      .catch(() => {
        // 기존 큐레이션 조회 실패해도 신규 등록으로 계속 진행 가능하므로 화면을
        // 막지 않는다(제5장 제11조).
      })
      .finally(() => setHasCheckedExistingCuration(true));
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
      // 여기가 아니라 아래 별도 effect에서 자동 체크를 수행한다 — 기존 큐레이션
      // 조회가 아직 안 끝난 시점(hasCheckedExistingCuration=false)에 본문이 먼저
      // 도착할 수 있어(둘 다 비동기), setBodyByLink 반영 이후 그 최신 상태를 보고
      // 판단해야 경쟁 상태 없이 정확하다.
      .catch((err) => {
        setBodyByLink((prev) => ({
          ...prev,
          [activeLink]: { text: null, isLoading: false, error: err instanceof Error ? err.message : '본문 조회 실패' },
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, blogItems]);

  // [키워드 하이라이팅에 따른 뱃지 자동 체크](2026-09-07 개선사항3 4번): "블로그 본문
  // 및 키워드 데이터를 기반으로 관련 뱃지가 1차로 자동 체크(Pre-check)되도록.. 관리자는
  // 자동 체크해 둔 뱃지를 눈으로 빠르게 검수하고.. 간편하게 체크 해제". 신규 등록(기존
  // 큐레이션 없음)일 때만, 그리고 딱 한 번만 자동 체크한다 — 기존 큐레이션을 수정하는
  // 중이면 관리자가 이미 고른 뱃지를 덮어쓰지 않고, 매번 body 텍스트가 바뀔 때마다
  // (탭 전환 등) 다시 자동 체크해 방금 관리자가 수동으로 해제한 뱃지를 되살리지도
  // 않는다(딱 첫 로딩 1회만).
  useEffect(() => {
    if (!hasCheckedExistingCuration || existingCuration || hasAutoCheckedBadges) return;
    const activeLink = blogItems?.[activeTab]?.link;
    const text = activeLink ? bodyByLink[activeLink]?.text : null;
    if (!text) return;
    setSelectedBadges(matchBadgeKeysFromText(text, curationCategoryId));
    setHasAutoCheckedBadges(true);
  }, [hasCheckedExistingCuration, existingCuration, hasAutoCheckedBadges, activeTab, blogItems, bodyByLink, curationCategoryId]);

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
        curation_note: curationNote.trim() || null,
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

  const activeItem = blogItems?.[activeTab];
  const activeLink = activeItem?.link;
  const activeBody = activeLink ? bodyByLink[activeLink] : undefined;

  // [지역명 하이라이팅 범위 확장](2026-09-07 사용자 지시): "인천광역시 남동구
  // 용천로.. 시군구 이름은 인천시 남동구.. 인천하고 남동이 블로그 제목이나
  // 본문에 포함되어있는지 확인해서.. 노란색 마커표시.. 지금까진 본문에서 남동만
  // 찾아서 색 표시 했는데.. 이제는 블로그 제목도 포함시키고 남동뿐만아니라
  // 인천도 색 표시해줘" — sigungu_name의 시/도+시/군/구 토큰 전부(예: "인천"과
  // "남동")를 하이라이트 대상으로 쓰고, 판정 범위도 본문뿐 아니라 제목까지
  // 넓힌다. 추가 크롤링 없이 이미 가져온 데이터(제목은 검색 API 응답에 이미
  // 있고, 본문은 활성 탭 캐시)만 본다는 기존 원칙은 그대로 유지한다.
  const regionKeywords = extractAllSigunguCoreNames(spot.sigungu_name);
  const hasRegionMismatchWarning = Boolean(
    regionKeywords.length > 0 &&
      activeBody?.text &&
      !regionKeywords.some(
        (keyword) =>
          activeBody.text!.replace(/\s+/g, '').includes(keyword) ||
          (activeItem?.title ?? '').replace(/\s+/g, '').includes(keyword)
      )
  );

  return {
    searchQuery,
    setSearchQuery,
    sortOption,
    setSortOption,
    runSearch,
    blogItems,
    regionKeywords,
    hasRegionMismatchWarning,
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
    curationNote,
    setCurationNote,
    serviceCategoryId,
    setServiceCategoryId,
    curationCategoryId,
    badgeGroups,
    badgeOptions,
    isSaving,
    saveError,
    save,
  };
}
