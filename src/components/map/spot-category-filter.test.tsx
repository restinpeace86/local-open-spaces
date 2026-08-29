import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpotCategoryFilter } from './spot-category-filter';

describe('SpotCategoryFilter', () => {
  it('핵심 중분류 칩(공원/문화센터/박물관/미술관/도서관/키즈카페/놀이터 등)이 1단으로 모두 노출된다', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);
    expect(screen.getByText(/공원/)).toBeInTheDocument();
    expect(screen.getByText(/문화센터\/문화의집/)).toBeInTheDocument();
    expect(screen.getByText(/^🏛️ 박물관$/)).toBeInTheDocument();
    expect(screen.getByText(/미술관/)).toBeInTheDocument();
    expect(screen.getByText(/도서관/)).toBeInTheDocument();
    expect(screen.getByText(/키즈카페/)).toBeInTheDocument();
    expect(screen.getByText(/놀이터/)).toBeInTheDocument();
    expect(screen.getByText(/자연휴양림/)).toBeInTheDocument();
    expect(screen.getByText(/육아종합지원센터/)).toBeInTheDocument();
    expect(screen.getByText(/유아교육진흥원/)).toBeInTheDocument();
    // 체육시설/행정 대관류는 필터 목록에서 제외된다.
    expect(screen.queryByText(/테니스장/)).not.toBeInTheDocument();
    expect(screen.queryByText(/강당/)).not.toBeInTheDocument();
  });

  it('AI 추천 칩을 누르면 onSelectAiRecommend가 호출된다(다른 칩과 달리 선택 상태로 남지 않음)', () => {
    const onSelectAiRecommend = vi.fn();
    const onSelectCategory = vi.fn();
    render(
      <SpotCategoryFilter
        selectedCategoryId={null}
        onSelectCategory={onSelectCategory}
        onSelectAiRecommend={onSelectAiRecommend}
      />
    );
    fireEvent.click(screen.getByText(/AI 추천/));
    expect(onSelectAiRecommend).toHaveBeenCalledTimes(1);
    expect(onSelectCategory).not.toHaveBeenCalled();
  });

  it('일반 칩을 클릭하면 onSelectCategory가 칩 id로 호출된다', () => {
    const onSelectCategory = vi.fn();
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={onSelectCategory} onSelectAiRecommend={vi.fn()} />);
    fireEvent.click(screen.getByText(/도서관/));
    expect(onSelectCategory).toHaveBeenCalledWith('library');
  });

  it('[단일 선택으로 변경](2026-08-29) 이미 선택된 칩을 다시 눌러도 onSelectCategory는 그대로 그 id로 호출된다(해제는 부모 상태에서 처리)', () => {
    const onSelectCategory = vi.fn();
    render(
      <SpotCategoryFilter selectedCategoryId="library" onSelectCategory={onSelectCategory} onSelectAiRecommend={vi.fn()} />
    );
    fireEvent.click(screen.getByText(/도서관/));
    expect(onSelectCategory).toHaveBeenCalledWith('library');
  });

  it('선택된 칩만 강조 스타일로 표시되고 다른 칩은 강조되지 않는다(단일 선택)', () => {
    render(<SpotCategoryFilter selectedCategoryId="park" onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);
    expect(screen.getByText(/^🌳 공원$/).className).toContain('bg-blue-600');
    expect(screen.getByText(/^📚 도서관$/).className).not.toContain('bg-blue-600');
  });
});
