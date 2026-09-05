import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpotCategoryFilter } from './spot-category-filter';
import { NearbyItem } from '@/lib/spaces/get-nearby';

function makeSpaceItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'space-1',
    name: '동네도서관',
    category: 'CULTURE',
    distance_meters: 500,
    item_type: 'SPACE',
    lng: 127.12,
    lat: 37.38,
    address: null,
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: true,
    info_url: null,
    is_kids_friendly: null,
    has_parking: null,
    stroller_accessible: null,
    facility_type: null,
    target_age_group: null,
    booking_status: null,
    ...overrides,
  };
}

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

    // [스팟픽 첫 진입 시 AI 추천 오탭 방지](2026-09-05 사용자 지시): "AI 추천을 2번째나
    // 3번째로 미루고" — 맨 앞(1번째)이 아니라 대분류 2개 뒤인 3번째 자리에 있어야 한다.
    const aiIndex = labels.findIndex((l) => l?.includes('AI 추천'));
    expect(aiIndex).toBe(2);
    expect(labels.indexOf('🧸 키즈/놀이시설')).toBeLessThan(aiIndex);
    expect(labels.indexOf('🌱 농장/체험')).toBeLessThan(aiIndex);
    expect(aiIndex).toBeLessThan(labels.indexOf('🌳 자연/공원'));

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

  // [표준 중분류 동기화](2026-09-05 사용자 지시): 어드민 정의(category-min-groups.ts)
  // 기준으로 캠핑장은 자연/공원, 체험학습장은 키즈/놀이시설로 재배정돼 농장/체험에는
  // 체험휴양마을/교육농장 2종만 남는다(spot-category-groups.ts 상단 코멘트 참고).
  it('농장/체험 대분류 바텀시트에는 체험휴양마을/교육농장이 노출된다', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '농장/체험' }));

    expect(screen.getByText('체험휴양마을')).toBeInTheDocument();
    expect(screen.getByText('교육농장')).toBeInTheDocument();
    // 어드민 기준 이 대분류 소속이 아닌 값들.
    expect(screen.queryByText('캠핑장')).not.toBeInTheDocument();
    expect(screen.queryByText('체험학습장')).not.toBeInTheDocument();
  });

  // [개선사항5 - 스팟픽 중분류 바텀시트 재구성](2026-09-04): "대분류를 눌러서 뜬
  // 바텀시트는 닫히지 않고 그대로 유지" — 중분류를 선택해도 시트가 자동으로 닫히지
  // 않아야 이어서 다른 중분류를 바로 둘러볼 수 있다(과거엔 매번 다시 열어야 했다).
  it('바텀시트에서 중분류를 클릭하면 onSelectCategory가 그 id로 호출되고, 시트는 닫히지 않고 유지된다', () => {
    const onSelectCategory = vi.fn();
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={onSelectCategory} onSelectAiRecommend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '문화시설' }));
    fireEvent.click(screen.getByRole('button', { name: '도서관' }));

    expect(onSelectCategory).toHaveBeenCalledWith('library');
    expect(screen.getByText('도서관')).toBeInTheDocument(); // 시트가 유지되어 계속 보임
    expect(screen.getByTestId('spot-category-sheet')).toBeInTheDocument();
  });

  // [개선사항5] "시트 상단(또는 고정 영역)에는 해당 대분류에 속한 여러 개의 중분류
  // 칩/버튼들이 나란히 위치. 유저가 바로 옆의 중분류로 바꾸면 시트는 그대로 열려 있는
  // 상태에서 내용만 즉시 전환" — 대분류 전환도 동일 원칙: 시트를 닫지 않고 시트 안의
  // 대분류 탭으로 바로 전환할 수 있어야 한다(바깥 탭 행은 이 시트가 화면 전체를 덮어
  // 가려서 누를 수 없다 — 시트 안에도 같은 탭을 둔 이유).
  it('시트가 열린 채로 내부 대분류 탭을 눌러 다른 대분류로 즉시 전환할 수 있다(시트를 닫지 않음)', () => {
    render(<SpotCategoryFilter selectedCategoryId={null} onSelectCategory={vi.fn()} onSelectAiRecommend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '농장/체험' }));
    expect(screen.getByText('체험휴양마을')).toBeInTheDocument();

    const sheet = screen.getByTestId('spot-category-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: '문화시설' }));

    expect(screen.getByText('도서관')).toBeInTheDocument();
    expect(screen.queryByText('체험휴양마을')).not.toBeInTheDocument();
    expect(screen.getByTestId('spot-category-sheet')).toBeInTheDocument(); // 계속 같은 시트가 열려 있음
  });

  // [개선사항5] "유저가 중분류 A를 누르면 바텀시트 내부 하단 영역에 데이터 목록이 뜸" —
  // 스팟픽은 배경이 지도라 시트가 화면을 덮으면 지도/목록을 볼 수 없으므로, 현재
  // 선택된 중분류의 결과를 시트 안에도 함께 보여준다(부모가 이미 필터링해 내려주는
  // items를 그대로 재사용 — 새 조회 로직 없음).
  it('선택된 중분류와 일치하는 결과를 시트 안에 함께 보여주고, 항목을 고르면 onSelectItem 호출 후 시트가 닫힌다', () => {
    const onSelectItem = vi.fn();
    const items = [makeSpaceItem({ id: 'space-1', name: '동네도서관' })];
    render(
      <SpotCategoryFilter
        selectedCategoryId="library"
        onSelectCategory={vi.fn()}
        onSelectAiRecommend={vi.fn()}
        items={items}
        onSelectItem={onSelectItem}
      />
    );

    // 이미 선택된 중분류는 대분류 자리에 라벨로 표시된다(기존 관례) — 그 탭을 눌러 시트를 연다.
    fireEvent.click(screen.getByRole('button', { name: '도서관' }));

    expect(screen.getByText('1건을 찾았어요')).toBeInTheDocument();
    expect(screen.getByText('동네도서관')).toBeInTheDocument();

    fireEvent.click(screen.getByText('동네도서관'));
    expect(onSelectItem).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByTestId('spot-category-sheet')).not.toBeInTheDocument(); // 시트가 닫힘
  });

  it('결과 로딩 중에는 "불러오는 중..." 안내를 보여준다', () => {
    render(
      <SpotCategoryFilter
        selectedCategoryId="library"
        onSelectCategory={vi.fn()}
        onSelectAiRecommend={vi.fn()}
        items={[]}
        isItemsLoading
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '도서관' }));
    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
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
