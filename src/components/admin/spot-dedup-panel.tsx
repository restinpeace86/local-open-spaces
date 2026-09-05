'use client';

import { useMemo, useState } from 'react';
import { DedupCandidateRow, DedupGroup, formatDedupGroupLabel, groupDedupCandidates } from '@/lib/admin/spot-dedup-grouping';
import { buildPendingGroupKey } from '@/lib/admin/spot-dedup-pending-key';
import { ServiceCategory } from '@/lib/admin/service-category';

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
//
// [노출 중분류 매핑/중복 스팟 검수 탭 분리](2026-09-05 사용자 지시): "중분류 매핑과
// 중복 스팟 검수 탭을 분리해라" — "노출 중분류 관리"/"노출 중분류 대량 매핑" 두 섹션은
// category-mapping-panel.tsx(CategoryMappingPanel)로 이전했다. 이 패널은 이제 중복
// 의심 그룹 검수/병합만 담당한다. 다만 그룹 병합 모달(GroupDetailModal)이 여전히
// "노출 중분류" 선택 드롭다운을 쓰므로, serviceCategories 목록 자체는 이 패널도 계속
// 자체적으로(가볍게) 조회한다 — "관리(생성)" UI만 이전했을 뿐 "조회"는 두 탭 모두
// 필요하다.

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

// [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시): GET /api/admin/spot-dedup/
// pending-groups가 돌려주는 모양 그대로 — open_spaces 조인까지 서버에서 끝내 온다.
type PendingGroupMember = { id: string; name: string; category: string; category_min: string | null; address: string | null };
type PendingGroupItem = {
  id: string;
  group_key: string;
  status: 'in_progress' | 'ignored';
  updated_at: string;
  members: PendingGroupMember[];
};

