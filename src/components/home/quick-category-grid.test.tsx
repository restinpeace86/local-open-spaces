import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuickCategoryGrid } from './quick-category-grid';

// Task 9-1-2: 이모지/단색 원 → 카테고리 대표 이미지 개편 검증
describe('QuickCategoryGrid', () => {
  it('5대 UI 카테고리 이미지와 라벨을 렌더링한다', () => {
    render(<QuickCategoryGrid />);

    const labels = ['체험·클래스', '야외·자연', '전시·박물관', '공연·축제', '키즈·액티비티'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    const kidsImage = screen.getByAltText('키즈·액티비티') as HTMLImageElement;
    expect(kidsImage.tagName).toBe('IMG');
    expect(kidsImage.src).toContain('kids-activity.svg');
  });

  it('클릭 시 /region?category=X로 연결한다', () => {
    render(<QuickCategoryGrid />);
    const link = screen.getByText('키즈·액티비티').closest('a');
    expect(link).toHaveAttribute('href', '/region?category=KIDS_ACTIVITY');
  });

  it('이미지 로딩이 실패하면 카테고리 색상의 단색 원으로 대체한다(레이아웃 깨짐 방지)', () => {
    render(<QuickCategoryGrid />);
    const kidsImage = screen.getByAltText('키즈·액티비티');

    fireEvent.error(kidsImage);

    expect(screen.queryByAltText('키즈·액티비티')).not.toBeInTheDocument();
    // 라벨은 여전히 표시되고, 색상 원(●) 폴백이 렌더링된다
    expect(screen.getByText('키즈·액티비티')).toBeInTheDocument();
    expect(screen.getByText('●')).toBeInTheDocument();
  });
});
