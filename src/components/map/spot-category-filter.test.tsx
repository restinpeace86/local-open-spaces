import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpotCategoryFilter } from './spot-category-filter';

// [todo.md 개선사항 6](2026-09-03 사용자 지시): "작년 8월 디자인(플랫 단일 탭) 대신, 4대
// 대분류 탭 + 클릭 시 바텀시트로 하위 중분류 노출 구조로 가는 것이 맞다"는 확인에 따라
// 2026-08-29 도입된 1단 플랫 칩 구조를 다시 2단(대분류 탭 → 바텀시트 중분류)으로
// 되돌린 뒤 검증한다.
//
// [테스트 작성 메모] 버튼 클릭은 getByRole('button', { name }) 로 찾는다 — 버튼 안에서
// 이모지와 라벨을 각각 별도 <span>으로 감싸면서(라벨만 단독으로 getByText 매칭 가능하게
// 하기 위함) 버튼 자신의 "직계 텍스트 노드"만 보는 getByText로는 더 이상 버튼 전체
// 문자열을 잡을 수 없어졌다 — 반면 접근성 이름(accessible name)은 중첩과 무관하게
// 자손 텍스트를 전부 합산하므로 getByRole이 더 견고하다.
describe('SpotCategoryFilter', () => {
  it('AI 추천 액션 + 4대 대분류 탭만 상시 노출되고, 중분류 칩은 바텀시트를 열기 전엔 보이지 않는다', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);
    expect(screen.getByRole('button', { name: /AI 추천/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '키즈/놀이시설' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '농장/체험' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '자연/공원' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '문화시설' })).toBeInTheDocument();
    // 요구사항 원문 노출 순서: 키즈/놀이시설 → 농장/체험 → 자연/공원 → 문화시설.
    const labels = screen.getAllByRole('button').map((el) => el.textContent);
    expect(labels.indexOf('🧸 키즈/놀이시설')).toBeLessThan(labels.indexOf('🌱 농장/체험'));
    expect(labels.indexOf('🌱 농장/체험')).toBeLessThan(labels.indexOf('🌳 자연/공원'));
    expect(labels.indexOf('🌳 자연/공원')).toBeLessThan(labels.indexOf('🏛️ 문화시설'));

    // 바텀시트를 열기 전에는 중분류 칩이 화면에 없다.
    expect(screen.queryByText('놀이터')).not.toBeInTheDocument();
    expect(screen.queryByText('도서관')).not.toBeInTheDocument();
  });

  it('AI 추천 버튼을 누르면 onSelectAiRecommend만 호출되고 바텀시트는 열리지 않는다', () => {
    const onSelectAiRecommend = vi.fn();
    const onSelectCategory = vi.fn();
    render(
      <SpotCategoryFilter selectedCategoryId={null} onSelectCategory={onSelectCategory} onSelectAiRecommend={onSelectAiRecommend} />
    );
    fireEvent.click(screen.getByRole('button', { name: /AI 추천/ }));
    expect(onSelectAiRecommend).toHaveBeenCalledTimes(1);
    expect(onSelectCategory).not.toHaveBeenCalled();
    expect(screen.queryByText('놀이터')).not.toBeInTheDocument();
  });

  it('대분류 탭을 누르면 그 대분류에 속한 중분류만 바텀시트에 노출된다', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '키즈/놀이시설' }));

    expect(screen.getByText('놀이터')).toBeInTheDocument();
    expect(screen.getByText('키즈카페')).toBeInTheDocument();
    expect(screen.getByText('키즈친화 식당')).toBeInTheDocument();
    // 다른 대분류(문화시설)의 중분류는 이 시트에 없다.
    expect(screen.queryByText('도서관')).not.toBeInTheDocument();
    expect(screen.queryByText('미술관')).not.toBeInTheDocument();
    // 체육시설/행정 대관류는 어느 시트에도 없다.
    expect(screen.queryByText('테니스장')).not.toBeInTheDocument();
  });

  it('농장/체험 대분류 바텀시트에는 캠핑장/체험휴양마을/교육농장/체험학습장이 노출된다', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '농장/체험' }));

    expect(screen.getByText('캠핑장')).toBeInTheDocument();
    expect(screen.getByText('체험휴양마을')).toBeInTheDocument();
    expect(screen.getByText('교육농장')).toBeInTheDocument();
    expect(screen.getByText('체험학습장')).toBeInTheDocument();
  });

  it('바텀시트에서 중분류를 클릭하면 onSelectCategory가 그 id로 호출되고 시트가 닫힌다', () => {
    const onSelectCategory = vi.fn();
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={onSelectCategory} onSelectAiRecommend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '문화시설' }));
    fireEvent.click(screen.getByRole('button', { name: '도서관' }));

    expect(onSelectCategory).toHaveBeenCalledWith('library');
    expect(screen.queryByText('도서관')).not.toBeInTheDocument(); // 시트가 닫혀 더 이상 보이지 않음
  });

  it('배경(오버레이)을 클릭하면 시트가 닫힌다', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '자연/공원' }));
    expect(screen.getByText('공원')).toBeInTheDocument();

    // 시트 콘텐츠 바깥의 오버레이 배경을 클릭한다.
    fireEvent.click(screen.getByTestId('spot-category-sheet'));
    expect(screen.queryByText('공원')).not.toBeInTheDocument();
  });

  it('선택된 중분류가 속한 대분류 탭에는 대분류 라벨 대신 선택된 중분류 라벨이 표시된다', () => {
    render(<SpotCategoryFilter selectedCategoryId="library" onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);
    expect(screen.getByRole('button', { name: '도서관' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '문화시설' })).not.toBeInTheDocument();
  });

  // [개선사항 6] "바텀시트 내에서 나오는 중분류에 대하여 데이터가 0건인 중분류는
  // 중분류항목에서 제외할 것".
  it('categoryMinCounts에서 0건인 중분류는 바텀시트에서 제외된다', () => {
    const counts: Record<string, number> = {
      공원: 0,
      자연휴양림: 5,
      수목원: 0,
      생태공원: 0,
    };
    render(
      <SpotCategoryFilter
        selectedCategoryId={null}
        onSelectCategory={vi.fn()}
        onSelectAiRecommend={vi.fn()}
        categoryMinCounts={counts}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '자연/공원' }));

    expect(screen.queryByText('공원')).not.toBeInTheDocument();
    expect(screen.getByText('자연휴양림')).toBeInTheDocument();
    expect(screen.queryByText('수목원')).not.toBeInTheDocument();
    expect(screen.queryByText('생태공원')).not.toBeInTheDocument();
  });

  it('categoryMinCounts가 없으면(조회 전) 모든 중분류를 노출한다', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '자연/공원' }));

    expect(screen.getByText('공원')).toBeInTheDocument();
    expect(screen.getByText('자연휴양림')).toBeInTheDocument();
    expect(screen.getByText('수목원')).toBeInTheDocument();
    expect(screen.getByText('생태공원')).toBeInTheDocument();
  });
});
