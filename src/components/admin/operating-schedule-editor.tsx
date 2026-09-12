'use client';

import { useState } from 'react';
import { buildNthWeekdayToken, NTH_WEEKDAY_OCCURRENCES, parseNthWeekdayToken, WeekdayCode } from '@/lib/spaces/event-operating-schedule';

// [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자 지시):
// "상세팝업에서 표준 중분류 선택 ➡️ 타겟 연령 선택 ➡️ 블로그 검증 ➡️ 스팟 연결 이런
// 식인데 여기에 일자는 기본적으로 원천데이터꺼로 하긴하는데 예외 규칙을 여기서
// 집어넣으면 해당 예외 규칙도 적용되도록.." — start_date~end_date(원본 기간)는 그대로
// 두고, 그 안에서 실제 운영 요일(operating_weekdays)/정기 휴무 요일(excluded_weekdays)을
// 지정한다. 두 개념은 서로 독립적으로 조합 가능하다("택 1 또는 조합" — 예: 매일 운영 +
// 월요일만 휴무). 저장된 규칙은 "오늘 진행중" 판단 시 isEventOperatingOn()으로 검사된다
// (src/lib/spaces/event-operating-schedule.ts, get-home-feed.ts의 이벤트픽 조회 전체 +
// /api/spots/linked-events에서 사용).
// [매월 N번째 요일 패턴 추가](2026-09-12 사용자 지시): "매주 토요일 / 매월 2번째
// 4번째 토요일 / 매주 주말 / 매주 월요일 휴무 / 매주 화,목 운영 이런식의 패턴이야
// 대부분" — "매월 특정 주차 요일" 프리셋을 추가한다. operating_weekdays(매주 반복)와
// operating_nth_weekdays(매월 N번째)는 상호 배타적 대안이라 프리셋 하나만 고른다
// (excluded_weekdays 정기 휴무는 어느 쪽과도 계속 별도로 조합 가능).
// [블로그 큐레이션 모달로 이동](2026-09-12 사용자 지시): "이거 관련 블로그 큐레이션
// 안으로 집어넣어줄수 있어? 보통 RAW_DATA는 기간으로만 나와있어서.. 블로그 보고
// 파악하는데" — 원천 데이터가 시작~종료일만 줄 뿐 실제 반복 패턴(정기 휴무·특정
// 요일만 운영 등)은 관리자가 블로그를 읽어야 알 수 있다는 지적. 이 컴포넌트를
// raw-data-modal.tsx의 독립 섹션에서 event-blog-curation-modal.tsx 안으로
// 옮기고, 두 파일이 공유하는 별도 컴포넌트 파일로 분리했다(제5장 제4조 — 같은
// 편집기를 두 파일에 각자 복붙하지 않음). AdminEventRow 전체가 아니라 이 편집기가
// 실제로 쓰는 필드만 요구하는 좁은 타입(OperatingScheduleRow)으로 둬서,
// EventBlogCurationModal처럼 event 객체가 더 가벼운 곳에서도 그대로 재사용할 수
// 있다.
export type OperatingScheduleRow = {
  id: string;
  start_date: string;
  end_date: string;
  operating_weekdays?: string[] | null;
  excluded_weekdays?: string[] | null;
  operating_nth_weekdays?: string[] | null;
};

export type OperatingScheduleUpdatedHandler = (
  id: string,
  nextOperatingWeekdays: string[] | null,
  nextExcludedWeekdays: string[] | null,
  nextOperatingNthWeekdays: string[] | null
) => void;

const WEEKDAY_LABELS: Record<string, string> = { SUN: '일', MON: '월', TUE: '화', WED: '수', THU: '목', FRI: '금', SAT: '토' };
const WEEKDAY_DISPLAY_ORDER: WeekdayCode[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type OperatingPreset = 'DAILY' | 'WEEKEND' | 'CUSTOM' | 'MONTHLY_NTH';

function sameDaySet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((d) => setB.has(d));
}

// 저장된 값에서 프리셋을 되짚어낸다(다시 열었을 때 이전에 고른 프리셋이 그대로 보이도록).
// operating_nth_weekdays가 있으면(예: ['2-SAT','4-SAT']) 요일/주차를 각각 분리해
// 되짚는다 — 서로 다른 요일에 서로 다른 주차를 조합한 경우(드묾)는 요일·주차 집합만
// 복원되고 정확한 짝은 저장하지 않는다(현재 실제 쓰이는 패턴은 "한 요일 + 여러 주차"
// 조합뿐이라 이 정도로 충분하다).
function detectOperatingPreset(
  operatingWeekdays: string[] | null | undefined,
  operatingNthWeekdays: string[] | null | undefined
): {
  preset: OperatingPreset;
  customDays: string[];
  monthlyWeekdays: string[];
  monthlyOccurrences: number[];
} {
  const nthTokens = operatingNthWeekdays ?? [];
  if (nthTokens.length > 0) {
    const parsed = nthTokens.map(parseNthWeekdayToken).filter((v): v is { nth: number; weekday: WeekdayCode } => v !== null);
    const monthlyWeekdays = Array.from(new Set(parsed.map((p) => p.weekday)));
    const monthlyOccurrences = Array.from(new Set(parsed.map((p) => p.nth))).sort();
    return { preset: 'MONTHLY_NTH', customDays: [], monthlyWeekdays, monthlyOccurrences };
  }
  const days = operatingWeekdays ?? [];
  if (days.length === 0) return { preset: 'DAILY', customDays: [], monthlyWeekdays: [], monthlyOccurrences: [] };
  if (sameDaySet(days, ['SAT', 'SUN'])) return { preset: 'WEEKEND', customDays: [], monthlyWeekdays: [], monthlyOccurrences: [] };
  return { preset: 'CUSTOM', customDays: days, monthlyWeekdays: [], monthlyOccurrences: [] };
}

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

