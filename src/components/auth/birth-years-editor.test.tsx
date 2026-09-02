import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BirthYearsEditor } from './birth-years-editor';

const updateBirthYearsMock = vi.fn();

vi.mock('@/lib/auth/profile', () => ({
  updateBirthYears: (years: number[]) => updateBirthYearsMock(years),
}));

describe('BirthYearsEditor', () => {
  afterEach(() => {
    updateBirthYearsMock.mockReset();
  });

  it('초기 출생년도가 없으면 안내 문구를 보여준다', () => {
    render(<BirthYearsEditor initialBirthYears={[]} />);
    expect(screen.getByText('아직 등록된 자녀 출생년도가 없어요.')).toBeInTheDocument();
  });

  it('초기 출생년도를 입력값으로 보여준다', () => {
    render(<BirthYearsEditor initialBirthYears={[2020, 2022]} />);
    expect(screen.getByDisplayValue('2020')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2022')).toBeInTheDocument();
  });

  it('"+ 자녀 출생년도 추가"를 누르면 올해 연도가 기본값으로 추가된다', () => {
    render(<BirthYearsEditor initialBirthYears={[]} />);
    fireEvent.click(screen.getByText('+ 자녀 출생년도 추가'));
    expect(screen.getByDisplayValue(String(new Date().getFullYear()))).toBeInTheDocument();
  });

  it('삭제를 누르면 해당 항목이 목록에서 사라진다', () => {
    render(<BirthYearsEditor initialBirthYears={[2020, 2022]} />);
    fireEvent.click(screen.getAllByText('삭제')[0]);
    expect(screen.queryByDisplayValue('2020')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('2022')).toBeInTheDocument();
  });

  it('저장을 누르면 updateBirthYears를 호출하고 완료 메시지를 보여준다', async () => {
    updateBirthYearsMock.mockResolvedValue({ id: 'user-1', birth_years: [2020], created_at: 't', updated_at: 't' });
    render(<BirthYearsEditor initialBirthYears={[2020]} />);

    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(screen.getByText('저장했어요.')).toBeInTheDocument());
    expect(updateBirthYearsMock).toHaveBeenCalledWith([2020]);
  });

  it('저장이 실패하면 에러 메시지를 보여준다', async () => {
    updateBirthYearsMock.mockRejectedValue(new Error('프로필 저장 실패: 네트워크 오류'));
    render(<BirthYearsEditor initialBirthYears={[2020]} />);

    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(screen.getByText('프로필 저장 실패: 네트워크 오류')).toBeInTheDocument());
  });

  it('1900년 미만/올해 초과 등 범위를 벗어난 값은 저장 시 걸러낸다', async () => {
    updateBirthYearsMock.mockResolvedValue({ id: 'user-1', birth_years: [2020], created_at: 't', updated_at: 't' });
    render(<BirthYearsEditor initialBirthYears={[2020]} />);

    fireEvent.change(screen.getByDisplayValue('2020'), { target: { value: '1800' } });
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(updateBirthYearsMock).toHaveBeenCalledWith([]));
  });
});
