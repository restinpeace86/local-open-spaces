'use client';

import { useEffect, useState } from 'react';
import { ServiceCategory } from '@/lib/admin/service-category';
import { CURATION_BADGE_OPTIONS, CurationBadgeGroup, highlightKeywords } from '@/lib/admin/curation-badges';

// [관리자용 블로그 큐레이션 모달 및 스마트 뷰어](2026-09-05 사용자 지시, Decision 021):
// "관리자가 장소 상세 페이지에서 버튼을 누르면, 네이버 블로그 검색 API를
// 정확도순(sort=sim)으로 호출하여 상위 최신 글 3개를 가져옴." 모달을 여는 것 자체가
// "버튼을 누른" 시점이라 마운트 시 바로 검색을 호출한다(다른 자기완결 패널들의
// "탭 진입 시 자동 조회 금지" 관례와는 다르다 — 이 모달은 열리는 행위 자체가 그
// 명시적 트리거다).
//
// [저장/폐기 정책](사용자 지시 원문): "블로그 본문 텍스트는.. 일시적인 참고용
// (Scratchpad)으로만 사용하고, DB에 절대 저장하지 않고 메모리상에서 즉시 폐기함."
// 이 컴포넌트의 state(blogItems)가 정확히 그 "메모리상 스크래치패드"다 — 모달이
// 닫히면(unmount) React가 이 state를 그대로 버리므로 별도 폐기 로직이 필요 없다.
// 저장 시에는 blogItems[i].link(URL)만 전송하고 description(본문)은 전송하지 않는다.

const RECENT_WINDOW_WARNING = '⚠️ 최근 1년간 후기 없음 - 폐업/방치 검토';
const BADGE_GROUPS: CurationBadgeGroup[] = ['이동/편의', '식사/아기', '공간/놀이', '운영'];

type BlogSearchItem = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  postdate: string;
  isRecent: boolean;
};

type SpotCurationItem = {
  id: string;
  spot_id: string;
  blog_url_1: string | null;
  blog_url_2: string | null;
  blog_url_3: string | null;
  curation_badges: string[];
};

function formatPostdate(postdate: string): string {
  if (!/^\d{8}$/.test(postdate)) return postdate;
  return `${postdate.slice(0, 4)}.${postdate.slice(4, 6)}.${postdate.slice(6, 8)}`;
}

export function BlogCurationModal({
  spot,
  serviceCategories,
  onClose,
  onServiceCategoryUpdated,
}: {
  spot: { id: string; name: string; address: string | null; service_category_id: string | null };
  serviceCategories: ServiceCategory[];
  onClose: () => void;
  onServiceCategoryUpdated: (id: string, nextServiceCategoryId: string | null) => void;
}) {
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

  // [On-Demand](사용자 지시 원문): 모달을 여는 것 자체가 "버튼을 누른" 시점 — 마운트
  // 시 1회만 검색한다. 기존 큐레이션(재편집 시 뱃지/블로그 URL 프리필용)도 함께
  // 조회한다.
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
  }, []);

  function toggleBadge(key: string) {
    setSelectedBadges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
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

      onServiceCategoryUpdated(spot.id, serviceCategoryId || null);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  const activeItem = blogItems?.[activeTab] ?? null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center">
      <div className="w-full md:w-[560px] max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">🔍 블로그로 큐레이션</h2>
            <p className="text-xs text-gray-500">{spot.name}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

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
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => runSearch(searchQuery)}
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
            {/* 상단 영역: 블로그 소스 탭 & URL 링크 */}
            <div className="flex items-center gap-1.5" role="tablist">
              {blogItems.map((item, i) => (
                <button
                  key={item.link}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === i}
                  onClick={() => setActiveTab(i)}
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

        {/* 중단 영역: 큐레이션 폼 */}
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">노출 중분류</span>
          <select
            value={serviceCategoryId}
            onChange={(e) => setServiceCategoryId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            <option value="">(선택 안 함)</option>
            {serviceCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parent_category} &gt; {c.category_name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          {BADGE_GROUPS.map((group) => (
            <div key={group} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-400">{group}</span>
              <div className="flex flex-wrap gap-1.5">
                {CURATION_BADGE_OPTIONS.filter((opt) => opt.group === group).map((opt) => {
                  const checked = selectedBadges.has(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs cursor-pointer ${
                        checked ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBadge(opt.key)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

        {/* 하단 영역: 액션 버튼 */}
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 rounded-full bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '저장 및 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
