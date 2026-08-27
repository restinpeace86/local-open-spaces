import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MajorCategoryGrid } from './major-category-grid';

// [대분류·중분류 드릴다운 개편](2026-08-27 사용자 지시): 7대 대분류(category_maj) 아이콘 →
// 선택 시 중분류(category_min) 칩 목록 → 중분류 선택 시 실제 조회 콜백 호출.
describe('MajorCategoryGrid', () => {
  it('7대 대분류 라벨을 렌더링한다', () => {
    render(
      <MajorCategoryGrid selectedMaj={null} onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    const labels = ['자연 / 캠핑', '공공 키즈카페', '체험 / 농장', '축제 / 이벤트', '문화 / 전시', '배움 / 클래스', '스포츠 대여'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('대분류를 선택하기 전에는 중분류 칩이 보이지 않는다', () => {
    render(
      <MajorCategoryGrid selectedMaj={null} onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
  });

  it('대분류 클릭 시 onSelectMaj가 호출되고, 대분류가 선택되면 그 중분류 칩이 나타난다', () => {
    const onSelectMaj = vi.fn();
    const { rerender } = render(
      <MajorCategoryGrid selectedMaj={null} onSelectMaj={onSelectMaj} selectedMin={null} onSelectMin={() => {}} />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(onSelectMaj).toHaveBeenCalledWith('체험 / 농장');

    rerender(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={onSelectMaj}
        selectedMin={null}
        onSelectMin={() => {}}
      />
    );
    expect(screen.getByText('도시농업')).toBeInTheDocument();
    expect(screen.getByText('농장체험')).toBeInTheDocument();
    // 다른 대분류의 중분류는 나타나지 않는다.
    expect(screen.queryByText('캠핑장')).not.toBeInTheDocument();
  });

  it('중분류 클릭 시 onSelectMin(중분류값)이 호출된다', () => {
    const onSelectMin = vi.fn();
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin={null}
        onSelectMin={onSelectMin}
      />
    );

    fireEvent.click(screen.getByText('도시농업'));
    expect(onSelectMin).toHaveBeenCalledWith('도시농업');
  });

  it('선택된 대분류/중분류는 aria-pressed=true로 표시된다', () => {
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
      />
    );

    expect(screen.getByText('체험 / 농장').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('축제 / 이벤트').closest('button')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('도시농업').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('농장체험').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });
});
