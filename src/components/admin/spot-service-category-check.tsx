'use client';

import { useEffect, useState } from 'react';
import { ServiceCategory } from '@/lib/admin/service-category';

// [연결된 스팟의 노출 중분류 확인/입력](2026-09-12 사용자 지시): "연결하면 연결됨이라고
// 뜨는데.. 해당 장소가 노출 중분류가 있는지 확인하고.. 없으면 노출 중분류를 입력하라고
// 하고 해당 팝업화면에서 노출 중분류 선택 및 저장 가능하도록 해줘" — events 탭
// 상세 팝업(raw-data-modal.tsx의 SpaceLinkEditor)에 처음 만든 기능이었는데, 이 로직
// 자체를 재사용 가능한 컴포넌트로 뽑았다.
// [큐레이션/제휴 상품 등록에도 동일하게 적용](2026-09-13 사용자 지시): "큐레이션/제휴
// 상품 등록탭에서도 장소 입력하면 해당 장소가 노출 중분류 없으면 관리자가 입력할수
// 있도록.. events쪽의 관리자 상세 팝업에서.. 하는것처럼" — curated-item-form-modal.tsx가
// 스팟(spot_id)을 연동할 때도 같은 확인/입력 UI가 필요해, 원래 SpaceLinkEditor 안에
// 있던 이 부분만 별도 컴포넌트로 분리해 두 곳이 공유한다(제5장 제4조 기존 구조 우선 —
// 같은 로직을 두 번 만들지 않음).
export function SpotServiceCategoryCheck({
  spotId,
  serviceCategories,
}: {
  spotId: string | null;
  serviceCategories: ServiceCategory[];
}) {
  // undefined = 아직 조회 전, null = 조회 완료했지만 노출 중분류 없음.
  const [spaceServiceCategoryId, setSpaceServiceCategoryId] = useState<string | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!spotId) {
      setSpaceServiceCategoryId(undefined);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    fetch(`/api/admin/data-grid/space-link?space_id=${encodeURIComponent(spotId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.space) return;
        setSpaceServiceCategoryId(data.space.service_category_id ?? null);
        setCategoryDraft(data.space.service_category_id ?? '');
      })
      .catch(() => {
        // 조용한 부가 조회 실패는 스팟 연동 자체를 막지 않는다(제5장 제11조).
      })
      .finally(() => setIsLoading(false));
  }, [spotId]);

  async function handleSaveCategory() {
    if (!spotId) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/open-spaces/bulk-category-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [spotId], service_category_id: categoryDraft || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '노출 중분류 저장 실패');
      setSpaceServiceCategoryId(categoryDraft || null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '노출 중분류 저장 실패');
    } finally {
      setIsSaving(false);
    }
  }

  if (!spotId) return null;

  const currentCategory = serviceCategories.find((c) => c.id === spaceServiceCategoryId);

  return (
    <>
      {isLoading && spaceServiceCategoryId === undefined && (
        <p className="mt-2 text-[11px] text-gray-400">노출 중분류 확인 중...</p>
      )}

      {!isLoading && spaceServiceCategoryId && (
        <p className="mt-2 text-[11px] font-medium text-emerald-700">
          ✅ 노출 중분류: {currentCategory ? `${currentCategory.parent_category} > ${currentCategory.category_name}` : spaceServiceCategoryId}
        </p>
      )}

      {!isLoading && spaceServiceCategoryId === null && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
          <p className="text-[11px] font-semibold text-amber-800 mb-1.5">
            ⚠️ 이 스팟은 노출 중분류가 없어요 — 카테고리 필터로는 스팟픽에서 찾을 수 없어요. 지금 지정해 주세요.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={categoryDraft}
              onChange={(e) => setCategoryDraft(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs flex-1"
            >
              <option value="">(선택 안 함)</option>
              {serviceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_category} &gt; {c.category_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSaveCategory}
              disabled={isSaving || !categoryDraft}
              className="shrink-0 rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
          {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
        </div>
      )}
    </>
  );
}
