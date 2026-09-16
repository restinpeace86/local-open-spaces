import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatingExceptionsEditor } from './operating-exceptions-editor';

// [실제 운영일 하이라이트 캘린더](2026-09-16 사용자 지시, implementation/todo.md
// [개선사항 2]) 단위 테스트.
function mockFetch(handlers: {
  exceptions?: Array<{ id: string; exception_date: string; note: string | null }>;
  holidays?: Array<{ holiday_date: string; name: string }>;
  addOk?: boolean;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/events/operating-exceptions') && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: handlers.exceptions ?? [] }) } as Response);
    }
    if (url.includes('/api/admin/events/operating-exceptions') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      if (handlers.addOk === false) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '추가 실패' }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ item: { id: `new-${body.exception_date}`, exception_date: body.exception_date, note: body.note } }),
      } as Response);
    }
    if (url.includes('/api/admin/events/operating-exceptions') && init?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    }
    if (url.includes('/api/admin/public-holidays') && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: handlers.holidays ?? [] }) } as Response);
    }
    if (url.includes('/api/admin/public-holidays') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: body }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('저장된 예외 휴무일 목록을 보여준다', async () => {
  vi.stubGlobal('fetch', mockFetch({ exceptions: [{ id: 'e1', exception_date: '2026-09-15', note: '임시휴무' }] }));
  render(<OperatingExceptionsEditor eventId="event-1" startDate="2026-09-01" endDate="2026-09-30" />);

  expect(await screen.findByText(/2026-09-15 — 임시휴무/)).toBeInTheDocument();
});

it('기간에 걸친 공휴일을 버튼으로 보여주고 클릭하면 예외로 추가한다', async () => {
  const fetchMock = mockFetch({ exceptions: [], holidays: [{ holiday_date: '2026-09-25', name: '추석' }] });
  vi.stubGlobal('fetch', fetchMock);
  render(<OperatingExceptionsEditor eventId="event-1" startDate="2026-09-01" endDate="2026-09-30" />);

  const holidayButton = await screen.findByText(/2026-09-25 추석/);
  fireEvent.click(holidayButton);

  await waitFor(() => {
    const postCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string).includes('/api/admin/events/operating-exceptions') && (c[1] as RequestInit)?.method === 'POST'
    );
    expect(postCall).toBeDefined();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({ event_id: 'event-1', exception_date: '2026-09-25', note: '추석' });
  });
});

it('날짜/사유를 직접 입력해 예외 휴무일을 추가할 수 있다', async () => {
  const fetchMock = mockFetch({ exceptions: [] });
  vi.stubGlobal('fetch', fetchMock);
  render(<OperatingExceptionsEditor eventId="event-1" startDate="2026-09-01" endDate="2026-09-30" />);

  await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());

  fireEvent.change(screen.getByPlaceholderText('사유(선택, 예: 임시휴무)'), { target: { value: '시설 점검' } });
  const dateInputs = screen.getAllByDisplayValue('');
  fireEvent.change(dateInputs[0], { target: { value: '2026-09-10' } });
  fireEvent.click(screen.getByText('추가'));

  expect(await screen.findByText(/2026-09-10 — 시설 점검/)).toBeInTheDocument();
});

it('예외 휴무일을 삭제할 수 있다', async () => {
  vi.stubGlobal('fetch', mockFetch({ exceptions: [{ id: 'e1', exception_date: '2026-09-15', note: null }] }));
  render(<OperatingExceptionsEditor eventId="event-1" startDate="2026-09-01" endDate="2026-09-30" />);

  await screen.findByText(/2026-09-15/);
  fireEvent.click(screen.getByText('삭제'));

  await waitFor(() => expect(screen.queryByText(/2026-09-15/)).not.toBeInTheDocument());
});

it('예외 휴무일이 없으면 안내 문구를 보여준다', async () => {
  vi.stubGlobal('fetch', mockFetch({ exceptions: [] }));
  render(<OperatingExceptionsEditor eventId="event-1" startDate="2026-09-01" endDate="2026-09-30" />);

  expect(await screen.findByText('지정된 예외 휴무일이 없습니다.')).toBeInTheDocument();
});

it('"공휴일 참고 목록에 새로 등록"으로 새 공휴일을 추가할 수 있다', async () => {
  vi.stubGlobal('fetch', mockFetch({ exceptions: [] }));
  render(<OperatingExceptionsEditor eventId="event-1" startDate="2026-09-01" endDate="2026-09-30" />);

  await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
  fireEvent.click(screen.getByText('+ 공휴일 참고 목록에 새로 등록'));

  fireEvent.change(screen.getByPlaceholderText('공휴일 이름(예: 설날)'), { target: { value: '추석' } });
  const dateInput = screen.getByPlaceholderText('공휴일 이름(예: 설날)').previousSibling as HTMLInputElement;
  // 등록 즉시 폼이 닫히므로(성공 후 isAddingHoliday=false), 이벤트 기간(9/1~9/30) 안의
  // 날짜로 등록해 "이 기간의 공휴일" 빠른 추가 칩으로 바로 나타나는지까지 확인한다.
  fireEvent.change(dateInput, { target: { value: '2026-09-25' } });
  fireEvent.click(screen.getByText('등록'));

  await waitFor(() => expect(screen.getByText(/2026-09-25 추석/)).toBeInTheDocument());
});
