'use client';

import { useEffect, useState } from 'react';
import { WeatherBottomSheet, WeatherApiResponse } from '@/components/home/weather-bottom-sheet';

// [상단 날씨 위젯 및 실시간·주말 날씨 바텀시트](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 7]): 헤더 우측의 미니멀 날씨 위젯(아이콘+기온만).
// lat/lng이 아직 없으면(위치 미설정) 위젯 자체를 숨긴다 — 챗봇 날씨 조회와 동일하게
// 좌표 없이는 조회할 근거가 없다(추측 금지).
function skyIcon(snapshot: WeatherApiResponse['today']['snapshot'] | null): string {
  if (!snapshot || !snapshot.available) return '🌡️';
  if (snapshot.precipitationProb != null && snapshot.precipitationProb >= 50) return '🌧️';
  if (snapshot.skyStatus === '맑음') return '☀️';
  if (snapshot.skyStatus === '구름많음') return '⛅';
  if (snapshot.skyStatus === '흐림') return '☁️';
  return '🌡️';
}

export function WeatherWidget({ lat, lng }: { lat?: number; lng?: number }) {
  const [data, setData] = useState<WeatherApiResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (lat == null || lng == null) return;
    fetch(`/api/home/weather?lat=${lat}&lng=${lng}`)
      .then((res) => res.json())
      .then((json: Partial<WeatherApiResponse> & { error?: string }) => {
        // [무중단 원칙] 위젯은 부가 정보라 응답 모양이 기대와 다르거나(예: 이 URL을
        // 구분하지 않는 다른 API 목/오류 응답) 에러가 와도 헤더 전체를 막지 않는다.
        if (!json.error && json.today) setData(json as WeatherApiResponse);
      })
      .catch(() => {
        // 조회 자체가 실패해도 헤더 전체를 막지 않는다(제5장 제11조).
      });
  }, [lat, lng]);

  if (lat == null || lng == null) return null;

  const snapshot = data?.today?.snapshot ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="shrink-0 flex items-center gap-1 rounded-full bg-white border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
        aria-label="날씨 상세 보기"
      >
        <span aria-hidden>{skyIcon(snapshot)}</span>
        {snapshot?.available && snapshot.temperature != null && <span>{Math.round(snapshot.temperature)}°</span>}
      </button>

      {isOpen && <WeatherBottomSheet data={data} onClose={() => setIsOpen(false)} />}
    </>
  );
}
