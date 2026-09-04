'use client';

import { useMemo, useState } from 'react';
import { DedupCandidateRow, DedupGroup, formatDedupGroupLabel, groupDedupCandidates } from '@/lib/admin/spot-dedup-grouping';

// [2026-09-05 페이지네이션 도입 — 사용자 timeout 신고 대응] "중복 의심 그룹 데이터
// 너무 많나봐 또 timeout 걸리네.. 이것도 50여건씩 pagination 하던가..." 진짜 원인은
// open_spaces 테이블 통계가 낡아 생긴 쿼리 플래너 오판이었고(ANALYZE로 이미 해소,
// /api/admin/spot-dedup/groups/route.ts 주석 참고) 이미 라이브 DB에 반영했지만,
// 통계가 다시 낡아지는 경우에 대비해 방어적으로 커서 기반 페이지네이션도 함께
// 적용한다 — 한 번에 최대 GROUPS_PAGE_SIZE(50)건만 스캔한다.
const GROUPS_PAGE_SIZE = 50;

// [개선사항10 - 관리자 '중복 스팟 그룹핑 및 매핑' 탭](2026-09-04 todo.md): open_spaces
// 원본 데이터를 정제하기 위한 관리자 전용 화면. curated_items/spot_curations와 데이터
// 모양·목적이 완전히 달라 자기완결적인 별도 패널로 분리한다(제5장 제4조 기존 구조
// 우선의 취지는 "다른 목적을 억지로 통합"이 아님 — 기존 CuratedItemsPanel/
// SpotCurationsPanel과 동일한 판단). 관리자 페이지 성능 최적화(2026-08-30 사용자
// 지시) 관례와 동일하게 마운트 시 자동 조회하지 않는다.

type ServiceCategory = {
  id: string;
  parent_category: string;
  category_name: string;
};

// [노출될 중분류] 요구사항 원문의 4개 대분류 — 마이그레이션 시드 데이터와 동일한
// 값을 그대로 옵션으로 쓴다(제5장 제6조 하드코딩 최소화 취지상 이상적으로는 서버에서
// distinct 대분류 목록을 내려받는 편이 좋겠으나, 이 4개는 지시서가 명시적으로 고정한
// 값이라 새 대분류가 생기기 전까지는 상수로 둬도 무리가 없다 — 새 서비스 중분류를
// 만들 때 이 4개 중 하나를 고르게 한다).
const PARENT_CATEGORY_OPTIONS = ['키즈/놀이시설', '농장/체험', '자연/공원', '문화시설'];

const AGE_GROUP_OPTIONS = [
  { value: '', label: '선택 안 함' },
  { value: '미취학', label: '미취학' },
  { value: '취학', label: '취학' },
  { value: '성인', label: '성인 (비노출용)' },
  { value: '기타', label: '기타 (비노출용)' },
];

