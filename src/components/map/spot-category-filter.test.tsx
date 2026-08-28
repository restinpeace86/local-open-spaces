import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpotCategoryFilter, MAX_SPOT_CATEGORY_MIN_SELECTION } from './spot-category-filter';

describe('SpotCategoryFilter', () => {
  it('기본으로 첫 대분류의 중분류만 노출한다', () => {
    render(<SpotCategoryFilter selectedMinors={[]} onToggleMinor={vi.fn()} onLimitExceeded={vi.fn()} />);
    expect(screen.getByText('테니스장')).toBeInTheDocument();
    expect(screen.queryByText('도서관')).not.toBeInTheDocument();
  });

  it('다른 대분류 탭을 누르면 그 하위 중분류로 바뀐다', () => {
    render(<SpotCategoryFilter selectedMinors={[]} onToggleMinor={vi.fn()} onLimitExceeded={vi.fn()} />);
    fireEvent.click(screen.getByText(/문화시설/));
    expect(screen.getByText('도서관')).toBeInTheDocument();
    expect(screen.queryByText('테니스장')).not.toBeInTheDocument();
  });

  it('중분류를 클릭하면 onToggleMinor가 호출된다', () => {
    const onToggleMinor = vi.fn();
    render(<SpotCategoryFilter selectedMinors={[]} onToggleMinor={onToggleMinor} onLimitExceeded={vi.fn()} />);
    fireEvent.click(screen.getByText('테니스장'));
    expect(onToggleMinor).toHaveBeenCalledWith('테니스장');
  });

  it(`이미 ${MAX_SPOT_CATEGORY_MIN_SELECTION}개 선택된 상태에서 새 항목을 누르면 onLimitExceeded만 호출되고 onToggleMinor는 호출되지 않는다`, () => {
    const onToggleMinor = vi.fn();
    const onLimitExceeded = vi.fn();
    const fiveSelected = ['테니스장', '골프장', '풋살장', '축구장', '농구장'];
    render(<SpotCategoryFilter selectedMinors={fiveSelected} onToggleMinor={onToggleMinor} onLimitExceeded={onLimitExceeded} />);
    fireEvent.click(screen.getByText('족구장'));
    expect(onLimitExceeded).toHaveBeenCalledTimes(1);
    expect(onToggleMinor).not.toHaveBeenCalled();
  });

  it('5개 선택된 상태에서 이미 선택된 항목(해제)은 제한과 무관하게 onToggleMinor가 호출된다', () => {
    const onToggleMinor = vi.fn();
    const onLimitExceeded = vi.fn();
    const fiveSelected = ['테니스장', '골프장', '풋살장', '축구장', '농구장'];
    render(<SpotCategoryFilter selectedMinors={fiveSelected} onToggleMinor={onToggleMinor} onLimitExceeded={onLimitExceeded} />);
    fireEvent.click(screen.getByText('테니스장'));
    expect(onToggleMinor).toHaveBeenCalledWith('테니스장');
    expect(onLimitExceeded).not.toHaveBeenCalled();
  });

  it('대분류 탭에 선택된 중분류 개수를 표시한다', () => {
    render(<SpotCategoryFilter selectedMinors={['테니스장', '골프장']} onToggleMinor={vi.fn()} onLimitExceeded={vi.fn()} />);
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });
});
