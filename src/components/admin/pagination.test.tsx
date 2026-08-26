import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPageNumbers, Pagination } from './pagination';

describe('buildPageNumbers', () => {
  it('전체 페이지가 적으면 모든 번호를 그대로 보여준다(생략 없음)', () => {
    expect(buildPageNumbers(1, 4)).toEqual([1, 2, 3, 4]);
  });

  it('현재 페이지가 중간이면 앞뒤에 생략 부호(…)를 넣는다', () => {
    expect(buildPageNumbers(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
  });

  it('현재 페이지가 맨 앞 근처면 앞쪽 생략 부호가 없다', () => {
    expect(buildPageNumbers(1, 20)).toEqual([1, 2, '…', 20]);
  });

  it('현재 페이지가 맨 끝 근처면 뒤쪽 생략 부호가 없다', () => {
    expect(buildPageNumbers(20, 20)).toEqual([1, '…', 19, 20]);
  });

  it('전체 페이지가 1개면 1만 반환한다', () => {
    expect(buildPageNumbers(1, 1)).toEqual([1]);
  });
});

describe('Pagination', () => {
  it('첫/이전 버튼은 1페이지일 때 비활성화되고, 마지막/다음 버튼은 마지막 페이지에서 비활성화된다', () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={5} onChange={onChange} />);

    expect(screen.getByLabelText('첫 페이지로 이동')).toBeDisabled();
    expect(screen.getByLabelText('이전 페이지')).toBeDisabled();
    expect(screen.getByLabelText('마지막 페이지로 이동')).not.toBeDisabled();
  });

  it('페이지 번호를 클릭하면 해당 페이지로 onChange가 호출된다', () => {
    const onChange = vi.fn();
    render(<Pagination page={3} totalPages={5} onChange={onChange} />);

    fireEvent.click(screen.getByText('4'));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('"«" 버튼 클릭 시 1페이지로 이동한다', () => {
    const onChange = vi.fn();
    render(<Pagination page={5} totalPages={10} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('첫 페이지로 이동'));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('"»" 버튼 클릭 시 마지막 페이지로 이동한다', () => {
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={10} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText('마지막 페이지로 이동'));
    expect(onChange).toHaveBeenCalledWith(10);
  });
});
