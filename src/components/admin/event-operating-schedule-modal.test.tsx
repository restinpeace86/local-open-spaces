import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventOperatingScheduleModal } from './event-operating-schedule-modal';

// [운영 요일/반복 규칙을 블로그 큐레이션 밖으로 다시 분리](2026-09-22 사용자 지시):
// "상세 팝업에서 블로그로 큐레이션 진입하는 버튼이랑 같은곳으로 빼줘" — 독립
// 모달로 분리된 편집기가 실제로 렌더링되고, 저장 결과가 onOperatingScheduleUpdated로
// 올라오는지 확인한다(편집기 자체의 상세 동작은 operating-schedule-editor.test.tsx가
// 이미 검증하므로 여기서는 통합 지점만 확인).
const EVENT = { id: 'event-1', title: '가을 단풍 축제', start_date: '2026-09-01', end_date: '2026-09-30' };

function mockFetchByUrl() {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/events/operating-schedule')) {
      const parsed = JSON.parse(init!.body as string);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ row: parsed }) } as Response);
    }
    if (url.includes('/api/admin/events/operating-exceptions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    if (url.includes('/api/admin/public-holidays')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('EventOperatingScheduleModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('"운영 요일 / 반복 규칙" 편집기가 렌더링된다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl());
    render(<EventOperatingScheduleModal event={EVENT} onClose={vi.fn()} onOperatingScheduleUpdated={vi.fn()} />);

    expect(await screen.findByText('운영 요일 / 반복 규칙')).toBeInTheDocument();
  });

  it('"주말만 운영"을 골라 저장하면 operating-schedule을 PATCH하고 onOperatingScheduleUpdated를 호출한다', async () => {
    const fetchMock = mockFetchByUrl();
    vi.stubGlobal('fetch', fetchMock);
    const onOperatingScheduleUpdated = vi.fn();
    render(
      <EventOperatingScheduleModal event={EVENT} onClose={vi.fn()} onOperatingScheduleUpdated={onOperatingScheduleUpdated} />
    );

    await screen.findByText('운영 요일 / 반복 규칙');
    fireEvent.click(screen.getByRole('button', { name: '주말만 운영(토·일)' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(onOperatingScheduleUpdated).toHaveBeenCalledWith('event-1', ['SAT', 'SUN'], null, null, null)
    );
    const patchCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/events/operating-schedule'));
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      id: 'event-1',
      operating_weekdays: ['SAT', 'SUN'],
      excluded_weekdays: null,
      operating_nth_weekdays: null,
      operating_specific_dates: null,
    });
  });

  it('닫기 버튼을 누르면 onClose가 호출된다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl());
    const onClose = vi.fn();
    render(<EventOperatingScheduleModal event={EVENT} onClose={onClose} onOperatingScheduleUpdated={vi.fn()} />);

    await screen.findByText('운영 요일 / 반복 규칙');
    // [헤더의 ✕ 버튼과 하단 "닫기" 버튼 모두 접근성 이름이 "닫기"라 여러 개 매칭된다]
    const closeButtons = screen.getAllByRole('button', { name: '닫기' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });
});
