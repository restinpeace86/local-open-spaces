'use client';

import { useEffect, useMemo, useState } from 'react';
import { getEventsForMonth } from '@/lib/spaces/get-events-for-month';
import { buildCalendarGrid } from '@/lib/spaces/calendar-grid';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getEventStatus } from '@/lib/spaces/event-status';
import { DetailModal } from '@/components/map/detail-modal';
import { NearbyItem } from '@/lib/spaces/get-nearby';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_CHIPS_PER_DAY = 2;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// spec 문서 미비 영역 — project/overview.md의 "월별 캘린더(Calendar View)" 요구를 기준으로 구현.
// 날짜별 행사 칩 + 접수/진행 상태 뱃지 + 클릭 시 상세 모달 연동
export function CalendarView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [events, setEvents] = useState<NearbyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setErrorMessage(null);

    getEventsForMonth(year, month)
      .then((result) => {
        if (!cancelled) setEvents(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const grid = useMemo(() => buildCalendarGrid(year, month, events), [year, month, events]);

  const goToPrevMonth = () => {
    setSelectedDateKey(null);
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const goToNextMonth = () => {
    setSelectedDateKey(null);
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const selectedDayItems = selectedDateKey
    ? (grid.find((day) => day.dateKey === selectedDateKey)?.items ?? [])
    : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button type="button" onClick={goToPrevMonth} className="px-2 py-1 text-gray-500 hover:text-gray-900">
          ◀
        </button>
        <h2 className="text-sm font-semibold text-gray-900">
          {year}년 {month}월
        </h2>
        <button type="button" onClick={goToNextMonth} className="px-2 py-1 text-gray-500 hover:text-gray-900">
          ▶
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-gray-400">불러오는 중...</p>}
        {errorMessage && <p className="p-4 text-sm text-red-500">{errorMessage}</p>}

        {!isLoading && !errorMessage && (
          <>
            <div className="grid grid-cols-7 text-center text-xs text-gray-400 py-2 border-b border-gray-100">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
              {grid.map((day) => {
                const isToday = day.dateKey === todayKey();
                const isSelected = day.dateKey === selectedDateKey;
                const visibleChips = day.items.slice(0, MAX_CHIPS_PER_DAY);
                const overflowCount = day.items.length - visibleChips.length;

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(day.dateKey)}
                    className={`min-h-[88px] border-b border-r border-gray-100 p-1.5 text-left align-top flex flex-col gap-1 ${
                      day.inCurrentMonth ? 'bg-white' : 'bg-gray-50'
                    } ${isSelected ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                  >
                    <span
                      className={`text-xs ${
                        day.inCurrentMonth ? 'text-gray-700' : 'text-gray-300'
                      } ${isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white' : ''}`}
                    >
                      {day.date.getDate()}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {visibleChips.map((item) => {
                        const meta = getCategoryMeta(item.category);
                        return (
                          <span
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem(item);
                            }}
                            className="truncate text-[10px] rounded px-1 py-0.5 text-white"
                            style={{ backgroundColor: meta.color }}
                          >
                            {item.name}
                          </span>
                        );
                      })}
                      {overflowCount > 0 && (
                        <span className="text-[10px] text-gray-400">+{overflowCount}건 더보기</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedDateKey && (
              <div className="border-t border-gray-200">
                <div className="px-4 py-2 text-sm font-medium text-gray-700 flex items-center justify-between">
                  <span>{selectedDateKey} 행사 {selectedDayItems.length}건</span>
                  <button
                    type="button"
                    onClick={() => setSelectedDateKey(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    닫기
                  </button>
                </div>
                <ul className="divide-y divide-gray-100">
                  {selectedDayItems.map((item) => {
                    const meta = getCategoryMeta(item.category);
                    const status = getEventStatus(item);
                    const statusColor =
                      status.tone === 'urgent'
                        ? 'text-red-600'
                        : status.tone === 'closed'
                          ? 'text-gray-400'
                          : status.tone === 'upcoming'
                            ? 'text-blue-600'
                            : 'text-emerald-600';

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: meta.color }}
                            aria-hidden
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-gray-900 truncate">
                              {item.name}
                            </span>
                            <span className="block text-xs text-gray-500">{meta.label}</span>
                          </span>
                          <span className={`shrink-0 text-xs font-semibold ${statusColor}`}>
                            {status.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </div>
  );
}