export function SpotDedupPanel() {
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [hasLoadedCategories, setHasLoadedCategories] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

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

  // [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시) 참고: 그룹을 열어
  // 검수를 시작하면 in_progress로, "중복 아님"으로 확인하면 ignored로 이 임시 테이블에
  // 남긴다. 최종 등록되면(GroupDetailModal → apply) 서버가 자동으로 삭제한다.
  const [pendingGroups, setPendingGroups] = useState<PendingGroupItem[]>([]);
  const [hasLoadedPendingGroups, setHasLoadedPendingGroups] = useState(false);
  const [isLoadingPendingGroups, setIsLoadingPendingGroups] = useState(false);
  const [pendingGroupsError, setPendingGroupsError] = useState<string | null>(null);

  // ignored로 확인된 그룹은 다음 스캔에서도 계속 같은 조합으로 재구성될 수 있으므로
  // (open_spaces 데이터 자체는 그대로라 union-find가 매번 똑같이 묶는다), 같은 구성원
  // 집합이면 목록에서 걸러내 반복 검토를 막는다.
  const ignoredGroupKeys = useMemo(
    () => new Set(pendingGroups.filter((g) => g.status === 'ignored').map((g) => g.group_key)),
    [pendingGroups]
  );

  const groups = useMemo(
    () =>
      groupDedupCandidates(candidates).filter(
        (g) => !ignoredGroupKeys.has(buildPendingGroupKey(g.members.map((m) => m.id)))
      ),
    [candidates, ignoredGroupKeys]
  );

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
  // [노출 중분류 매핑/중복 스팟 검수 탭 분리](2026-09-05 사용자 지시): "노출 중분류
  // 관리" 섹션이 category-mapping-panel.tsx로 옮겨가면서 이 패널엔 serviceCategories를
  // 채워줄 눈에 보이는 UI가 없어졌다 — 그룹 병합 모달이 여전히 그 목록을 쓰므로,
  // 그룹을 불러오는 시점에 함께 조용히 가져온다(관리자 페이지 성능 최적화 관례 —
  // "탭 진입 시 자동 조회 금지"는 지키되, 그룹 조회는 관리자가 명시적으로 누른 행동
  // 이므로 그 김에 필요한 부가 데이터도 함께 가져오는 것은 그 원칙을 벗어나지 않는다).
  function loadGroups() {
    setHasLoadedGroups(true);
    setCandidates([]);
    setCursor(null);
    setHasMoreGroups(false);
    fetchGroupsPage(null, true);
    if (!hasLoadedCategories) loadServiceCategories();
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

  function handleGroupSaved(memberIds: string[]) {
    // 처리된 그룹의 후보들을 누적 목록에서 제거한다 — 해당 스팟들은 이제
    // service_category_id가 채워져 다음 조회부터는 애초에 후보에서 빠진다(재조회
    // 없이도 이미 정확함). groups는 candidates에서 파생되므로 이걸로 충분하다.
    const removed = new Set(memberIds);
    setCandidates((prev) => prev.filter((c) => !removed.has(c.id)));
    // apply/route.ts가 서버에서 이미 임시 저장 행을 삭제했다 — 클라이언트 목록도
    // 같은 group_key를 골라내 즉시 반영한다(다시 불러오지 않아도 정확함).
    const groupKey = buildPendingGroupKey(memberIds);
    setPendingGroups((prev) => prev.filter((g) => g.group_key !== groupKey));
  }

  function loadPendingGroups() {
    setHasLoadedPendingGroups(true);
    setIsLoadingPendingGroups(true);
    setPendingGroupsError(null);
    fetch('/api/admin/spot-dedup/pending-groups')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '진행 중 그룹 조회에 실패했습니다.');
        setPendingGroups(data.items ?? []);
      })
      .catch((err) => setPendingGroupsError(err instanceof Error ? err.message : '진행 중 그룹 조회에 실패했습니다.'))
      .finally(() => setIsLoadingPendingGroups(false));
  }

  // 그룹을 열어 검수를 시작할 때(in_progress) 또는 "중복 아님"으로 확인할 때(ignored)
  // 호출한다 — 실패해도 화면 흐름을 막지 않는다(부수적인 임시 저장일 뿐, 핵심 기능인
  // 검수/매핑 자체는 이 저장과 무관하게 계속 동작해야 한다).
  function stagePendingGroup(group: DedupGroup, status: 'in_progress' | 'ignored') {
    const memberIds = group.members.map((m) => m.id);
    fetch('/api/admin/spot-dedup/pending-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_spot_ids: memberIds, status }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '임시 저장 실패');
        // "중복 아님"으로 넘긴 그룹은 (진행 중 저장된 그룹 영역을 아직 불러오지 않았어도)
        // 위 ignoredGroupKeys가 즉시 반영되도록 hasLoadedPendingGroups 여부와 무관하게
        // 항상 로컬 상태를 갱신한다 — 서버 목록은 그 영역을 실제로 열 때 다시 정확히
        // 맞춰진다(loadPendingGroups가 덮어씀).
        setPendingGroups((prev) => {
          const groupKey = data.group_key as string;
          const next = prev.filter((g) => g.group_key !== groupKey);
          next.unshift({
            id: groupKey,
            group_key: groupKey,
            status,
            updated_at: new Date().toISOString(),
            members: group.members.map((m) => ({ id: m.id, name: m.name, category: m.category, category_min: m.category_min, address: m.address })),
          });
          return next;
        });
      })
      .catch((err) => console.warn('⚠️ 그룹 임시 저장 실패(무시하고 계속):', err instanceof Error ? err.message : err));
  }

  function handleOpenGroup(group: DedupGroup) {
    setSelectedGroup(group);
    stagePendingGroup(group, 'in_progress');
  }

  function handleIgnoreGroup(group: DedupGroup) {
    stagePendingGroup(group, 'ignored');
  }

  function handleRemovePendingGroup(groupKey: string) {
    setPendingGroups((prev) => prev.filter((g) => g.group_key !== groupKey));
    fetch(`/api/admin/spot-dedup/pending-groups?group_key=${encodeURIComponent(groupKey)}`, { method: 'DELETE' }).catch(
      (err) => console.warn('⚠️ 임시 저장 삭제 실패:', err)
    );
  }

  function resumePendingGroup(pending: PendingGroupItem) {
    setSelectedGroup({
      groupKey: pending.group_key,
      members: pending.members.map((m) => ({ ...m, normalized_address: '', lat: null, lng: null })),
    });
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
      {/* [관리자 페이지 성능 최적화](2026-08-30 사용자 지시) 관례 그대로 — 탭 진입 시
          자동으로 조회하지 않고, 관리자가 각 영역의 "불러오기"를 눌러야 조회한다
          (CuratedItemsPanel/SpotCurationsPanel/MomPickPostsPanel과 동일한 원칙). */}
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
                <li key={group.groupKey} className="flex items-center gap-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleOpenGroup(group)}
                    className="flex-1 text-left text-sm text-gray-800 hover:underline"
                  >
                    {formatDedupGroupLabel(group)}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIgnoreGroup(group)}
                    className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
                    title="중복이 아니라고 확인 — 다음 스캔부터 다시 보이지 않습니다."
                  >
                    🙈 중복 아님
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

      {/* [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시): 검수를 시작했거나
          (진행중) 중복이 아니라고 확인한(무시) 그룹을 세션이 끊겨도 잃어버리지 않도록
          여기서 보여준다. */}
      <section className="rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">📌 진행 중 저장된 그룹</h2>
          {hasLoadedPendingGroups && (
            <button
              type="button"
              onClick={loadPendingGroups}
              disabled={isLoadingPendingGroups}
              className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
            >
              {isLoadingPendingGroups ? '불러오는 중...' : '새로고침'}
            </button>
          )}
        </div>
        {pendingGroupsError && <p className="text-xs text-red-600 mb-2">{pendingGroupsError}</p>}
        {!hasLoadedPendingGroups ? (
          <button type="button" onClick={loadPendingGroups} className="text-xs font-medium text-blue-600 hover:underline">
            📥 불러오기
          </button>
        ) : pendingGroups.length === 0 && !isLoadingPendingGroups ? (
          <p className="text-xs text-gray-400">진행 중이거나 무시 처리한 그룹이 없습니다.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-100">
            {pendingGroups.map((pending) => (
              <li key={pending.group_key} className="flex items-center gap-2 py-2.5">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    pending.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {pending.status === 'in_progress' ? '진행중' : '무시됨'}
                </span>
                <span className="flex-1 text-sm text-gray-800">
                  {pending.members[0]?.name ?? '(삭제된 스팟)'} 외 {pending.members.length - 1}건
                </span>
                {pending.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => resumePendingGroup(pending)}
                    className="shrink-0 rounded-full border border-gray-300 px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                  >
                    이어서 검수
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemovePendingGroup(pending.group_key)}
                  className="shrink-0 rounded-full border border-gray-200 px-2.5 py-1 text-[11px] text-gray-400 hover:bg-gray-50"
                  title={pending.status === 'ignored' ? '무시 취소 — 다음 스캔에 다시 나타납니다.' : '임시 저장 삭제'}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
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
