import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperatingScheduleEditor, OperatingScheduleRow } from './operating-schedule-editor';

// [관리자 이벤트 상세 팝업 내 '운영 요일 / 반복 규칙' 설정 추가](2026-09-12 사용자 지시):
// "☑️ 주말만 운영 / ☑️ 특정 요일 지정 / ☑️ 정기 휴무일 제외 .. 택 1 또는 조합".
// [블로그 큐레이션 모달로 이동](2026-09-12 사용자 지시): raw-data-modal.test.tsx의
// 동일 스위트를 여기로 옮겼다 — 편집기가 event-blog-curation-modal.tsx와 공유하는
// 독립 컴포넌트로 분리됐으므로 RawDataModal 없이 이 컴포넌트만 단위 테스트한다.
function buildRow(overrides: Partial<OperatingScheduleRow> = {}): OperatingScheduleRow {
  return {
    id: 'row-1',
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    operating_weekdays: null,
    excluded_weekdays: null,
    operating_nth_weekdays: null,
    ...overrides,
  };
}

describe('OperatingScheduleEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('규칙이 없으면 "매일 운영" 프리셋이 기본 선택돼 있다', () => {
    render(<OperatingScheduleEditor row={buildRow()} onUpdated={vi.fn()} />);

    expect(screen.getByRole('button', { name: '매일 운영' })).toHaveClass('bg-purple-600');
  });

  it('"주말만 운영" 프리셋을 선택해 저장하면 operating_weekdays=[SAT,SUN]으로 PATCH한다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            row: { id: 'row-1', operating_weekdays: ['SAT', 'SUN'], excluded_weekdays: null, operating_nth_weekdays: null },
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const onUpdated = vi.fn();
    render(<OperatingScheduleEditor row={buildRow()} onUpdated={onUpdated} />);

    fireEvent.click(screen.getByRole('button', { name: '주말만 운영(토·일)' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith('row-1', ['SAT', 'SUN'], null, null));
    const patchCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/events/operating-schedule'));
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      id: 'row-1',
      operating_weekdays: ['SAT', 'SUN'],
      excluded_weekdays: null,
      operating_nth_weekdays: null,
    });
  });

  it('"특정 요일 지정"을 고르고 화/목을 체크해 저장하면 그 두 요일만 PATCH한다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            row: { id: 'row-1', operating_weekdays: ['TUE', 'THU'], excluded_weekdays: null, operating_nth_weekdays: null },
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<OperatingScheduleEditor row={buildRow()} onUpdated={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '특정 요일 지정' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '화' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '목' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/events/operating-schedule'));
      expect(patchCall).toBeDefined();
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        id: 'row-1',
        operating_weekdays: ['TUE', 'THU'],
        excluded_weekdays: null,
        operating_nth_weekdays: null,
      });
    });
  });

  // [사용자 제시 예시] "정기 휴무일이 매주 월요일이라고 했을 때"
  it('"정기 휴무일 지정"을 체크하고 월요일을 골라 저장하면 excluded_weekdays=[MON]으로 PATCH한다(매일 운영과 조합)', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            row: { id: 'row-1', operating_weekdays: null, excluded_weekdays: ['MON'], operating_nth_weekdays: null },
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<OperatingScheduleEditor row={buildRow()} onUpdated={vi.fn()} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '정기 휴무일 지정(예: 매주 월요일 휴무)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '월' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/events/operating-schedule'));
      expect(patchCall).toBeDefined();
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        id: 'row-1',
        operating_weekdays: null,
        excluded_weekdays: ['MON'],
        operating_nth_weekdays: null,
      });
    });
  });

  it('저장된 규칙(주말만 운영)을 다시 열면 프리셋이 복원된다', () => {
    const row = buildRow({ operating_weekdays: ['SAT', 'SUN'], excluded_weekdays: ['MON'] });
    render(<OperatingScheduleEditor row={row} onUpdated={vi.fn()} />);

    expect(screen.getByRole('button', { name: '주말만 운영(토·일)' })).toHaveClass('bg-purple-600');
    expect(screen.getByRole('checkbox', { name: '정기 휴무일 지정(예: 매주 월요일 휴무)' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '월' })).toBeChecked();
  });

  // [매월 N번째 요일 패턴 추가](2026-09-12 사용자 지시): "매월 2번째 4번째 토요일" 예시.
  it('"매월 특정 주차 요일"을 고르고 토요일 + 2주차/4주차를 체크해 저장하면 operating_nth_weekdays=[2-SAT,4-SAT]로 PATCH한다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            row: { id: 'row-1', operating_weekdays: null, excluded_weekdays: null, operating_nth_weekdays: ['2-SAT', '4-SAT'] },
          }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const onUpdated = vi.fn();
    render(<OperatingScheduleEditor row={buildRow()} onUpdated={onUpdated} />);

    fireEvent.click(screen.getByRole('button', { name: '매월 특정 주차 요일' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '토' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '2주차' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '4주차' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith('row-1', null, null, ['2-SAT', '4-SAT']));
    const patchCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/events/operating-schedule'));
    expect(patchCall).toBeDefined();
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      id: 'row-1',
      operating_weekdays: null,
      excluded_weekdays: null,
      operating_nth_weekdays: ['2-SAT', '4-SAT'],
    });
  });

  it('저장된 매월 N번째 요일 규칙(2-SAT,4-SAT)을 다시 열면 프리셋/요일/주차가 복원된다', () => {
    const row = buildRow({ operating_nth_weekdays: ['2-SAT', '4-SAT'] });
    render(<OperatingScheduleEditor row={row} onUpdated={vi.fn()} />);

    expect(screen.getByRole('button', { name: '매월 특정 주차 요일' })).toHaveClass('bg-purple-600');
    expect(screen.getByRole('checkbox', { name: '토' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2주차' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '4주차' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '1주차' })).not.toBeChecked();
  });
});
