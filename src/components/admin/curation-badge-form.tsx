'use client';

import { ServiceCategory } from '@/lib/admin/service-category';
import { CURATION_BADGE_GROUPS, CURATION_BADGE_OPTIONS } from '@/lib/admin/curation-badges';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시)를 만들면서
// BlogCurationModal의 "노출 중분류 선택 + 뱃지 다중 선택" 폼을 이 프레젠테이션
// 컴포넌트로 뽑아냈다 — 워크벤치와 모달이 완전히 동일한 폼을 그대로 재사용한다
// (제5장 제4조 기존 구조 우선).
export function CurationBadgeForm({
  serviceCategoryId,
  onServiceCategoryChange,
  serviceCategories,
  selectedBadges,
  onToggleBadge,
  curationNote,
  onCurationNoteChange,
}: {
  serviceCategoryId: string;
  onServiceCategoryChange: (value: string) => void;
  serviceCategories: ServiceCategory[];
  selectedBadges: Set<string>;
  onToggleBadge: (key: string) => void;
  // [큐레이션 메모 입력란](2026-09-06 사용자 지시): "내가 입력란에 좀.. 붙여넣을
  // 수 있게.. 입력가능한 란도 하나 만들어줘" — 태그/키워드/자유 메모 등 무엇이든
  // 붙여넣을 수 있는 자유 입력란. 기존 SpotCurationsPanel의 "큐레이션 메모(선택)"
  // (spot_curations.curation_note)를 그대로 재사용한다(제5장 제4조).
  curationNote?: string;
  onCurationNoteChange?: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-gray-700">노출 중분류</span>
        <select
          value={serviceCategoryId}
          onChange={(e) => onServiceCategoryChange(e.target.value)}
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
        {CURATION_BADGE_GROUPS.map((group) => (
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
                    <input type="checkbox" checked={checked} onChange={() => onToggleBadge(opt.key)} className="sr-only" />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {onCurationNoteChange && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">큐레이션 메모(선택)</span>
          <textarea
            value={curationNote ?? ''}
            onChange={(e) => onCurationNoteChange(e.target.value)}
            placeholder="예: #호박터숯불촌 #호박터숯불촌신월성점 처럼 참고용 태그/메모를 자유롭게 붙여넣으세요"
            rows={3}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
}