function GroupDetailModal({
  group,
  serviceCategories,
  onClose,
  onSaved,
}: {
  group: DedupGroup;
  serviceCategories: ServiceCategory[];
  onClose: () => void;
  onSaved: (memberIds: string[]) => void;
}) {
  const [standardName, setStandardName] = useState(group.members[0]?.name ?? '');
  const [serviceCategoryId, setServiceCategoryId] = useState('');
  const [blogUrl, setBlogUrl] = useState('');
  const [ageGroup, setAgeGroup] = useState('');
  const [featureTag, setFeatureTag] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!standardName.trim()) {
      setErrorMessage('표준 시설명을 입력해주세요.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/spot-dedup/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot_ids: group.members.map((m) => m.id),
          standard_name: standardName.trim(),
          service_category_id: serviceCategoryId || null,
          blog_url: blogUrl.trim() || null,
          age_group: ageGroup || null,
          feature_tag: featureTag.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '저장에 실패했습니다.');
      onSaved(group.members.map((m) => m.id));
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[640px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">중복 의심 그룹 검수 ({group.members.length}건)</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {/* 요구사항: "묶인 원천 데이터들의 상세 내용이 나란히 비교 표시" */}
        <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="py-2 px-3">상호명</th>
                <th className="py-2 px-3">원본 중분류</th>
                <th className="py-2 px-3">주소</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {group.members.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 px-3 font-medium text-gray-800">{m.name}</td>
                  <td className="py-2 px-3 text-gray-600">{m.category_min ?? m.category}</td>
                  <td className="py-2 px-3 text-gray-500">{m.address ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">표준 시설명</span>
            <input
              type="text"
              value={standardName}
              onChange={(e) => setStandardName(e.target.value)}
              placeholder="원본 이름을 참고해 깔끔하게 입력"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">중분류</span>
            <select
              value={serviceCategoryId}
              onChange={(e) => setServiceCategoryId(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">선택 안 함</option>
              {serviceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_category} &gt; {c.category_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">블로그 URL (선택)</span>
            <input
              type="text"
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
              placeholder="https://..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">연령대</span>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {AGE_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">특징 (선택)</span>
            <input
              type="text"
              value={featureTag}
              onChange={(e) => setFeatureTag(e.target.value)}
              placeholder="예: 바닥분수 / 놀이터"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : `저장 및 일괄 적용 (${group.members.length}건)`}
          </button>
        </form>
      </div>
    </div>
  );
}

// data-grid-client.tsx의 NULL_FILTER_TOKEN과 동일한 예약값 — "category_min이 없는
// (NULL) 행" 전체를 가리키는 선택지.
const NULL_CATEGORY_MIN_TOKEN = '__NULL__';

export function SpotDedupPanel({ categoryMinOptions }: { categoryMinOptions: string[] }) {
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [hasLoadedCategories, setHasLoadedCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [newParentCategory, setNewParentCategory] = useState(PARENT_CATEGORY_OPTIONS[0]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  // [노출 중분류 대량 매핑](2026-09-05 사용자 지시): "현재 open_spaces에서 이 노출
  // 중분류 매핑할 수 있도록 개선해줘. 그리고 대량의 데이터도 한꺼번에 노출
  // 중분류로 할 수 있는 것도." 원본 중분류(category_min) 값 하나를 골라 그 전체를
  // 노출 중분류로 일괄 반영한다(개별/중복 그룹 매핑과 별개 — 중복 여부와 무관하게
  // 모든 행에 적용 가능).
  const [bulkCategoryMin, setBulkCategoryMin] = useState('');
  const [bulkServiceCategoryId, setBulkServiceCategoryId] = useState('');
  const [bulkOnlyUnmapped, setBulkOnlyUnmapped] = useState(true);
  const [bulkPreviewCount, setBulkPreviewCount] = useState<number | null>(null);
  const [isPreviewingBulk, setIsPreviewingBulk] = useState(false);
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResultMessage, setBulkResultMessage] = useState<string | null>(null);

  // [2026-09-05 페이지네이션] 그룹은 더 이상 서버가 미리 합쳐 주지 않는다 — 원시
  // 후보 행을 페이지(최대 50건)마다 누적하고, 누적된 전체 후보를 대상으로 매번
  // groupDedupCandidates(순수 함수, Union-Find)를 다시 계산한다. 이렇게 해야 서로
  // 다른 페이지에 걸쳐 있던 후보들이 나중에 하나로 합쳐질 수 있다.
  const [candidates, setCandidates] = useState<DedupCandidateRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMoreGroups, setHasMoreGroups] = useState(false);
  const [hasLoadedGroups, setHasLoadedGroups] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<DedupGroup | null>(null);

  const groups = useMemo(() => groupDedupCandidates(candidates), [candidates]);

  function loadServiceCategories() {
    setHasLoadedCategories(true);
    setCategoriesError(null);
    fetch('/api/admin/service-categories')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '중분류 조회에 실패했습니다.');
        setServiceCategories(data.items ?? []);
      })
      .catch((err) => setCategoriesError(err instanceof Error ? err.message : '중분류 조회에 실패했습니다.'));
  }

  // 처음 불러오기(누적 초기화) — after를 실을 이유가 없으므로 매번 새로 시작한다.
  function loadGroups() {
    setHasLoadedGroups(true);
    setCandidates([]);
    setCursor(null);
    setHasMoreGroups(false);
    fetchGroupsPage(null, true);
  }

  // 다음 페이지(50건) 이어서 불러오기 — 기존 누적 후보에 추가한다.
  function loadMoreGroups() {
    fetchGroupsPage(cursor, false);
  }

  function fetchGroupsPage(after: string | null, isInitial: boolean) {
    setIsLoadingGroups(true);
    setGroupsError(null);
    const url = after ? `/api/admin/spot-dedup/groups?after=${encodeURIComponent(after)}` : '/api/admin/spot-dedup/groups';
    fetch(url)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '중복 의심 그룹 조회에 실패했습니다.');
        setCandidates((prev) => (isInitial ? (data.candidates ?? []) : [...prev, ...(data.candidates ?? [])]));
        setCursor(data.next_cursor ?? null);
        setHasMoreGroups(Boolean(data.has_more));
      })
      .catch((err) => setGroupsError(err instanceof Error ? err.message : '중복 의심 그룹 조회에 실패했습니다.'))
      .finally(() => setIsLoadingGroups(false));
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsCreatingCategory(true);
    try {
      const res = await fetch('/api/admin/service-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_category: newParentCategory, category_name: newCategoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '중분류 생성에 실패했습니다.');
      setServiceCategories((prev) => [...prev, data.item]);
      setNewCategoryName('');
    } catch (err) {
      setCategoriesError(err instanceof Error ? err.message : '중분류 생성에 실패했습니다.');
    } finally {
      setIsCreatingCategory(false);
    }
  }

  function handleGroupSaved(memberIds: string[]) {
    // 처리된 그룹의 후보들을 누적 목록에서 제거한다 — 해당 스팟들은 이제
    // service_category_id가 채워져 다음 조회부터는 애초에 후보에서 빠진다(재조회
    // 없이도 이미 정확함). groups는 candidates에서 파생되므로 이걸로 충분하다.
    const removed = new Set(memberIds);
    setCandidates((prev) => prev.filter((c) => !removed.has(c.id)));
  }

  function handlePreviewBulk() {
    if (!bulkCategoryMin) {
      setBulkError('원본 중분류를 선택해주세요.');
      return;
    }
    setIsPreviewingBulk(true);
    setBulkError(null);
    setBulkResultMessage(null);
    fetch(
      `/api/admin/open-spaces/bulk-category-mapping?category_min=${encodeURIComponent(bulkCategoryMin)}&only_unmapped=${bulkOnlyUnmapped}`
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '대상 건수 조회에 실패했습니다.');
        setBulkPreviewCount(data.matching_count);
      })
      .catch((err) => setBulkError(err instanceof Error ? err.message : '대상 건수 조회에 실패했습니다.'))
      .finally(() => setIsPreviewingBulk(false));
  }

  function handleApplyBulk() {
    if (!bulkCategoryMin) {
      setBulkError('원본 중분류를 선택해주세요.');
      return;
    }
    if (!bulkServiceCategoryId) {
      setBulkError('노출 중분류를 선택해주세요.');
      return;
    }
    // 몇만 건 단위까지 한 번에 되돌릴 수 없이 반영되는 작업이라(제5장 제11조와
    // 별개로 실수 방지 차원) 실행 전 반드시 확인을 받는다 — 미리보기를 아직 안
    // 눌렀으면 그 사실도 함께 알려 대상 건수를 모른 채 누르는 것을 막는다.
    const confirmed = window.confirm(
      bulkPreviewCount != null
        ? `${bulkPreviewCount}건에 노출 중분류를 일괄 반영합니다. 계속할까요?`
        : '아직 [미리보기]로 대상 건수를 확인하지 않았습니다. 그래도 계속할까요?'
    );
    if (!confirmed) return;

    setIsApplyingBulk(true);
    setBulkError(null);
    setBulkResultMessage(null);
    fetch('/api/admin/open-spaces/bulk-category-mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_min: bulkCategoryMin,
        service_category_id: bulkServiceCategoryId,
        only_unmapped: bulkOnlyUnmapped,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '일괄 매핑에 실패했습니다.');
        setBulkResultMessage(`${data.updated_count}건에 노출 중분류를 반영했습니다.`);
        setBulkPreviewCount(null);
      })
      .catch((err) => setBulkError(err instanceof Error ? err.message : '일괄 매핑에 실패했습니다.'))
      .finally(() => setIsApplyingBulk(false));
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
      {/* [관리자 페이지 성능 최적화](2026-08-30 사용자 지시) 관례 그대로 — 탭 진입 시
          자동으로 조회하지 않고, 관리자가 각 영역의 "불러오기"를 눌러야 조회한다
          (CuratedItemsPanel/SpotCurationsPanel/MomPickPostsPanel과 동일한 원칙). */}
      {/* 요구사항 3-1: 노출 중분류 관리 영역 */}
      <section className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">🏷️ 노출 중분류 관리</h2>
          {hasLoadedCategories && (
            <button
              type="button"
              onClick={loadServiceCategories}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              새로고침
            </button>
          )}
        </div>
        <form onSubmit={handleCreateCategory} className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={newParentCategory}
            onChange={(e) => setNewParentCategory(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          >
            {PARENT_CATEGORY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="새 중분류명 (예: 야외 물놀이터)"
            className="flex-1 min-w-[160px] rounded-lg border border-gray-300 px-3 py-1.5 text-xs"
          />
          <button
            type="submit"
            disabled={isCreatingCategory}
            className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
          >
            + 추가
          </button>
        </form>
        {categoriesError && <p className="text-xs text-red-600 mb-2">{categoriesError}</p>}
        {!hasLoadedCategories ? (
          <button
            type="button"
            onClick={loadServiceCategories}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            📥 불러오기
          </button>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {serviceCategories.map((c) => (
              <span key={c.id} className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600">
                {c.parent_category} &gt; {c.category_name}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* [노출 중분류 대량 매핑](2026-09-05 사용자 지시): 원본 중분류 하나를 통째로
          노출 중분류에 매핑한다 — 중복 여부와 무관하게 모든 행에 적용 가능하고,
          수만 건 단위도 한 번에 처리한다(서버가 id 목록이 아니라 조건절 그대로
          UPDATE). */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">🗂️ 노출 중분류 대량 매핑</h2>
        <p className="mb-3 text-xs text-gray-500">
          원본 중분류(category_min) 하나를 골라, 그 전체를 노출 중분류로 한 번에 반영합니다. 중복 여부와
          무관하게 적용됩니다.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkCategoryMin}
              onChange={(e) => {
                setBulkCategoryMin(e.target.value);
                setBulkPreviewCount(null);
                setBulkResultMessage(null);
              }}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="">원본 중분류 선택</option>
              <option value={NULL_CATEGORY_MIN_TOKEN}>(미분류 — category_min 없음)</option>
              {categoryMinOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">→</span>
            <select
              value={bulkServiceCategoryId}
              onChange={(e) => setBulkServiceCategoryId(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            >
              <option value="">노출 중분류 선택</option>
              {serviceCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_category} &gt; {c.category_name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={bulkOnlyUnmapped}
              onChange={(e) => {
                setBulkOnlyUnmapped(e.target.checked);
                setBulkPreviewCount(null);
              }}
              className="h-3.5 w-3.5"
            />
            아직 노출 중분류가 없는 행만 대상으로(이미 매핑된 행은 덮어쓰지 않음)
          </label>

          {serviceCategories.length === 0 && hasLoadedCategories && (
            <p className="text-[11px] text-amber-600">위 "노출 중분류 관리"에서 먼저 중분류를 만들거나 불러와주세요.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePreviewBulk}
              disabled={isPreviewingBulk || !bulkCategoryMin}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {isPreviewingBulk ? '조회 중...' : '미리보기(대상 건수 확인)'}
            </button>
            <button
              type="button"
              onClick={handleApplyBulk}
              disabled={isApplyingBulk || !bulkCategoryMin || !bulkServiceCategoryId}
              className="rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {isApplyingBulk ? '적용 중...' : '일괄 매핑 적용'}
            </button>
            {bulkPreviewCount != null && <span className="text-xs text-gray-600">대상 {bulkPreviewCount.toLocaleString()}건</span>}
          </div>

          {bulkError && <p className="text-xs text-red-600">{bulkError}</p>}
          {bulkResultMessage && <p className="text-xs text-emerald-600">{bulkResultMessage}</p>}
        </div>
      </section>

      {/* 요구사항 3-2/3-3: 좌표/주소 기반 그룹 리스트 + 상세/매핑 */}
      <section className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">🔗 중복 의심 그룹</h2>
          {hasLoadedGroups && (
            <button
              type="button"
              onClick={loadGroups}
              disabled={isLoadingGroups}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              {isLoadingGroups ? '불러오는 중...' : '새로고침'}
            </button>
          )}
        </div>
        {groupsError && <p className="text-xs text-red-600 mb-2">{groupsError}</p>}
        {!hasLoadedGroups ? (
          <button type="button" onClick={loadGroups} className="text-xs font-medium text-blue-600 hover:underline">
            📥 불러오기
          </button>
        ) : (
          <>
            {/* [2026-09-05] 페이지네이션 도입으로 "지금까지 몇 건을 스캔했는지"가
                더 이상 한눈에 안 보이므로, 관리자가 진행 상황을 가늠할 수 있게
                누적 스캔 건수를 함께 보여준다. */}
            <p className="mb-2 text-[11px] text-gray-400">지금까지 스캔한 후보 {candidates.length}건</p>
            {!isLoadingGroups && groups.length === 0 && !groupsError && (
              <p className="text-xs text-gray-400">
                {hasMoreGroups ? '이 구간에는 중복 의심 그룹이 없어요.' : '현재 중복 의심 그룹이 없습니다.'}
              </p>
            )}
            <ul className="flex flex-col divide-y divide-gray-100">
              {groups.map((group) => (
                <li key={group.groupKey}>
                  <button
                    type="button"
                    onClick={() => setSelectedGroup(group)}
                    className="w-full text-left py-2.5 text-sm text-gray-800 hover:bg-gray-50"
                  >
                    {formatDedupGroupLabel(group)}
                  </button>
                </li>
              ))}
            </ul>
            {hasMoreGroups && (
              <button
                type="button"
                onClick={loadMoreGroups}
                disabled={isLoadingGroups}
                className="mt-3 w-full rounded-lg border border-gray-300 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {isLoadingGroups ? '불러오는 중...' : `다음 ${GROUPS_PAGE_SIZE}건 더 스캔하기`}
              </button>
            )}
          </>
        )}
      </section>

      {selectedGroup && (
        <GroupDetailModal
          group={selectedGroup}
          serviceCategories={serviceCategories}
          onClose={() => setSelectedGroup(null)}
          onSaved={handleGroupSaved}
        />
      )}
    </div>
  );
}
