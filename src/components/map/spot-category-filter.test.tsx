import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpotCategoryFilter, MAX_SPOT_CATEGORY_MIN_SELECTION } from './spot-category-filter';

describe('SpotCategoryFilter', () => {
  it('핵심 중분류 칩(공원/문화센터/박물관/도서관/키즈카페/놀이터)이 1단으로 모두 노출된다', () => {
    render(
      <SpotCategoryFilter
        selectedCategoryIds={[]}
        onToggleCategory={vi.fn()}
        onLimitExceeded={vi.fn()}
        onSelectAiRecommend={vi.fn()}
      />
    );
    expect(screen.getByText(/공원/)).toBeInTheDocument();
    expect(screen.getByText(/문화센터\/문화의집/)).toBeInTheDocument();
    expect(screen.getByText(/박물관/)).toBeInTheDocument();
    expect(screen.getByText(/도서관/)).toBeInTheDocument();
    expect(screen.getByText(/키즈카페/)).toBeInTheDocument();
    expect(screen.getByText(/놀이터/)).toBeInTheDocument();
    // 체육시설/행정 대관류는 필터 목록에서 제외된다.
    expect(screen.queryByText(/테니스장/)).not.toBeInTheDocument();
    expect(screen.queryByText(/강당/)).not.toBeInTheDocument();
  });

  it('AI 추천 칩을 누르면 onSelectAiRecommend가 호출된다(다른 칩과 달리 선택 상태로 남지 않음)', () => {
    const onSelectAiRecommend = vi.fn();
    const onToggleCategory = vi.fn();
    render(
      <SpotCategoryFilter
        selectedCategoryIds={[]}
        onToggleCategory={onToggleCategory}
        onLimitExceeded={vi.fn()}
        onSelectAiRecommend={onSelectAiRecommend}
      />
    );
    fireEvent.click(screen.getByText(/AI 추천/));
    expect(onSelectAiRecommend).toHaveBeenCalledTimes(1);
    expect(onToggleCategory).not.toHaveBeenCalled();
  });

  it('일반 칩을 클릭하면 onToggleCategory가 칩 id로 호출된다', () => {
    const onToggleCategory = vi.fn();
    render(
      <SpotCategoryFilter
        selectedCategoryIds={[]}
        onToggleCategory={onToggleCategory}
        onLimitExceeded={vi.fn()}
        onSelectAiRecommend={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/도서관/));
    expect(onToggleCategory).toHaveBeenCalledWith('library');
  });

  it(`이미 ${MAX_SPOT_CATEGORY_MIN_SELECTION}개 선택된 상태에서 새 칩을 누르면 onLimitExceeded만 호출되고 onToggleCategory는 호출되지 않는다`, () => {
    const onToggleCategory = vi.fn();
    const onLimitExceeded = vi.fn();
    const fiveSelected = ['park', 'culture-center', 'museum', 'library', 'kids-cafe'];
    render(
      <SpotCategoryFilter
        selectedCategoryIds={fiveSelected}
        onToggleCategory={onToggleCategory}
        onLimitExceeded={onLimitExceeded}
        onSelectAiRecommend={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/놀이터/));
    expect(onLimitExceeded).toHaveBeenCalledTimes(1);
    expect(onToggleCategory).not.toHaveBeenCalled();
  });

  it('5개 선택된 상태에서 이미 선택된 칩(해제)은 제한과 무관하게 onToggleCategory가 호출된다', () => {
    const onToggleCategory = vi.fn();
    const onLimitExceeded = vi.fn();
    const fiveSelected = ['park', 'culture-center', 'museum', 'library', 'kids-cafe'];
    render(
      <SpotCategoryFilter
        selectedCategoryIds={fiveSelected}
        onToggleCategory={onToggleCategory}
        onLimitExceeded={onLimitExceeded}
        onSelectAiRecommend={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/도서관/));
    expect(onToggleCategory).toHaveBeenCalledWith('library');
    expect(onLimitExceeded).not.toHaveBeenCalled();
  });

  it('선택된 칩은 강조 스타일로 표시된다', () => {
    render(
      <SpotCategoryFilter
        selectedCategoryIds={['park']}
        onToggleCategory={vi.fn()}
        onLimitExceeded={vi.fn()}
        onSelectAiRecommend={vi.fn()}
      />
    );
    expect(screen.getByText(/^🌳 공원$/).className).toContain('bg-blue-600');
  });
});
