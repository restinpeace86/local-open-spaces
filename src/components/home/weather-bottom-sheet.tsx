'use client';

import { useState } from 'react';
import { WeatherSnapshot } from '@/lib/ai-chat/weather-reaction';

// [상단 날씨 위젯 및 실시간·주말 날씨 바텀시트](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 7]): [오늘 실시간]/[이번 주말 예보] 탭 바텀시트.
export type WeatherApiResponse = {
  today: { date: string; snapshot: WeatherSnapshot; guideMessage: string | null };
  weekend: Array<{ date: string; dayLabel: string; snapshot: WeatherSnapshot; oneLiner: string | null }>;
};

const AIR_GRADE_CLASS: Record<string, string> = {
  좋음: 'bg-blue-50 text-blue-700',
  보통: 'bg-emerald-50 text-emerald-700',
  나쁨: 'bg-amber-100 text-amber-800',
  매우나쁨: 'bg-red-100 text-red-700',
};

function AirGradeBadge({ label, grade }: { label: string; grade: string | null }) {
  if (!grade) return null;
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${AIR_GRADE_CLASS[grade] ?? 'bg-gray-100 text-gray-600'}`}>
      {label} {grade}
    </span>
  );
}

function skyIcon(snapshot: WeatherSnapshot): string {
  if (!snapshot.available) return '🌡️';
  if (snapshot.precipitationProb != null && snapshot.precipitationProb >= 50) return '🌧️';
  if (snapshot.skyStatus === '맑음') return '☀️';
  if (snapshot.skyStatus === '구름많음') return '⛅';
  if (snapshot.skyStatus === '흐림') return '☁️';
  return '🌡️';
}

function TodayView({ today }: { today: WeatherApiResponse['today'] }) {
  const { snapshot, guideMessage } = today;

  if (!snapshot.available) {
    return <p className="text-sm text-gray-400 py-6 text-center">아직 실시간 날씨 데이터를 확보하지 못했어요.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden>
          {skyIcon(snapshot)}
        </span>
        <div>
          <p className="text-2xl font-bold text-gray-900">{snapshot.temperature != null ? `${Math.round(snapshot.temperature)}°` : '-'}</p>
          {snapshot.skyStatus && <p className="text-xs text-gray-500">{snapshot.skyStatus}</p>}
        </div>
      </div>

      {snapshot.airQualityAvailable && (
        <div className="flex gap-2">
          <AirGradeBadge label="미세먼지" grade={snapshot.pm10Grade} />
          <AirGradeBadge label="초미세먼지" grade={snapshot.pm25Grade} />
        </div>
      )}

      {snapshot.precipitationProb != null && (
        <p className="text-sm text-gray-600">☔ 강수확률 {snapshot.precipitationProb}%</p>
      )}

      {guideMessage && (
        <div className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-800 font-medium">{guideMessage}</div>
      )}
    </div>
  );
}

function WeekendCard({ card }: { card: WeatherApiResponse['weekend'][number] }) {
  const { dayLabel, snapshot, oneLiner } = card;
  return (
    <div className="rounded-xl border border-gray-200 p-3 flex items-center gap-3">
      <span className="text-xs font-bold text-gray-500 w-6 shrink-0">{dayLabel}</span>
      <span className="text-2xl" aria-hidden>
        {skyIcon(snapshot)}
      </span>
      <div className="flex-1 min-w-0">
        {snapshot.available ? (
          <>
            <p className="text-sm font-semibold text-gray-900">
              {snapshot.temperature != null ? `${Math.round(snapshot.temperature)}°` : '-'}
              {snapshot.precipitationProb != null && <span className="ml-2 text-xs text-gray-500">강수 {snapshot.precipitationProb}%</span>}
            </p>
            {oneLiner && <p className="text-xs text-gray-500 truncate">{oneLiner}</p>}
          </>
        ) : (
          <p className="text-xs text-gray-400">아직 예보 데이터가 없어요(날짜가 가까워지면 확인 가능해요)</p>
        )}
      </div>
    </div>
  );
}

export function WeatherBottomSheet({ data, onClose }: { data: WeatherApiResponse | null; onClose: () => void }) {
  const [tab, setTab] = useState<'today' | 'weekend'>('today');

  return (
    <div className="fixed inset-0 bg-black/40 z-[70] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:w-[420px] max-h-[70vh] md:max-h-[60vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">🌤️ 날씨 리포트</h2>
          <button type="button" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex border-b border-gray-100">
          <button
            type="button"
            onClick={() => setTab('today')}
            className={`flex-1 py-2.5 text-sm font-semibold ${tab === 'today' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}
          >
            오늘 실시간
          </button>
          <button
            type="button"
            onClick={() => setTab('weekend')}
            className={`flex-1 py-2.5 text-sm font-semibold ${tab === 'weekend' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}
          >
            이번 주말 예보
          </button>
        </div>

        <div className="p-4">
          {!data ? (
            <p className="text-sm text-gray-400 py-6 text-center">불러오는 중...</p>
          ) : tab === 'today' ? (
            <TodayView today={data.today} />
          ) : (
            <div className="flex flex-col gap-2">
              {data.weekend.map((card) => (
                <WeekendCard key={card.date} card={card} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
