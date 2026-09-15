import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WeatherWidget } from './weather-widget';

// [상단 날씨 위젯 및 실시간·주말 날씨 바텀시트](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 7]).
function mockResponse() {
  return {
    today: {
      date: '2026-09-15',
      snapshot: {
        available: true,
        temperature: 24.3,
        precipitationProb: 10,
        skyStatus: '맑음',
        humidity: 50,
        pm10Grade: '좋음',
        pm25Grade: '좋음',
        airQualityAvailable: true,
      },
      guideMessage: '오늘은 날씨가 맑아요! 야외 나들이하기 좋은 날이에요. ☀️',
    },
    weekend: [
      { date: '2026-09-19', dayLabel: '토', snapshot: { available: false, temperature: null, precipitationProb: null, skyStatus: null, humidity: null, pm10Grade: null, pm25Grade: null, airQualityAvailable: false }, oneLiner: null },
      { date: '2026-09-20', dayLabel: '일', snapshot: { available: false, temperature: null, precipitationProb: null, skyStatus: null, humidity: null, pm10Grade: null, pm25Grade: null, airQualityAvailable: false }, oneLiner: null },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

it('lat/lng이 없으면 아무것도 렌더링하지 않는다', () => {
  const { container } = render(<WeatherWidget />);
  expect(container).toBeEmptyDOMElement();
});

it('lat/lng이 있으면 날씨를 조회하고 아이콘+기온을 보여준다', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(mockResponse()) } as Response)));
  render(<WeatherWidget lat={37.4} lng={127.1} />);

  expect(await screen.findByText('24°')).toBeInTheDocument();
  expect(screen.getByText('☀️')).toBeInTheDocument();
});

it('위젯을 클릭하면 바텀시트가 열리고 오늘 실시간 탭 정보를 보여준다', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(mockResponse()) } as Response)));
  render(<WeatherWidget lat={37.4} lng={127.1} />);

  await screen.findByText('24°');
  fireEvent.click(screen.getByLabelText('날씨 상세 보기'));

  expect(await screen.findByText('🌤️ 날씨 리포트')).toBeInTheDocument();
  expect(screen.getByText(/야외 나들이하기 좋은 날/)).toBeInTheDocument();
  expect(screen.getByText('미세먼지 좋음')).toBeInTheDocument();
});

it('바텀시트에서 "이번 주말 예보" 탭으로 전환하면 토/일 카드를 보여준다', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(mockResponse()) } as Response)));
  render(<WeatherWidget lat={37.4} lng={127.1} />);
  await screen.findByText('24°');
  fireEvent.click(screen.getByLabelText('날씨 상세 보기'));
  await screen.findByText('🌤️ 날씨 리포트');

  fireEvent.click(screen.getByText('이번 주말 예보'));

  expect(await screen.findByText('토')).toBeInTheDocument();
  expect(screen.getByText('일')).toBeInTheDocument();
  expect(screen.getAllByText(/아직 예보 데이터가 없어요/)).toHaveLength(2);
});

it('날씨 조회에 실패해도(에러 응답) 헤더가 깨지지 않고 위젯은 온도 없이 조용히 보여준다', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '실패' }) } as Response)));
  render(<WeatherWidget lat={37.4} lng={127.1} />);

  await waitFor(() => expect(screen.getByLabelText('날씨 상세 보기')).toBeInTheDocument());
  expect(screen.queryByText(/°/)).not.toBeInTheDocument();
});
