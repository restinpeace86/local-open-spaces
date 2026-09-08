import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SpotCategoryFilter } from './spot-category-filter';
import { NearbyItem } from '@/lib/spaces/get-nearby';
import { ServiceCategory } from '@/lib/admin/service-category';

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

// [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08 사용자 지시): 실측
// service_categories 데이터(2026-09-08 확인)와 동일한 4개 대분류 구조를 그대로
// 축약해 픽스처로 쓴다.
const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 'sc-playground', parent_category: '키즈/놀이시설', category_name: '야외 놀이터 / 액티비티' },
  { id: 'sc-kidscafe', parent_category: '키즈/놀이시설', category_name: '키즈카페 / 실내놀이터' },
  { id: 'sc-restaurant', parent_category: '키즈/놀이시설', category_name: '키즈친화 식당(놀이시설 포함)' },
  { id: 'sc-farm', parent_category: '농장/체험', category_name: '체험농장·농원' },
  { id: 'sc-village', parent_category: '농장/체험', category_name: '휴양마을' },
  { id: 'sc-park', parent_category: '자연/공원', category_name: '대형 근린공원 / 잔디광장' },
  { id: 'sc-library', parent_category: '문화시설', category_name: '어린이 도서관' },
];

// 매번 넘겨야 하는 필수 prop을 한 곳에 모아둔다(테스트별로 필요한 것만 덮어쓴다).
function baseProps() {
  return {
    serviceCategories: SERVICE_CATEGORIES,
    selectedCategoryId: null as string | null,
    onSelectCategory: vi.fn(),
    onSelectAiRecommend: vi.fn(),
    sheetRadiusKm: 10,
    onSelectSheetRadiusKm: vi.fn(),
  };
}

