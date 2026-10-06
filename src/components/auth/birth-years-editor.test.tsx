import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BirthYearsEditor } from './birth-years-editor';

const updateBirthYearsAndMonthsMock = vi.fn();

vi.mock('@/lib/auth/profile', () => ({
  updateBirthYearsAndMonths: (years: number[], months: number[]) => updateBirthYearsAndMonthsMock(years, months),
}));

describe('BirthYearsEditor', () => {
  afterEach(() => {
    updateBirthYearsAndMonthsMock.mockReset();
  });

  it('초기 출생년도가 없으면 안내 문구를 보여준다', () => {
    render(<BirthYearsEditor initialBirthYears={[]} initialBirthMonths={[]} />);
    expect(screen.getByText('아직 등록된 자녀 출생년월이 없어요.')).toBeInTheDocument();
  });

  it('초기 출생년도/월을 입력값으로 보여준다', () => {
    render(<BirthYearsEditor initialBirthYears={[2020, 2022]} initialBirthMonths={[3, 7]} />);
    expect(screen.getByDisplayValue('2020')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2022')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3월')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7월')).toBeInTheDocument();
  });

  it('"+ 자녀 출생년월 추가"를 누르면 올해 연도가 기본값으로 추가된다', () => {
    render(<BirthYearsEditor initialBirthYears={[]} initialBirthMonths={[]} />);
    fireEvent.click(screen.getByText('+ 자녀 출생년월 추가'));
    expect(screen.getByDisplayValue(String(new Date().getFullYear()))).toBeInTheDocument();
  });

  it('삭제를 누르면 해당 항목이 목록에서 사라진다', () => {
    render(<BirthYearsEditor initialBirthYears={[2020, 2022]} initialBirthMonths={[3, 7]} />);
    fireEvent.click(screen.getAllByText('삭제')[0]);
    expect(screen.queryByDisplayValue('2020')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('2022')).toBeInTheDocument();
  });

  it('저장을 누르면 updateBirthYearsAndMonths를 호출하고 완료 메시지를 보여준다', async () => {
    updateBirthYearsAndMonthsMock.mockResolvedValue({
      id: 'user-1',
      birth_years: [2020],
      birth_months: [3],
      created_at: 't',
      updated_at: 't',
    });
    render(<BirthYearsEditor initialBirthYears={[2020]} initialBirthMonths={[3]} />);

    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(screen.getByText('저장했어요.')).toBeInTheDocument());
    expect(updateBirthYearsAndMonthsMock).toHaveBeenCalledWith([2020], [3]);
  });

  it('저장이 실패하면 에러 메시지를 보여준다', async () => {
    updateBirthYearsAndMonthsMock.mockRejectedValue(new Error('프로필 저장 실패: 네트워크 오류'));
    render(<BirthYearsEditor initialBirthYears={[2020]} initialBirthMonths={[3]} />);

    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(screen.getByText('프로필 저장 실패: 네트워크 오류')).toBeInTheDocument());
  });

  it('1900년 미만/올해 초과 등 범위를 벗어난 값은 저장 시 걸러낸다', async () => {
    updateBirthYearsAndMonthsMock.mockResolvedValue({
      id: 'user-1',
      birth_years: [],
      birth_months: [],
      created_at: 't',
      updated_at: 't',
    });
    render(<BirthYearsEditor initialBirthYears={[2020]} initialBirthMonths={[3]} />);

    fireEvent.change(screen.getByDisplayValue('2020'), { target: { value: '1800' } });
    fireEvent.click(screen.getByText('저장'));

    await waitFor(() => expect(updateBirthYearsAndMonthsMock).toHaveBeenCalledWith([], []));
  });
});
