'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildMonthDateGrid, toDateKey } from '@/lib/spaces/month-grid';

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]): "유저가 상세 페이지에서 기간만 글자로 보는 것이 아니라.. 달력
// UI를 통해 직관적으로 확인.. 실제 오픈하는 날짜들만 포인트 색상으로 하이라이트..
// 휴무일이나 기간 외 날짜는 비활성화(Grey out)" — /api/events/operating-calendar가
// 이미 계산해 준 openDates만 받아 그리기만 한다(요일/예외 판정 로직은 서버 한
// 곳에만 존재, 제5장 제4조).
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

type CalendarData = { startDate: string; endDate: string; openDates: string[] };

export function EventOperatingCalendarSheet({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const [data, setData] = useState<CalendarData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ year: number; month: number } | null>(null);

  useEffect(() => {
    fetch(`/api/events/operating-calendar?event_id=${encodeURIComponent(eventId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? '운영일 조회에 실패했습니다.');
        setData(json);
        const start = new Date(json.startDate);
        const today = new Date();
        const initial = today >= start ? today : start;
        setCursor({ year: initial.getFullYear(), month: initial.getMonth() + 1 });
      })
      .catch((err) => setErrorMessage(err instanceof Error ? err.message : '운영일 조회에 실패했습니다.'));
  }, [eventId]);

  const openDateSet = useMemo(() => new Set(data?.openDates ?? []), [data]);
  const grid = useMemo(() => (cursor ? buildMonthDateGrid(cursor.year, cursor.month) : []), [cursor]);

  function goToPrevMonth() {
    setCursor((prev) => (prev ? (prev.month === 1 ? { year: prev.year - 1, month: 12 } : { year: prev.year, month: prev.month - 1 }) : prev));
  }
  function goToNextMonth() {
    setCursor((prev) => (prev ? (prev.month === 12 ? { year: prev.year + 1, month: 1 } : { year: prev.year, month: prev.month + 1 }) : prev));
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[380px] max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">실제 운영일 캘린더</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}
        {!errorMessage && !data && <p className="text-xs text-gray-400">불러오는 중...</p>}

        {data && cursor && (
          <>
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={goToPrevMonth} className="px-2 py-1 text-gray-500 hover:text-gray-900">
                ◀
              </button>
              <span className="text-sm font-semibold text-gray-900">
                {cursor.year}년 {cursor.month}월
              </span>
              <button type="button" onClick={goToNextMonth} className="px-2 py-1 text-gray-500 hover:text-gray-900">
                ▶
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] text-gray-400 pb-1">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((day) => {
                const isOpen = openDateSet.has(day.dateKey);
                const isToday = day.dateKey === toDateKey(new Date());
                return (
                  <div
                    key={day.dateKey}
                    className={`aspect-square flex items-center justify-center rounded-full text-xs ${
                      !day.inCurrentMonth
                        ? 'text-gray-200'
                        : isOpen
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'text-gray-300'
                    } ${isToday && !isOpen ? 'ring-1 ring-gray-300' : ''}`}
                  >
                    {day.date.getDate()}
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
              실제 운영일(강조 표시된 날짜만 방문 가능)
            </div>
            <p className="mt-1 text-[11px] text-gray-400">전체 기간: {data.startDate} ~ {data.endDate}</p>
          </>
        )}
      </div>
    </div>
  );
}
