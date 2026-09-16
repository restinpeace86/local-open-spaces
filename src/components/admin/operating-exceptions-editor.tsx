'use client';

import { useEffect, useState } from 'react';

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]): "관리자가 연간 예외 공휴일 등을 수동으로 관리할 수 있는 최소한의
// 테이블 구조(또는 예외 처리 방식) 제안" — operating-schedule-editor.tsx(정기 요일
// 규칙)와 별도로, "이 이벤트는 이 특정 날짜만 예외로 쉰다"를 관리하는 편집기.
// public_holidays(연도별 참고 목록)에서 골라 담거나, 이벤트 전용 임시휴무처럼
// 목록에 없는 날짜도 직접 입력할 수 있다.
type ExceptionItem = { id: string; exception_date: string; note: string | null };
type HolidayItem = { holiday_date: string; name: string };

export function OperatingExceptionsEditor({ eventId, startDate, endDate }: { eventId: string; startDate: string; endDate: string }) {
  const [exceptions, setExceptions] = useState<ExceptionItem[] | null>(null);
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newNote, setNewNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // [공휴일 참고 목록에 직접 추가](2026-09-16): 자동 수집 API(SpcdeInfoService)는
  // 이 프로젝트의 PUBLIC_DATA_API_KEY가 아직 등록되지 않아(구현 기록 참고,
  // src/app/api/admin/public-holidays/route.ts 주석) 이번 범위에서 만들지 않았다 —
  // 그 대신 관리자가 공휴일 이름/날짜를 한 번 등록해 두면 이 이벤트뿐 아니라 다른
  // 이벤트에서도 재사용할 수 있게 하는 최소한의 입력창이다.
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');

  async function addHolidayToReferenceList() {
    if (isSaving || !holidayDate || !holidayName.trim()) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/public-holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holiday_date: holidayDate, name: holidayName.trim() }),
      });
      const data: { item?: HolidayItem; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '공휴일 등록에 실패했습니다.');
      setHolidays((prev) => [...prev.filter((h) => h.holiday_date !== data.item!.holiday_date), data.item!]);
      setHolidayDate('');
      setHolidayName('');
      setIsAddingHoliday(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '공휴일 등록에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    fetch(`/api/admin/events/operating-exceptions?event_id=${encodeURIComponent(eventId)}`)
      .then((res) => res.json())
      .then((data: { items?: ExceptionItem[] }) => setExceptions(data.items ?? []))
      .catch(() => setExceptions([]));

    // 이벤트 기간이 걸쳐 있는 연도들의 공휴일 참고 목록을 함께 불러와 빠른 추가에 쓴다.
    const startYear = Number(startDate.slice(0, 4));
    const endYear = Number(endDate.slice(0, 4));
    const years = Array.from({ length: Math.max(1, endYear - startYear + 1) }, (_, i) => startYear + i);
    Promise.all(years.map((y) => fetch(`/api/admin/public-holidays?year=${y}`).then((res) => res.json())))
      .then((results: Array<{ items?: HolidayItem[] }>) => setHolidays(results.flatMap((r) => r.items ?? [])))
      .catch(() => setHolidays([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function addException(date: string, note: string | null) {
    if (isSaving || !date) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/events/operating-exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, exception_date: date, note }),
      });
      const data: { item?: ExceptionItem; error?: string } = await res.json();
      if (!res.ok || !data.item) throw new Error(data.error ?? '예외일 추가에 실패했습니다.');
      setExceptions((prev) => [...(prev ?? []).filter((e) => e.exception_date !== date), data.item!].sort((a, b) => a.exception_date.localeCompare(b.exception_date)));
      setNewDate('');
      setNewNote('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '예외일 추가에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  async function removeException(id: string) {
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/admin/events/operating-exceptions?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? '예외일 삭제에 실패했습니다.');
      setExceptions((prev) => (prev ?? []).filter((e) => e.id !== id));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '예외일 삭제에 실패했습니다.');
    }
  }

  const appliedDates = new Set((exceptions ?? []).map((e) => e.exception_date));
  const relevantHolidays = holidays.filter((h) => h.holiday_date >= startDate && h.holiday_date <= endDate);

  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3">
      <h3 className="text-xs font-semibold text-gray-500 mb-2">
        예외 휴무일(수동 지정)
        <span className="ml-1.5 text-[10px] font-normal text-gray-400">정기 요일 규칙과 무관하게 특정 날짜만 쉴 때</span>
      </h3>

      {relevantHolidays.length > 0 && (
        <div className="mb-2">
          <p className="text-[11px] text-gray-500 mb-1">이 기간의 공휴일(눌러서 바로 추가)</p>
          <div className="flex flex-wrap gap-1.5">
            {relevantHolidays.map((h) => (
              <button
                key={h.holiday_date}
                type="button"
                disabled={appliedDates.has(h.holiday_date) || isSaving}
                onClick={() => addException(h.holiday_date, h.name)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  appliedDates.has(h.holiday_date) ? 'bg-gray-100 text-gray-400' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                {h.holiday_date} {h.name}
                {appliedDates.has(h.holiday_date) ? ' ✓' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-2">
        {!isAddingHoliday ? (
          <button type="button" onClick={() => setIsAddingHoliday(true)} className="text-[11px] font-semibold text-blue-600 hover:underline">
            + 공휴일 참고 목록에 새로 등록
          </button>
        ) : (
          <div className="flex gap-1.5 items-center rounded-lg bg-gray-50 p-2">
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            />
            <input
              type="text"
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
              placeholder="공휴일 이름(예: 설날)"
              className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              disabled={isSaving || !holidayDate || !holidayName.trim()}
              onClick={addHolidayToReferenceList}
              className="rounded-lg bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 disabled:opacity-40"
            >
              등록
            </button>
            <button type="button" onClick={() => setIsAddingHoliday(false)} className="text-xs text-gray-400 hover:text-gray-600">
              취소
            </button>
          </div>
        )}
      </div>

      {exceptions === null ? (
        <p className="text-xs text-gray-400">불러오는 중...</p>
      ) : exceptions.length === 0 ? (
        <p className="text-xs text-gray-400">지정된 예외 휴무일이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-1 mb-2">
          {exceptions.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-1.5">
              <span className="text-gray-700">
                {e.exception_date}
                {e.note ? ` — ${e.note}` : ''}
              </span>
              <button type="button" onClick={() => removeException(e.id)} className="text-gray-400 hover:text-red-500">
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5">
        <input
          type="date"
          value={newDate}
          min={startDate}
          max={endDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        />
        <input
          type="text"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="사유(선택, 예: 임시휴무)"
          className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={isSaving || !newDate}
          onClick={() => addException(newDate, newNote.trim() || null)}
          className="rounded-lg bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 disabled:opacity-40"
        >
          추가
        </button>
      </div>
      {errorMessage && <p className="mt-1.5 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}
