'use client';

import { ServiceCategory } from '@/lib/admin/service-category';
import { useSpotCurationForm } from '@/lib/admin/use-spot-curation-form';
import { BlogReferenceViewer } from '@/components/admin/blog-reference-viewer';
import { CurationBadgeForm } from '@/components/admin/curation-badge-form';

// [관리자용 블로그 큐레이션 모달 및 스마트 뷰어](2026-09-05 사용자 지시, Decision 021):
// "관리자가 장소 상세 페이지에서 버튼을 누르면, 네이버 블로그 검색 API를
// 정확도순(sort=sim)으로 호출하여 상위 최신 글 3개를 가져옴." 모달을 여는 것 자체가
// "버튼을 누른" 시점이라 마운트 시 바로 검색을 호출한다(다른 자기완결 패널들의
// "탭 진입 시 자동 조회 금지" 관례와는 다르다 — 이 모달은 열리는 행위 자체가 그
// 명시적 트리거다).
// [정렬 기준 변경](2026-09-06, Decision 021 8항): 위 "정확도순(sort=sim)"은 사용자
// 지시 원문이지만, 실측 결과 지금 NAVER API HUB의 sort=sim이 스팸성 결과를 상위로
// 올리는 것을 확인해 사용자 확인 후 실제 호출은 sort=date로 바뀌었다 — 실제 파라미터는
// src/app/api/admin/spot-curations/blog-search/route.ts 참고.
//
// [저장/폐기 정책](사용자 지시 원문): "블로그 본문 텍스트는.. 일시적인 참고용
// (Scratchpad)으로만 사용하고, DB에 절대 저장하지 않고 메모리상에서 즉시 폐기함."
// 이 컴포넌트의 state(blogItems, useSpotCurationForm 내부)가 정확히 그 "메모리상
// 스크래치패드"다 — 모달이 닫히면(unmount) React가 이 state를 그대로 버리므로 별도
// 폐기 로직이 필요 없다. 저장 시에는 blogItems[i].link(URL)만 전송하고
// description(본문)은 전송하지 않는다.
//
// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시) 도입 후속 리팩터링:
// 이 모달과 워크벤치가 완전히 동일한 "블로그 검색+저장" 로직/뷰를 필요로 해
// useSpotCurationForm 훅 + BlogReferenceViewer/CurationBadgeForm 프레젠테이션
// 컴포넌트로 뽑아 재사용한다(제5장 제4조 기존 구조 우선) — 이 파일은 이제 그
// 조각들을 작은 팝업 레이아웃으로 조립하기만 한다. 렌더링 결과(문구/구조)는
// 기존과 동일해 기존 테스트가 그대로 통과한다.
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
  const form = useSpotCurationForm(spot);

  async function handleSave() {
    const ok = await form.save();
    if (!ok) return;
    onServiceCategoryUpdated(spot.id, form.serviceCategoryId || null);
    onClose();
  }

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
          activeBody={form.activeBody}
          onOverrideUrl={form.overrideActiveUrl}
          sortOption={form.sortOption}
          onSortOptionChange={form.setSortOption}
        />

        <CurationBadgeForm
          serviceCategoryId={form.serviceCategoryId}
          onServiceCategoryChange={form.setServiceCategoryId}
          serviceCategories={serviceCategories}
          selectedBadges={form.selectedBadges}
          onToggleBadge={form.toggleBadge}
        />

        {form.saveError && <p className="text-xs text-red-600">{form.saveError}</p>}

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
            disabled={form.isSaving}
            className="flex-1 rounded-full bg-blue-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50"
          >
            {form.isSaving ? '저장 중...' : '저장 및 완료'}
          </button>
        </div>
      </div>
    </div>
  );
}
