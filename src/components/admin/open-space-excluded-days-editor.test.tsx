import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenSpaceExcludedDaysEditor, OpenSpaceExcludedDaysRow } from './open-space-excluded-days-editor';

// [open_spaces 정기휴무 설정](2026-09-27 사용자 지시): "이거 이벤트쪽에 있나
// 휴관일이나 정기휴무 설정하는거... 이거 open_spaces쪽에도 놓고.. 정기휴무
// 설정할수있게해야하는거 아니야?" — operating-schedule-editor.test.tsx와 동일한
// 관례로 검증한다.
function buildRow(overrides: Partial<OpenSpaceExcludedDaysRow> = {}): OpenSpaceExcludedDaysRow {
  return { id: 'space-1', excluded_weekdays: null, excluded_nth_weekdays: null, ...overrides };
}

describe('OpenSpaceExcludedDaysEditor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('규칙이 없으면 두 체크박스 모두 꺼져 있고 요일 그리드가 안 보인다', () => {
    render(<OpenSpaceExcludedDaysEditor row={buildRow()} onUpdated={vi.fn()} />);

    expect(screen.getByRole('checkbox', { name: '매주 정기휴무 요일(예: 매주 월요일 휴무)' })).not.toBeChecked();
    expect(screen.queryByRole('checkbox', { name: '월' })).not.toBeInTheDocument();
  });

  it('매주 정기휴무 요일을 켜고 월/화를 체크해 저장하면 excluded_weekdays로 PATCH한다', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ row: { id: 'space-1', excluded_weekdays: ['MON', 'TUE'], excluded_nth_weekdays: null } }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const onUpdated = vi.fn();
    render(<OpenSpaceExcludedDaysEditor row={buildRow()} onUpdated={onUpdated} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '매주 정기휴무 요일(예: 매주 월요일 휴무)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '월' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '화' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith('space-1', ['MON', 'TUE'], null));
    const patchCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/open-spaces/operating-schedule'));
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      id: 'space-1',
      excluded_weekdays: ['MON', 'TUE'],
      excluded_nth_weekdays: null,
    });
  });

  it('매월 특정 주차 요일 휴무를 켜고 월요일+1,3주차를 골라 저장하면 토큰 배열로 PATCH한다', async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ row: { id: 'space-1', excluded_weekdays: null, excluded_nth_weekdays: ['1-MON', '3-MON'] } }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<OpenSpaceExcludedDaysEditor row={buildRow()} onUpdated={vi.fn()} />);

    fireEvent.click(screen.getByRole('checkbox', { name: '매월 특정 주차 요일 휴무(예: 매월 첫째·셋째 월요일 휴관)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '월' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '1주차' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '3주차' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/open-spaces/operating-schedule'));
      expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
        id: 'space-1',
        excluded_weekdays: null,
        excluded_nth_weekdays: ['1-MON', '3-MON'],
      });
    });
  });

  it('기존 값이 있으면 두 규칙 모두 미리 켜진 상태로 복원된다', () => {
    render(
      <OpenSpaceExcludedDaysEditor
        row={buildRow({ excluded_weekdays: ['MON'], excluded_nth_weekdays: ['2-SAT'] })}
        onUpdated={vi.fn()}
      />
    );

    // 요일 라벨("월"/"토")은 매주 그리드와 매월 그리드에 동시에 렌더링돼(전체 7일이
    // 항상 다 보임) 중복된다 — DOM 순서(매주 섹션이 먼저)로 어느 그리드인지 구분한다.
    expect(screen.getByRole('checkbox', { name: '매주 정기휴무 요일(예: 매주 월요일 휴무)' })).toBeChecked();
    expect(screen.getAllByRole('checkbox', { name: '월' })[0]).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '매월 특정 주차 요일 휴무(예: 매월 첫째·셋째 월요일 휴관)' })).toBeChecked();
    expect(screen.getAllByRole('checkbox', { name: '토' })[1]).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2주차' })).toBeChecked();
  });

  it('저장 실패 시 에러 메시지를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '저장 실패' }) } as Response))
    );
    render(<OpenSpaceExcludedDaysEditor row={buildRow()} onUpdated={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('저장 실패')).toBeInTheDocument();
  });
});
