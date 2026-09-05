'use client';

import { useEffect, useState } from 'react';
import { ServiceCategory } from '@/lib/admin/service-category';
import { useSpotCurationForm } from '@/lib/admin/use-spot-curation-form';
import { BlogReferenceViewer } from '@/components/admin/blog-reference-viewer';
import { CurationBadgeForm } from '@/components/admin/curation-badge-form';
import { GroupDetailModal } from '@/components/admin/spot-dedup-panel';
import { DedupCandidateRow } from '@/lib/admin/spot-dedup-grouping';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시): "관리자 대시보드에서
// [Open Spaces 중분류 조회 리스트]와.. 워크벤치를 자연스럽게 연결.. 특정 장소(스팟)의
// 키즈/체험 관련 큐레이션을 효율적으로 처리". CategoryMappingPanel의 RowPicker에서
// 행을 클릭하면 이 전체화면 컴포넌트가 열려 (1) 중복 장소 검수 → (2) 노출 중분류/
// 뱃지 태깅 → (3) 블로그 참고 → (4) 저장 및 다음 미처리 스팟 이동까지 한 화면에서
// 세로 스크롤로 이어지도록 한다.
//
// [재사용](제5장 제4조): 블로그 검색/뱃지 폼/저장 로직은 BlogCurationModal과 동일한
// useSpotCurationForm 훅 + BlogReferenceViewer/CurationBadgeForm을 그대로 쓴다.
// "합치기" 액션은 SpotDedupPanel의 GroupDetailModal(그룹 병합 폼 + apply API 호출)을
// 그대로 재사용한다 — 이 스팟과 유사 스팟 2건짜리 임시 DedupGroup을 즉석에서 만들어
// 넘긴다.

export type CurationQueueItem = {
  id: string;
  name: string;
  address: string | null;
  category_min: string | null;
};

type NearbySpot = {
  id: string;
  name: string;
  category: string;
  category_min: string | null;
  address: string | null;
  distance_m: number;
};

type WorkbenchSpot = {
  id: string;
  name: string;
  address: string | null;
  service_category_id: string | null;
};

