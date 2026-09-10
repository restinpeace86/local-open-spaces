'use client';

import { ServiceCategory } from '@/lib/admin/service-category';
import { CurationBadgeOption } from '@/lib/admin/curation-badges';

// [All-in-One 모바일 큐레이션 워크벤치](2026-09-05 사용자 지시)를 만들면서
// BlogCurationModal의 "노출 중분류 선택 + 뱃지 다중 선택" 폼을 이 프레젠테이션
// 컴포넌트로 뽑아냈다 — 워크벤치와 모달이 완전히 동일한 폼을 그대로 재사용한다
// (제5장 제4조 기존 구조 우선).
export function CurationBadgeForm({
  serviceCategoryId,
  onServiceCategoryChange,
  serviceCategories,
  // [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07 개선사항4): 뱃지
  // 그룹/옵션을 이 컴포넌트가 직접 import하지 않고 호출부(useSpotCurationForm이
  // 계산한 "현재 노출 중분류에 맞는" 값)로부터 받는다 — 콤보박스를 바꾸면
  // 호출부가 새 값을 내려줘 이 컴포넌트는 그대로 다시 그리기만 하면 된다.
  badgeGroups,
  badgeOptions,
  selectedBadges,
  // [뱃지 상태별 시각적 색상 구분](2026-09-08 사용자 지시, todo.md 개선사항2-1):
  // "AI가 1차 자동 체크했으나 아직 저장 안 된 상태는 초록, 이미 DB에 저장된
  // 상태는 파란색" — 이 Set에 들어있는 키만 "이미 저장됨"으로 판정한다.
  savedBadgeKeys,
  onToggleBadge,
  // [동적 연령 추천 시스템](2026-09-10 사용자 지시, todo.md 개선사항1): "만 x세 이상
  // 뱃지 / 기본값 0(미지정 시 뱃지 미노출) / 관리자가 후기를 검수하며 기준에 맞춰
  // 수동으로 숫자를 변경입력가능해야 함". onMinAgeChange가 없으면(기존 호출부
  // 호환) 이 입력란을 렌더링하지 않는다.
  minAgeRecommended,
  onMinAgeChange,
  ageSuggestion,
  curationNote,
  onCurationNoteChange,
}: {
  serviceCategoryId: string;
  onServiceCategoryChange: (value: string) => void;
  serviceCategories: ServiceCategory[];
  badgeGroups: string[];
  badgeOptions: CurationBadgeOption[];
  selectedBadges: Set<string>;
  savedBadgeKeys: Set<string>;
  onToggleBadge: (key: string) => void;
  minAgeRecommended?: number;
  onMinAgeChange?: (value: number) => void;
  ageSuggestion?: number | null;
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
        {badgeGroups.map((group) => (
          <div key={group} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-gray-400">{group}</span>
            <div className="flex flex-wrap gap-1.5">
              {badgeOptions.filter((opt) => opt.group === group).map((opt) => {
                const checked = selectedBadges.has(opt.key);
                // 미체크: 기존 그대로. 체크됨 + 이미 저장된 뱃지: 파란색. 체크됨 +
                // 아직 저장 안 된 뱃지(자동 체크 직후 또는 방금 수동 체크): 초록색.
                const isSaved = checked && savedBadgeKeys.has(opt.key);
                const isUnsaved = checked && !savedBadgeKeys.has(opt.key);
                const colorClass = isSaved
                  ? 'bg-blue-600 text-white border-blue-600'
                  : isUnsaved
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50';
                return (
                  <label
                    key={opt.key}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs cursor-pointer ${colorClass}`}
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

      {onMinAgeChange && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">추천 연령 하한 (만 나이)</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={19}
              value={minAgeRecommended ?? 0}
              onChange={(e) => onMinAgeChange(Number(e.target.value))}
              className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-gray-500">
              {(minAgeRecommended ?? 0) > 0 ? `만 ${minAgeRecommended}세 이상 추천으로 노출` : '0 = 미노출(연령 뱃지 안 뜸)'}
            </span>
          </div>
          {typeof ageSuggestion === 'number' && ageSuggestion > 0 && ageSuggestion !== (minAgeRecommended ?? 0) && (
            <button
              type="button"
              onClick={() => onMinAgeChange(ageSuggestion)}
              className="self-start rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100"
            >
              후기 분석 제안: 만 {ageSuggestion}세 이상 적용
            </button>
          )}
        </div>
      )}

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
