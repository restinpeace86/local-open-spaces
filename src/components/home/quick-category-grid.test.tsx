import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickCategoryGrid } from './quick-category-grid';

// Task 9-1-2: 이모지/단색 원 → 카테고리 대표 이미지 개편 검증
// Task 9-6-17(2026-08-25, docs/spec.md 2.2 ② 개정): 라우팅(/region?category=X) 대신 클릭 시
// onSelect 콜백으로 인라인 피딩 전환을 알린다.
describe('QuickCategoryGrid', () => {
  it('5대 UI 카테고리 이미지와 라벨을 렌더링한다', () => {
    render(<QuickCategoryGrid selected={null} onSelect={() => {}} />);

    const labels = ['체험·클래스', '야외·자연', '전시·박물관', '공연·축제', '키즈·액티비티'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    const kidsImage = screen.getByAltText('키즈·액티비티') as HTMLImageElement;
    expect(kidsImage.tagName).toBe('IMG');
    expect(kidsImage.src).toContain('kids-activity.svg');
  });

  it('클릭 시 라우팅 없이 onSelect(category) 콜백을 호출한다', () => {
    const onSelect = vi.fn();
    render(<QuickCategoryGrid selected={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('키즈·액티비티').closest('button')!);

    expect(onSelect).toHaveBeenCalledWith('KIDS_ACTIVITY');
    expect(screen.getByText('키즈·액티비티').closest('a')).toBeNull();
  });

  it('selected와 일치하는 카테고리는 선택 상태(aria-pressed)로 표시된다', () => {
    render(<QuickCategoryGrid selected="KIDS_ACTIVITY" onSelect={() => {}} />);

    const selectedButton = screen.getByText('키즈·액티비티').closest('button');
    const unselectedButton = screen.getByText('야외·자연').closest('button');

    expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    expect(unselectedButton).toHaveAttribute('aria-pressed', 'false');
  });

  it('이미지 로딩이 실패하면 카테고리 색상의 단색 원으로 대체한다(레이아웃 깨짐 방지)', () => {
    render(<QuickCategoryGrid selected={null} onSelect={() => {}} />);
    const kidsImage = screen.getByAltText('키즈·액티비티');

    fireEvent.error(kidsImage);

    expect(screen.queryByAltText('키즈·액티비티')).not.toBeInTheDocument();
    // 라벨은 여전히 표시되고, 색상 원(●) 폴백이 렌더링된다
    expect(screen.getByText('키즈·액티비티')).toBeInTheDocument();
    expect(screen.getByText('●')).toBeInTheDocument();
  });
});