// [매월 N번째 요일 패턴] "N주차" 선택 그리드(1~5주차). WeekdayCheckboxGrid와 톤을
// 맞추되 숫자 라벨을 쓴다.
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

export function OperatingScheduleEditor({
  row,
  onUpdated,
}: {
  row: OperatingScheduleRow;
  onUpdated: OperatingScheduleUpdatedHandler;
}) {
  const initial = detectOperatingPreset(row.operating_weekdays, row.operating_nth_weekdays);
  const [preset, setPreset] = useState<OperatingPreset>(initial.preset);
  const [customDays, setCustomDays] = useState<string[]>(initial.customDays);
  const [monthlyWeekdays, setMonthlyWeekdays] = useState<string[]>(initial.monthlyWeekdays);
  const [monthlyOccurrences, setMonthlyOccurrences] = useState<number[]>(initial.monthlyOccurrences);
  const [excludeEnabled, setExcludeEnabled] = useState((row.excluded_weekdays ?? []).length > 0);
  const [excludedDays, setExcludedDays] = useState<string[]>(row.excluded_weekdays ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggleCustomDay(code: string) {
    setCustomDays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  function toggleMonthlyWeekday(code: string) {
    setMonthlyWeekdays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  function toggleMonthlyOccurrence(nth: number) {
    setMonthlyOccurrences((prev) => (prev.includes(nth) ? prev.filter((n) => n !== nth) : [...prev, nth]));
  }

  function toggleExcludedDay(code: string) {
    setExcludedDays((prev) => (prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]));
  }

  const handleSave = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const operatingWeekdays =
        preset === 'DAILY' || preset === 'MONTHLY_NTH'
          ? null
          : preset === 'WEEKEND'
            ? ['SAT', 'SUN']
            : customDays.length > 0
              ? customDays
              : null;
      // [매월 N번째 요일] 선택된 요일 × 선택된 주차의 조합("2-SAT" 형식 토큰)을 만든다.
      const operatingNthWeekdays =
        preset === 'MONTHLY_NTH' && monthlyWeekdays.length > 0 && monthlyOccurrences.length > 0
          ? monthlyWeekdays.flatMap((weekday) =>
              monthlyOccurrences.map((nth) => buildNthWeekdayToken(nth as 1 | 2 | 3 | 4 | 5, weekday as WeekdayCode))
            )
          : null;
      const excludedWeekdaysToSave = excludeEnabled && excludedDays.length > 0 ? excludedDays : null;

      const res = await fetch('/api/admin/events/operating-schedule', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          operating_weekdays: operatingWeekdays,
          excluded_weekdays: excludedWeekdaysToSave,
          operating_nth_weekdays: operatingNthWeekdays,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '운영 요일/반복 규칙 저장 실패');
      onUpdated(row.id, json.row.operating_weekdays, json.row.excluded_weekdays, json.row.operating_nth_weekdays);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '운영 요일/반복 규칙 저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        운영 요일 / 반복 규칙
        <span className="ml-1.5 text-[10px] font-normal text-gray-400">
          (기간: {row.start_date} ~ {row.end_date} 내 예외 규칙 — 기본값: 매일 운영)
        </span>
      </h3>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['DAILY', '매일 운영'],
            ['WEEKEND', '주말만 운영(토·일)'],
            ['CUSTOM', '특정 요일 지정'],
            ['MONTHLY_NTH', '매월 특정 주차 요일'],
          ] as [OperatingPreset, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPreset(value)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              preset === value ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === 'CUSTOM' && <WeekdayCheckboxGrid selected={customDays} onToggle={toggleCustomDay} />}

      {preset === 'MONTHLY_NTH' && (
        <div className="mt-1.5 rounded-lg bg-gray-50 p-2">
          <p className="text-[11px] text-gray-500 mb-1">요일 선택(예: 토요일)</p>
          <WeekdayCheckboxGrid selected={monthlyWeekdays} onToggle={toggleMonthlyWeekday} />
          <p className="text-[11px] text-gray-500 mt-2.5 mb-1">주차 선택(예: 2주차·4주차)</p>
          <OccurrenceCheckboxGrid selected={monthlyOccurrences} onToggle={toggleMonthlyOccurrence} />
        </div>
      )}

      <label className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer">
        <input type="checkbox" checked={excludeEnabled} onChange={(e) => setExcludeEnabled(e.target.checked)} />
        정기 휴무일 지정(예: 매주 월요일 휴무)
      </label>
      {excludeEnabled && <WeekdayCheckboxGrid selected={excludedDays} onToggle={toggleExcludedDay} />}

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