export function MobileCurationWorkbench({
  spot,
  serviceCategories,
  queue,
  onClose,
  onAdvance,
  onServiceCategoryUpdated,
}: {
  spot: WorkbenchSpot;
  serviceCategories: ServiceCategory[];
  // 저장 후 "다음 미처리 스팟"을 찾는 기준이 되는 목록 — RowPicker가 이미 조회해둔
  // 페이지(category_min으로 필터링된 최대 50건)를 그대로 넘긴다(제5장 제4조 —
  // 이 목적을 위한 새 "큐" 엔드포인트를 따로 만들지 않는다).
  queue: CurationQueueItem[];
  onClose: () => void;
  // 다음 스팟으로 전환(nextId) 또는 더 이상 미처리 스팟이 없어 종료(null)를 알린다.
  onAdvance: (nextId: string | null) => void;
  onServiceCategoryUpdated: (id: string, next: string | null) => void;
}) {
  const form = useSpotCurationForm(spot);

  const [nearby, setNearby] = useState<NearbySpot[] | null>(null);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [dismissedNearbyIds, setDismissedNearbyIds] = useState<Set<string>>(new Set());
  const [mergeTarget, setMergeTarget] = useState<NearbySpot | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceMessage, setAdvanceMessage] = useState<string | null>(null);

  // [1단: 중복 장소 검수 배너](사용자 지시 원문): "반경 내 유사 장소 안내." 스팟이
  // 바뀔 때마다(부모가 key={spot.id}로 이 컴포넌트를 새로 마운트) 다시 조회한다.
  useEffect(() => {
    fetch(`/api/admin/spot-dedup/nearby?spot_id=${encodeURIComponent(spot.id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '주변 유사 장소 조회에 실패했습니다.');
        setNearby(data.items ?? []);
      })
      .catch((err) => setNearbyError(err instanceof Error ? err.message : '주변 유사 장소 조회에 실패했습니다.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id]);

  function dismissNearby(id: string) {
    setDismissedNearbyIds((prev) => new Set(prev).add(id));
    // "유지(다른 장소임)" 판단을 세션 로그로 남긴다 — 기존 중복 검수 탭의 임시 저장
    // 테이블(spot_dedup_pending_groups)을 그대로 재사용한다(제5장 제4조).
    fetch('/api/admin/spot-dedup/pending-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_spot_ids: [spot.id, id], status: 'ignored' }),
    }).catch(() => {
      // 부가적인 이력 저장 실패가 검수 흐름 자체를 막지 않는다(제5장 제11조).
    });
  }

  const visibleNearby = (nearby ?? []).filter((n) => !dismissedNearbyIds.has(n.id));

  // ["다음 미처리 스팟으로 이동"](사용자 지시 원문). "미처리"는 이 스팟에 대한
  // spot_curations 레코드가 없거나 뱃지가 비어있는 상태로 정의한다(DB로 확인 가능한
  // 유일하게 명확한 기준 — 추측 대신 이미 존재하는 GET ?spot_id= 단건 조회를 큐
  // 순서대로 재사용한다. 별도의 대량 "다음 큐" 엔드포인트는 만들지 않는다).
  async function findNextUnprocessedId(afterId: string): Promise<string | null> {
    const currentIndex = queue.findIndex((item) => item.id === afterId);
    for (let i = currentIndex + 1; i < queue.length; i += 1) {
      const candidate = queue[i];
      try {
        const res = await fetch(`/api/admin/spot-curations?spot_id=${encodeURIComponent(candidate.id)}`);
        const data = await res.json();
        const badges: string[] = data?.item?.curation_badges ?? [];
        if (badges.length === 0) return candidate.id;
      } catch {
        // 조회 실패한 후보는 건너뛰지 않는다 — 놓치는 것보다 관리자가 직접 보고
        // 판단하는 편이 안전하다(제5장 제11조).
        return candidate.id;
      }
    }
    return null;
  }

  async function handleSaveAndNext() {
    const ok = await form.save();
    if (!ok) return;
    onServiceCategoryUpdated(spot.id, form.serviceCategoryId || null);

    setIsAdvancing(true);
    setAdvanceMessage(null);
    const nextId = await findNextUnprocessedId(spot.id);
    setIsAdvancing(false);

    if (nextId) {
      onAdvance(nextId);
    } else {
      setAdvanceMessage('✅ 이 목록의 모든 스팟을 처리했습니다.');
      window.setTimeout(() => onAdvance(null), 900);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-white flex flex-col">
      <div className="shrink-0 flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-gray-900 truncate">🧰 큐레이션 워크벤치</h2>
          <p className="text-xs text-gray-500 truncate">
            {spot.name} · {spot.address ?? '-'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 text-gray-400 hover:text-gray-600 text-lg px-2"
        >
          ✕
        </button>
      </div>

      {/* [관리자 대시보드 모바일 레이아웃/스크롤 버그 긴급 수정](2026-09-05 사용자
          지시)과 동일한 관례 — flex-1 + min-h-0 + overflow-y-auto로 이 영역만
          세로 스크롤되게 한다. */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-5">
        {/* 1단: 중복 장소 검수 배너 */}
        {nearbyError && <p className="text-xs text-red-600">{nearbyError}</p>}
        {visibleNearby.map((n) => (
          <div key={n.id} className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-col gap-2">
            <p className="text-xs font-semibold text-amber-800">
              ⚠️ 유사 장소 발견: {n.name} ({n.distance_m}m · {n.address ?? '주소 없음'})
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMergeTarget(n)}
                className="rounded-full bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-amber-700"
              >
                합치기
              </button>
              <button
                type="button"
                onClick={() => dismissNearby(n.id)}
                className="rounded-full border border-amber-300 text-amber-700 text-xs font-medium px-3 py-1.5 hover:bg-amber-100"
              >
                유지(다른 장소임)
              </button>
            </div>
          </div>
        ))}

        {/* 2단: 중분류 선택 및 뱃지 태깅 폼 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400">2. 노출 중분류 & 편의시설 뱃지</h3>
          <CurationBadgeForm
            serviceCategoryId={form.serviceCategoryId}
            onServiceCategoryChange={form.setServiceCategoryId}
            serviceCategories={serviceCategories}
            selectedBadges={form.selectedBadges}
            onToggleBadge={form.toggleBadge}
          />
        </section>

        {/* 3단: 네이버 블로그 참고 & 형광펜 뷰어 */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-gray-400">3. 블로그 참고 (URL만 저장, 본문은 저장 안 함)</h3>
          <BlogReferenceViewer
            searchQuery={form.searchQuery}
            onSearchQueryChange={form.setSearchQuery}
            onSearch={form.runSearch}
            isSearching={form.isSearching}
            searchError={form.searchError}
            blogItems={form.blogItems}
            hasRecentReview={form.hasRecentReview}
            hasNoResults={form.hasNoResults}
            activeTab={form.activeTab}
            onActiveTabChange={form.setActiveTab}
          />
        </section>

        {form.saveError && <p className="text-xs text-red-600">{form.saveError}</p>}
        {advanceMessage && <p className="text-xs font-semibold text-emerald-600">{advanceMessage}</p>}
      </div>

      {/* 4단: 저장 및 다음 이동 — safe-area 하단 여백까지 고려한다(모바일 홈 인디케이터). */}
      <div
        className="shrink-0 border-t border-gray-100 p-3 flex items-center gap-2"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-full border border-gray-300 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSaveAndNext}
          disabled={form.isSaving || isAdvancing}
          className="flex-[2] rounded-full bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
        >
          {form.isSaving ? '저장 중...' : isAdvancing ? '다음 스팟 찾는 중...' : '저장 및 다음 미처리 스팟으로 이동'}
        </button>
      </div>

      {mergeTarget && (
        <GroupDetailModal
          group={{
            groupKey: `${spot.id}-${mergeTarget.id}`,
            members: [
              spotToDedupCandidateRow(spot, mergeTarget.category),
              {
                id: mergeTarget.id,
                name: mergeTarget.name,
                category: mergeTarget.category,
                category_min: mergeTarget.category_min,
                address: mergeTarget.address,
                normalized_address: '',
                lat: null,
                lng: null,
              },
            ],
          }}
          serviceCategories={serviceCategories}
          onClose={() => setMergeTarget(null)}
          onSaved={() => {
            setDismissedNearbyIds((prev) => new Set(prev).add(mergeTarget.id));
            setMergeTarget(null);
          }}
        />
      )}
    </div>
  );
}

// GroupDetailModal이 요구하는 DedupCandidateRow 모양으로 현재 스팟을 감싼다 —
// normalized_address/lat/lng는 그 모달의 비교 표/apply 호출 어디에도 쓰이지 않는
// 표시 전용 필드라 빈 값으로 채워도 안전하다.
function spotToDedupCandidateRow(spot: WorkbenchSpot, fallbackCategory: string): DedupCandidateRow {
  return {
    id: spot.id,
    name: spot.name,
    category: fallbackCategory,
    category_min: null,
    address: spot.address,
    normalized_address: '',
    lat: null,
    lng: null,
  };
}