// [todo.md 개선사항 6](2026-09-03 사용자 지시): "작년 8월 디자인(플랫 단일 탭) 대신, 4대
// 대분류 탭 + 클릭 시 바텀시트로 하위 중분류 노출 구조로 가는 것이 맞다"는 확인에 따라
// 도입된 2단(대분류 탭 → 바텀시트 중분류) 구조를, 이번에 데이터 출처만 노출 중분류
// (service_categories)로 바꿔 검증한다. UX 골격 자체(대분류→시트→중분류→결과)는
// 그대로다(제5장 제4조).
//
// [테스트 작성 메모] 버튼 클릭은 getByRole('button', { name }) 로 찾는다 — 접근성
// 이름은 중첩(이모지/라벨 별도 span)과 무관하게 자손 텍스트를 전부 합산하므로 더 견고하다.
describe('SpotCategoryFilter', () => {
  it('AI 추천 액션 + 4대 대분류 탭만 상시 노출되고, 중분류 칩은 바텀시트를 열기 전엔 보이지 않는다', () => {
    render(<SpotCategoryFilter {...baseProps()} />);
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

    const aiIndex = labels.findIndex((l) => l?.includes('AI 추천'));
    expect(aiIndex).toBe(2);
    expect(labels.indexOf('🧸 키즈/놀이시설')).toBeLessThan(aiIndex);
    expect(labels.indexOf('🌱 농장/체험')).toBeLessThan(aiIndex);
    expect(aiIndex).toBeLessThan(labels.indexOf('🌳 자연/공원'));

    // 바텀시트를 열기 전에는 중분류 칩이 화면에 없다.
    expect(screen.queryByText('키즈카페 / 실내놀이터')).not.toBeInTheDocument();
    expect(screen.queryByText('어린이 도서관')).not.toBeInTheDocument();
  });

  it('AI 추천 버튼을 누르면 onSelectAiRecommend만 호출되고 바텀시트는 열리지 않는다', () => {
    const props = baseProps();
    render(<SpotCategoryFilter {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /AI 추천/ }));
    expect(props.onSelectAiRecommend).toHaveBeenCalledTimes(1);
    expect(props.onSelectCategory).not.toHaveBeenCalled();
    expect(screen.queryByText('키즈카페 / 실내놀이터')).not.toBeInTheDocument();
  });

  it('대분류 탭을 누르면 그 대분류에 속한 중분류만 바텀시트에 노출된다', () => {
    render(<SpotCategoryFilter {...baseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: '키즈/놀이시설' }));

    expect(screen.getByText('야외 놀이터 / 액티비티')).toBeInTheDocument();
    expect(screen.getByText('키즈카페 / 실내놀이터')).toBeInTheDocument();
    expect(screen.getByText('키즈친화 식당(놀이시설 포함)')).toBeInTheDocument();
    // 다른 대분류(문화시설/농장·체험)의 중분류는 이 시트에 없다.
    expect(screen.queryByText('어린이 도서관')).not.toBeInTheDocument();
    expect(screen.queryByText('휴양마을')).not.toBeInTheDocument();
  });

  // [대분류 바텀시트가 '주변 목록 보기' 시트에 가려지는 문제 수정](2026-09-05 사용자
  // 지시) — createPortal로 document.body에 직접 렌더링해 조상의 스택 컨텍스트에
  // 갇히지 않는지 재확인한다.
  it('스택 컨텍스트를 만드는 조상 안에 있어도, 바텀시트는 document.body로 포탈 렌더링돼 갇히지 않는다', () => {
    render(
      <div data-testid="fake-stacking-context-wrapper" style={{ position: 'absolute', zIndex: 10 }}>
        <SpotCategoryFilter {...baseProps()} />
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: '자연/공원' }));

    const sheet = screen.getByTestId('spot-category-sheet');
    expect(sheet.closest('[data-testid="fake-stacking-context-wrapper"]')).toBeNull();
    expect(sheet.parentElement).toBe(document.body);
  });

  it('농장/체험 대분류 바텀시트에는 체험농장·농원/휴양마을이 노출된다', () => {
    render(<SpotCategoryFilter {...baseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: '농장/체험' }));

    expect(screen.getByText('체험농장·농원')).toBeInTheDocument();
    expect(screen.getByText('휴양마을')).toBeInTheDocument();
    expect(screen.queryByText('어린이 도서관')).not.toBeInTheDocument();
  });

  // [개선사항5 - 스팟픽 중분류 바텀시트 재구성](2026-09-04): "대분류를 눌러서 뜬
  // 바텀시트는 닫히지 않고 그대로 유지" — 중분류를 선택해도 시트가 자동으로 닫히지
  // 않아야 이어서 다른 중분류를 바로 둘러볼 수 있다.
  it('바텀시트에서 중분류를 클릭하면 onSelectCategory가 그 id로 호출되고, 시트는 닫히지 않고 유지된다', () => {
    const props = baseProps();
    render(<SpotCategoryFilter {...props} />);

    fireEvent.click(screen.getByRole('button', { name: '문화시설' }));
    fireEvent.click(screen.getByRole('button', { name: '어린이 도서관' }));

    expect(props.onSelectCategory).toHaveBeenCalledWith('sc-library');
    expect(screen.getByText('어린이 도서관')).toBeInTheDocument(); // 시트가 유지되어 계속 보임
    expect(screen.getByTestId('spot-category-sheet')).toBeInTheDocument();
  });

  it('시트가 열린 채로 내부 대분류 탭을 눌러 다른 대분류로 즉시 전환할 수 있다(시트를 닫지 않음)', () => {
    render(<SpotCategoryFilter {...baseProps()} />);

    fireEvent.click(screen.getByRole('button', { name: '농장/체험' }));
    expect(screen.getByText('휴양마을')).toBeInTheDocument();

    const sheet = screen.getByTestId('spot-category-sheet');
    fireEvent.click(within(sheet).getByRole('button', { name: '문화시설' }));

    expect(screen.getByText('어린이 도서관')).toBeInTheDocument();
    expect(screen.queryByText('휴양마을')).not.toBeInTheDocument();
    expect(screen.getByTestId('spot-category-sheet')).toBeInTheDocument(); // 계속 같은 시트가 열려 있음
  });

  it('선택된 중분류와 일치하는 결과를 시트 안에 함께 보여주고, 항목을 고르면 onSelectItem 호출 후 시트가 닫힌다', () => {
    const onSelectItem = vi.fn();
    const items = [makeSpaceItem({ id: 'space-1', name: '동네도서관' })];
    render(
      <SpotCategoryFilter
        {...baseProps()}
        selectedCategoryId="sc-library"
        items={items}
        onSelectItem={onSelectItem}
      />
    );

    // 이미 선택된 중분류는 대분류 자리에 라벨로 표시된다(기존 관례) — 그 탭을 눌러 시트를 연다.
    fireEvent.click(screen.getByRole('button', { name: '어린이 도서관' }));

    expect(screen.getByText('1건을 찾았어요')).toBeInTheDocument();
    expect(screen.getByText('동네도서관')).toBeInTheDocument();

    fireEvent.click(screen.getByText('동네도서관'));
    expect(onSelectItem).toHaveBeenCalledWith(items[0]);
    expect(screen.queryByTestId('spot-category-sheet')).not.toBeInTheDocument(); // 시트가 닫힘
  });

  it('결과 로딩 중에는 "불러오는 중..." 안내를 보여준다', () => {
    render(<SpotCategoryFilter {...baseProps()} selectedCategoryId="sc-library" items={[]} isItemsLoading />);
    fireEvent.click(screen.getByRole('button', { name: '어린이 도서관' }));
    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
  });

  it('배경(오버레이)을 클릭하면 시트가 닫힌다', () => {
    render(<SpotCategoryFilter {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: '자연/공원' }));
    expect(screen.getByText('대형 근린공원 / 잔디광장')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('spot-category-sheet'));
    expect(screen.queryByText('대형 근린공원 / 잔디광장')).not.toBeInTheDocument();
  });

  it('선택된 중분류가 속한 대분류 탭에는 대분류 라벨 대신 선택된 중분류 라벨이 표시된다', () => {
    render(<SpotCategoryFilter {...baseProps()} selectedCategoryId="sc-library" />);
    expect(screen.getByRole('button', { name: '어린이 도서관' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '문화시설' })).not.toBeInTheDocument();
  });

  // [개선사항 6] "바텀시트 내에서 나오는 중분류에 대하여 데이터가 0건인 중분류는
  // 중분류항목에서 제외할 것" — counts는 이제 category_min이 아니라 service_categories.id
  // 기준이다.
  it('serviceCategoryCounts에서 0건인 중분류는 바텀시트에서 제외된다', () => {
    const counts: Record<string, number> = {
      'sc-park': 0,
      'sc-farm': 5,
      'sc-village': 0,
    };
    render(<SpotCategoryFilter {...baseProps()} serviceCategoryCounts={counts} />);
    fireEvent.click(screen.getByRole('button', { name: '농장/체험' }));

    expect(screen.getByText('체험농장·농원')).toBeInTheDocument();
    expect(screen.queryByText('휴양마을')).not.toBeInTheDocument();
  });

  it('serviceCategoryCounts가 없으면(조회 전) 모든 중분류를 노출한다', () => {
    render(<SpotCategoryFilter {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: '농장/체험' }));

    expect(screen.getByText('체험농장·농원')).toBeInTheDocument();
    expect(screen.getByText('휴양마을')).toBeInTheDocument();
  });

  // [바텀시트 반경 선택](2026-09-08 사용자 지시): "반경 5km 혹은 10km 내 20km 내에
  // 거리순으로 보이도록.. 거리 눌러서 적용할수있게" — 중분류를 선택했을 때만 의미가
  // 있으므로 아직 선택 전이면 숨긴다.
  describe('반경 선택(개선사항3-1)', () => {
    it('중분류를 아직 선택하지 않았으면 반경 선택 칩이 보이지 않는다', () => {
      render(<SpotCategoryFilter {...baseProps()} />);
      fireEvent.click(screen.getByRole('button', { name: '문화시설' }));

      expect(screen.queryByRole('button', { name: '5km' })).not.toBeInTheDocument();
    });

    it('중분류를 선택하면 반경 선택 칩(5/10/20km)이 나타나고, 현재 선택값이 강조된다', () => {
      render(<SpotCategoryFilter {...baseProps()} selectedCategoryId="sc-library" sheetRadiusKm={10} />);
      fireEvent.click(screen.getByRole('button', { name: '어린이 도서관' }));

      expect(screen.getByRole('button', { name: '5km' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '20km' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '10km' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '5km' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('반경 칩을 누르면 onSelectSheetRadiusKm이 그 값으로 호출된다', () => {
      const props = baseProps();
      render(<SpotCategoryFilter {...props} selectedCategoryId="sc-library" />);
      fireEvent.click(screen.getByRole('button', { name: '어린이 도서관' }));

      fireEvent.click(screen.getByRole('button', { name: '20km' }));
      expect(props.onSelectSheetRadiusKm).toHaveBeenCalledWith(20);
    });
  });
});
