'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropDismiss } from '@/lib/admin/use-backdrop-dismiss';
import { AdminOpenSpaceRow } from '@/components/admin/data-grid-client';
import { CATEGORY_MAJ_OPTIONS } from '@/lib/spaces/category-maj-meta';
import { getTargetAudienceLabel } from '@/lib/spaces/target-audience-meta';

// [todo.md 개선사항 5](2026-09-03): 스팟픽(open_spaces) → 이벤트픽(events) 마이그레이션 폼.
// 이벤트픽 홈 피드는 target_audience가 이 4종일 때만, start_date~end_date 범위에 오늘이
// 포함될 때만 카드로 노출한다(get-home-feed.ts getCategoryMinFeed) — 요구사항이 명시한
// "이관 즉시 이벤트픽 화면에 노출"을 만족하려면 이 4종 중 하나와 오늘을 포함하는 기간을
// 관리자가 직접 선택해야 한다. 시작/종료일은 기본값(오늘~+90일)만 미리 채워두고 실제 값은
// 관리자가 제출 버튼을 눌러야 반영되므로, 코드가 임의로 날짜를 지어내는 것이 아니다.
const EVENT_PICK_TARGET_AUDIENCES = ['INFANT', 'KIDS_PRE', 'KIDS_SCHOOL', 'FAMILY'] as const;

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNowDateStr(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// [location-onboarding-modal.tsx와 동일 관례](2026-09-03 개선사항 2에서 확립): 이 모달은
// RawDataModal(자신도 onClick={onClose} 배경 클릭 핸들러를 가진 모달) 안에서 열린다 —
// 일반 자식으로 렌더링하면 이 모달 배경 클릭이 RawDataModal의 onClose까지 그대로 버블링돼
// 두 모달이 동시에 닫혀버린다. createPortal로 document.body 바로 아래에 렌더링해 부모 모달의
// 클릭 핸들러를 타지 않게 한다.
function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function MigrateToEventModal({
  row,
  onClose,
  onMigrated,
}: {
  row: AdminOpenSpaceRow;
  onClose: () => void;
  onMigrated: (id: string) => void;
}) {
  const mounted = useIsMounted();
  // [드래그 시 팝업 닫힘 버그 수정](2026-09-05 사용자 지시) 참고: use-backdrop-dismiss.ts
  const backdropDismiss = useBackdropDismiss(onClose);
  const [categoryMaj, setCategoryMaj] = useState(CATEGORY_MAJ_OPTIONS[0].maj);
  const currentMajOption = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === categoryMaj) ?? CATEGORY_MAJ_OPTIONS[0];
  const [categoryMin, setCategoryMin] = useState(currentMajOption.minorCategories[0]);
  const [targetAudience, setTargetAudience] = useState<(typeof EVENT_PICK_TARGET_AUDIENCES)[number]>('FAMILY');
  const [startDate, setStartDate] = useState(todayDateStr());
  const [endDate, setEndDate] = useState(daysFromNowDateStr(90));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleMajorChange = (nextMaj: string) => {
    setCategoryMaj(nextMaj);
    const nextOption = CATEGORY_MAJ_OPTIONS.find((opt) => opt.maj === nextMaj);
    setCategoryMin(nextOption?.minorCategories[0] ?? '');
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/data-grid/migrate-to-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          category_maj: categoryMaj,
          category_min: categoryMin,
          target_audience: targetAudience,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '이벤트픽 이관 실패');
      if (json.warning) window.alert(json.warning);
      onMigrated(row.id);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '이벤트픽 이관 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center" {...backdropDismiss}>
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-xl p-5 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">이벤트픽으로 이동</h2>
            <p className="text-xs text-gray-400 mt-0.5">{row.name}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
            ✕
          </button>
        </div>

        <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2">
          이관되면 events 테이블에 새 행이 만들어지고, 원본 open_spaces 데이터는 삭제됩니다(중복
          노출 방지). 이 스팟에 사용자 예약이 남아있으면 이관이 거부됩니다.
        </p>

        <div className="mt-3 flex flex-col gap-2.5">
          <label className="flex flex-col gap-1 text-xs text-gray-600">
            대분류
            <select
              value={categoryMaj}
              onChange={(e) => handleMajorChange(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {CATEGORY_MAJ_OPTIONS.map((opt) => (
                <option key={opt.maj} value={opt.maj}>
                  {opt.emoji} {opt.maj}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-gray-600">
            중분류
            <select
              value={categoryMin}
              onChange={(e) => setCategoryMin(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {currentMajOption.minorCategories.map((min) => (
                <option key={min} value={min}>
                  {min}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-gray-600">
            타겟 연령(이 4종만 이벤트픽 화면에 노출됩니다)
            <select
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value as (typeof EVENT_PICK_TARGET_AUDIENCES)[number])}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            >
              {EVENT_PICK_TARGET_AUDIENCES.map((tag) => (
                <option key={tag} value={tag}>
                  {getTargetAudienceLabel(tag)} ({tag})
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">
              시작일
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-gray-600">
              종료일
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        </div>

        {errorMessage && <p className="mt-2.5 text-xs text-red-500">{errorMessage}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100">
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3.5 py-1.5 disabled:opacity-40 hover:bg-purple-700"
          >
            {isSubmitting ? '이관 중...' : '이벤트픽으로 이동'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
