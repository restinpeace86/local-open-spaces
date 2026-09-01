'use client';

import { useEffect, useMemo, useState } from 'react';
import { getEventsForMonth } from '@/lib/spaces/get-events-for-month';
import { buildCalendarGrid } from '@/lib/spaces/calendar-grid';
import { splitByDuration } from '@/lib/spaces/event-duration';
import { getCategoryMeta } from '@/lib/spaces/category-meta';
import { getEventStatus } from '@/lib/spaces/event-status';
import { DetailModal } from '@/components/map/detail-modal';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { AiChatFab } from '@/components/chat/ai-chat-fab';
import { useUserLocation } from '@/hooks/use-user-location';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_CHIPS_PER_DAY = 3;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusColorClass(tone: ReturnType<typeof getEventStatus>['tone']): string {
  if (tone === 'urgent') return 'text-red-600';
  if (tone === 'closed') return 'text-gray-400';
  if (tone === 'upcoming') return 'text-blue-600';
  return 'text-emerald-600';
}

function EventStatusListItem({ item, onSelect }: { item: NearbyItem; onSelect: (item: NearbyItem) => void }) {
  const meta = getCategoryMeta(item.category);
  const status = getEventStatus(item);

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
      >
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} aria-hidden />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-gray-900 truncate">{item.name}</span>
          <span className="block text-xs text-gray-500">{meta.label}</span>
        </span>
        <span className={`shrink-0 text-xs font-semibold ${statusColorClass(status.tone)}`}>{status.label}</span>
      </button>
    </li>
  );
}

// spec 문서 미비 영역 — project/overview.md의 "월별 캘린더(Calendar View)" 요구 + 사용자 확정 규칙 기준 구현.
// 30일 이상 상시 예약/운영 항목은 일별 타일에서 제외하고 별도 접이식 영역으로 분리해 과밀을 방지한다.
export function CalendarView() {
  // [스팟픽 AI 맞춤 추천 챗봇 엔진](2026-09-01 사용자 지시): 이 화면(이벤트픽)에는 기존에
  // 위치 온보딩 흐름이 없었다 — 챗봇의 거리 계산에 필요한 좌표만 조용히 가져다 쓰고
  // (미설정 시 훅 기본값인 서울시청으로 자동 폴백), 이 화면에 새로운 온보딩 모달을
  // 추가하는 것 같은 무관한 UX 변경은 만들지 않는다(범위 최소화).
  const { center } = useUserLocation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [events, setEvents] = useState<NearbyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<NearbyItem | null>(null);
  const [isLongRunningExpanded, setIsLongRunningExpanded] = useState(false);

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

  const { shortTerm, longRunning } = useMemo(() => splitByDuration(events), [events]);
  const grid = useMemo(() => buildCalendarGrid(year, month, shortTerm), [year, month, shortTerm]);

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

  const selectedDay = selectedDateKey ? grid.find((day) => day.dateKey === selectedDateKey) : null;

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
            {/* 30일 이상 상시 운영/예약 항목 - 일별 타일 과밀 방지를 위해 분리 노출 */}
            {longRunning.length > 0 && (
              <div className="border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsLongRunningExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span>상시 운영/예약 ({longRunning.length}건)</span>
                  <span className="text-gray-400">{isLongRunningExpanded ? '접기 ▲' : '펼치기 ▼'}</span>
                </button>
                {isLongRunningExpanded && (
                  <ul className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {longRunning.map((item) => (
                      <EventStatusListItem key={item.id} item={item} onSelect={setSelectedItem} />
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="grid grid-cols-7 text-center text-xs text-gray-400 py-2 border-b border-gray-100">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-fr">
              {grid.map((day) => {
                const isToday = day.dateKey === todayKey();
                const visibleChips = day.items.slice(0, MAX_CHIPS_PER_DAY);
                const overflowCount = day.items.length - visibleChips.length;

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() => setSelectedDateKey(day.dateKey)}
                    className={`min-h-[88px] border-b border-r border-gray-100 p-1.5 text-left align-top flex flex-col gap-1 ${
                      day.inCurrentMonth ? 'bg-white' : 'bg-gray-50'
                    }`}
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
                        <span className="text-[10px] text-blue-600 font-medium">+{overflowCount}개 더보기</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 날짜별 전체 목록 레이어 (spec 없음 - 사용자 확정 요구사항: "+N개 더보기" 클릭 시 레이어로 확인) */}
      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-end md:items-center justify-center"
          onClick={() => setSelectedDateKey(null)}
        >
          <div
            className="w-full md:w-[420px] max-h-[75vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <span className="text-sm font-semibold text-gray-900">
                {selectedDay.dateKey} 행사 {selectedDay.items.length}건
              </span>
              <button
                type="button"
                onClick={() => setSelectedDateKey(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {selectedDay.items.map((item) => (
                <EventStatusListItem key={item.id} item={item} onSelect={setSelectedItem} />
              ))}
            </ul>
          </div>
        </div>
      )}

      {selectedItem && (
        <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}

      <AiChatFab center={center} />
    </div>
  );
}
