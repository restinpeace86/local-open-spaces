import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventOperatingCalendarSheet } from './event-operating-calendar-sheet';

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]) 단위 테스트.
function mockFetch(response: { startDate: string; endDate: string; openDates: string[] } | { error: string }) {
  return vi.fn(() =>
    Promise.resolve({
      ok: !('error' in response),
      json: () => Promise.resolve(response),
    } as Response)
  );
}

describe('EventOperatingCalendarSheet', () => {
  beforeEach(() => {
    // [findByText/waitFor 무한 대기 방지] 기본 vi.useFakeTimers()는 setTimeout까지
    // 가짜로 만들어 RTL의 내부 폴링(waitFor)이 절대 깨어나지 못하고 타임아웃난다 —
    // Date만 고정하고 타이머는 실시간 그대로 둔다.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-10T00:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('오늘이 기간 안이면 오늘이 속한 달을 기본으로 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetch({ startDate: '2026-09-01', endDate: '2026-09-30', openDates: ['2026-09-05'] }));
    render(<EventOperatingCalendarSheet eventId="event-1" onClose={() => {}} />);

    expect(await screen.findByText('2026년 9월')).toBeInTheDocument();
  });

  it('오늘이 기간 시작 전이면 시작월을 기본으로 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetch({ startDate: '2026-11-01', endDate: '2026-11-30', openDates: [] }));
    render(<EventOperatingCalendarSheet eventId="event-1" onClose={() => {}} />);

    expect(await screen.findByText('2026년 11월')).toBeInTheDocument();
  });

  it('다음/이전 달 버튼으로 이동할 수 있다', async () => {
    vi.stubGlobal('fetch', mockFetch({ startDate: '2026-09-01', endDate: '2026-11-30', openDates: [] }));
    render(<EventOperatingCalendarSheet eventId="event-1" onClose={() => {}} />);

    await screen.findByText('2026년 9월');
    fireEvent.click(screen.getByText('▶'));
    expect(await screen.findByText('2026년 10월')).toBeInTheDocument();
    fireEvent.click(screen.getByText('◀'));
    expect(await screen.findByText('2026년 9월')).toBeInTheDocument();
  });

  it('조회 실패 시 에러 메시지를 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: '운영일 조회에 실패했습니다.' }));
    render(<EventOperatingCalendarSheet eventId="event-1" onClose={() => {}} />);

    expect(await screen.findByText('운영일 조회에 실패했습니다.')).toBeInTheDocument();
  });

  it('전체 기간 텍스트를 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetch({ startDate: '2026-09-01', endDate: '2026-09-30', openDates: [] }));
    render(<EventOperatingCalendarSheet eventId="event-1" onClose={() => {}} />);

    expect(await screen.findByText('전체 기간: 2026-09-01 ~ 2026-09-30')).toBeInTheDocument();
  });

  it('배경 클릭 시 닫힌다', async () => {
    vi.stubGlobal('fetch', mockFetch({ startDate: '2026-09-01', endDate: '2026-09-30', openDates: [] }));
    const onClose = vi.fn();
    const { container } = render(<EventOperatingCalendarSheet eventId="event-1" onClose={onClose} />);
    await screen.findByText('2026년 9월');

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
