'use client';

import { useState } from 'react';
import { buildNthWeekdayToken, NTH_WEEKDAY_OCCURRENCES, parseNthWeekdayToken, WeekdayCode } from '@/lib/spaces/event-operating-schedule';

// [open_spaces 정기휴무 설정](2026-09-27 사용자 지시): "이거 이벤트쪽에 있나
// 휴관일이나 정기휴무 설정하는거... 이거 open_spaces쪽에도 놓고.. 정기휴무
// 설정할수있게해야하는거 아니야?" — events의 OperatingScheduleEditor에서 사용자가
// 확정한 범위(정기휴무 요일 + 매월 N번째 요일 휴무)만 가져온다. open_spaces는
// 상설 장소라 events의 "요일 반복 운영"/"특정 날짜"(이벤트성 기간 내 예외)는
// 상대적으로 덜 쓰여 제외했다(사용자 확인). 두 규칙은 서로 배타적이지 않고
// 독립적으로 조합 가능하다(예: 매주 월요일 휴무 + 매월 셋째 화요일도 추가 휴무).
export type OpenSpaceExcludedDaysRow = {
  id: string;
  excluded_weekdays?: string[] | null;
  excluded_nth_weekdays?: string[] | null;
};

export type OpenSpaceExcludedDaysUpdatedHandler = (
  id: string,
  nextExcludedWeekdays: string[] | null,
  nextExcludedNthWeekdays: string[] | null
) => void;

const WEEKDAY_LABELS: Record<string, string> = { SUN: '일', MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토' };
const WEEKDAY_DISPLAY_ORDER: WeekdayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function WeekdayCheckboxGrid({ selected, onToggle }: { selected: string[]; onToggle: (code: string) => void }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      {WEEKDAY_DISPLAY_ORDER.map((code) => (
        <label
          key={code}
          className={`flex-1 text-center rounded-lg border px-1.5 py-1 text-xs cursor-pointer select-none ${
            selected.includes(code) ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold' : 'border-gray-200 text-gray-500'
          }`}
        >
          <input type="checkbox" checked={selected.includes(code)} onChange={() => onToggle(code)} className="hidden" />
          {WEEKDAY_LABELS[code]}
        </label>
      ))}
    </div>
  );
}

function OccurrenceCheckboxGrid({ selected, onToggle }: { selected: number[]; onToggle: (nth: number) => void }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      {NTH_WEEKDAY_OCCURRENCES.map((nth) => (
        <label
          key={nth}
          className={`flex-1 text-center rounded-lg border px-1.5 py-1 text-xs cursor-pointer select-none ${
            selected.includes(nth) ? 'border-purple-500 bg-purple-50 text-purple-700 font-semibold' : 'border-gray-200 text-gray-500'
          }`}
        >
          <input type="checkbox" checked={selected.includes(nth)} onChange={() => onToggle(nth)} className="hidden" />
          {nth}주차
        </label>
      ))}
    </div>
  );
}

function detectMonthlyPreset(excludedNthWeekdays: string[] | null | undefined): {
  monthlyWeekdays: string[];
  monthlyOccurrences: number[];
} {
  const tokens = excludedNthWeekdays ?? [];
  const parsed = tokens.map(parseNthWeekdayToken).filter((v): v is { nth: number; weekday: WeekdayCode } => v !== null);
  return {
    monthlyWeekdays: Array.from(new Set(parsed.map((p) => p.weekday))),
    monthlyOccurrences: Array.from(new Set(parsed.map((p) => p.nth))).sort(),
  };
}

export function OpenSpaceExcludedDaysEditor({
  row,
  onUpdated,
}: {
  row: OpenSpaceExcludedDaysRow;
  onUpdated: OpenSpaceExcludedDaysUpdatedHandler;
}) {
  const monthlyInitial = detectMonthlyPreset(row.excluded_nth_weekdays);
  const [weeklyEnabled, setWeeklyEnabled] = useState((row.excluded_weekdays ?? []).length > 0);
  const [weeklyDays, setWeeklyDays] = useState<string[]>(row.excluded_weekdays ?? []);
  const [monthlyEnabled, setMonthlyEnabled] = useState((row.excluded_nth_weekdays ?? []).length > 0);
  const [monthlyWeekdays, setMonthlyWeekdays] = useState<string[]>(monthlyInitial.monthlyWeekdays);
  const [monthlyOccurrences, setMonthlyOccurrences] = useState<number[]>(monthlyInitial.monthlyOccurrences);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleWeeklyDay(code: string) {
    setWeeklyDays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  function toggleMonthlyWeekday(code: string) {
    setMonthlyWeekdays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  function toggleMonthlyOccurrence(nth: number) {
    setMonthlyOccurrences((prev) => (prev.includes(nth) ? prev.filter((n) => n !== nth) : [...prev, nth]));
  }

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const excludedWeekdays = weeklyEnabled && weeklyDays.length > 0 ? weeklyDays : null;
      const excludedNthWeekdays =
        monthlyEnabled && monthlyWeekdays.length > 0 && monthlyOccurrences.length > 0
          ? monthlyWeekdays.flatMap((weekday) =>
              monthlyOccurrences.map((nth) => buildNthWeekdayToken(nth as 1 | 2 | 3 | 4 | 5, weekday as WeekdayCode))
            )
          : null;

      const res = await fetch('/api/admin/open-spaces/operating-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, excluded_weekdays: excludedWeekdays, excluded_nth_weekdays: excludedNthWeekdays }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '정기휴무 설정 저장 실패');
      onUpdated(row.id, json.row.excluded_weekdays, json.row.excluded_nth_weekdays);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '정기휴무 설정 저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">정기휴무 설정</h3>

      <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer">
        <input type="checkbox" checked={weeklyEnabled} onChange={(e) => setWeeklyEnabled(e.target.checked)} />
        매주 정기휴무 요일(예: 매주 월요일 휴무)
      </label>
      {weeklyEnabled && <WeekdayCheckboxGrid selected={weeklyDays} onToggle={toggleWeeklyDay} />}

      <label className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer">
        <input type="checkbox" checked={monthlyEnabled} onChange={(e) => setMonthlyEnabled(e.target.checked)} />
        매월 특정 주차 요일 휴무(예: 매월 첫째·셋째 월요일 휴관)
      </label>
      {monthlyEnabled && (
        <div className="mt-1.5 rounded-lg bg-gray-50 p-2">
          <p className="text-[11px] text-gray-500 mb-1">요일 선택(예: 월요일)</p>
          <WeekdayCheckboxGrid selected={monthlyWeekdays} onToggle={toggleMonthlyWeekday} />
          <p className="text-[11px] text-gray-500 mt-2.5 mb-1">주차 선택(예: 1주차·3주차)</p>
          <OccurrenceCheckboxGrid selected={monthlyOccurrences} onToggle={toggleMonthlyOccurrence} />
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full bg-purple-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40 hover:bg-purple-700"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}
