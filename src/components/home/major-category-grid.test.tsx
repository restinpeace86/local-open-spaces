import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MajorCategoryGrid } from './major-category-grid';
import { NearbyItem } from '@/lib/spaces/get-nearby';

function nearbyItem(overrides: Partial<NearbyItem> = {}): NearbyItem {
  return {
    id: 'item-1',
    name: '테스트 결과',
    category: 'EXPERIENCE_CLASS',
    category_min: '도시농업',
    distance_meters: 500,
    item_type: 'EVENT',
    lng: 127,
    lat: 37.5,
    address: null,
    thumbnail_url: null,
    start_date: null,
    end_date: null,
    reservation_start_date: null,
    reservation_end_date: null,
    reservation_url: null,
    is_reservation_required: null,
    operating_hours: null,
    is_free: null,
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

// [대분류·중분류 드릴다운 개편](2026-08-27 사용자 지시): 7대 대분류(category_maj) 아이콘 →
// 선택 시 중분류(category_min) 칩 목록 → 중분류 선택 시 실제 조회 콜백 호출.
// [대분류/중분류 선택 UI 바텀시트 개편](2026-09-01 사용자 지시): 중분류 칩 목록이 그리드
// 아래 인라인이 아니라 바텀시트로 뜨도록 바뀌어 아래 테스트도 그에 맞게 갱신한다.
// [이벤트픽 대분류 6종으로 축소](2026-09-04 사용자 지시): "스포츠 대여"는 15개 중분류 중
// 12개가 항상 0건이라 사실상 작동하지 않아 제거했다(category-maj-meta.ts 참고) — 6대
// 대분류만 남는다.
describe('MajorCategoryGrid', () => {
  it('6대 대분류 라벨을 렌더링한다', () => {
    render(
      <MajorCategoryGrid selectedMaj={null} onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    const labels = ['자연 / 캠핑', '키즈놀이터', '체험 / 농장', '축제 / 이벤트', '문화 / 전시', '배움 / 클래스'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('스포츠 대여')).not.toBeInTheDocument();
  });

  it('대분류를 선택하기 전에는 중분류 바텀시트가 보이지 않는다', () => {
    render(
      <MajorCategoryGrid selectedMaj={null} onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
  });

  it('대분류를 이미 선택한 상태로 마운트돼도(클릭 이벤트 없이) 시트는 자동으로 열리지 않는다', () => {
    // 바텀시트 오픈 여부는 프롭(selectedMaj)이 아니라 클릭이라는 사용자 행동에 연결된
    // 로컬 상태다 — 다른 화면 상태 복원 등으로 selectedMaj만 채워진 채 마운트되는 경우
    // 시트가 갑자기 열려버리면 안 된다.
    render(
      <MajorCategoryGrid selectedMaj="체험 / 농장" onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );
    expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
  });

  it('대분류 클릭 시 onSelectMaj가 호출되고 바텀시트가 열려 그 중분류 칩이 나타난다', () => {
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
    // 기존 EventBrowseSheet/AiRecommendSheet와 동일한 바텀시트 패턴(제목 + ✕ 닫기)인지 확인.
    expect(screen.getByLabelText('닫기')).toBeInTheDocument();
  });

  // 아래 시트 상호작용 테스트들은 selectedMaj를 처음부터 "체험 / 농장"으로 넘긴다 —
  // MajorCategoryGrid는 selectedMaj를 부모(HomeView)가 소유하는 controlled prop으로만
  // 받으므로, onSelectMaj를 no-op으로 두면 클릭해도 prop이 바뀌지 않아(실제 부모라면
  // 리렌더로 반영됨) activeOption이 계속 null로 남는다 — 아이콘 클릭은 isSheetOpen만
  // 토글하는 용도로만 쓴다.
  // [바텀시트 구조 복구 및 재적용](2026-09-04 사용자 지시): "중분류를 고르면 데이터가
  // 바텀시트가 아니라 이벤트픽 화면에서 나온다"는 지적에 따라, 이제 중분류를 골라도
  // 시트를 닫지 않는다(결과를 같은 시트 안에서 보여줘야 하므로) — 예전에는 선택 즉시
  // 시트가 닫혔었다(과거 동작을 이 테스트 이름으로 남겨 대조한다).
  it('중분류 클릭 시 onSelectMin(중분류값)이 호출되지만, 시트는 닫히지 않고 그대로 열려 있다', () => {
    const onSelectMin = vi.fn();
    render(
      <MajorCategoryGrid selectedMaj="체험 / 농장" onSelectMaj={() => {}} selectedMin={null} onSelectMin={onSelectMin} />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    fireEvent.click(screen.getByText('도시농업'));

    expect(onSelectMin).toHaveBeenCalledWith('도시농업');
    expect(screen.getByText('도시농업')).toBeInTheDocument(); // 시트가 열린 채 칩도 그대로 보인다
    expect(screen.getByLabelText('닫기')).toBeInTheDocument();
  });

  it('✕ 버튼을 누르면 시트가 닫힌다', () => {
    render(
      <MajorCategoryGrid selectedMaj="체험 / 농장" onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('도시농업')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('닫기'));
    expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
  });

  it('배경을 클릭하면 시트가 닫힌다', () => {
    const { container } = render(
      <MajorCategoryGrid selectedMaj="체험 / 농장" onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('도시농업')).toBeInTheDocument();

    // 시트 콘텐츠 클릭은 stopPropagation되므로, 오버레이 배경(가장 바깥 fixed 컨테이너)을 직접 클릭한다.
    const overlay = container.querySelector('.fixed.inset-0');
    fireEvent.click(overlay!);
    expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
  });

  it('같은 대분류를 다시 클릭하면 시트가 다시 열린다', () => {
    render(
      <MajorCategoryGrid selectedMaj="체험 / 농장" onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('도시농업')).toBeInTheDocument();
  });

  it('선택된 대분류 아이콘과 시트 안 선택된 중분류 칩은 aria-pressed=true로 표시된다', () => {
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

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('도시농업').closest('button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('농장체험').closest('button')).toHaveAttribute('aria-pressed', 'false');
  });

  // [todo.md 개선사항 3](2026-09-03) 실측으로 발견한 버그: 일부 중분류(예: "교양/어학")는
  // is_active+가족·아동 대상+진행중 조건을 동시에 만족하는 행이 구조적으로 0건이라
  // 눌러도 영원히 결과가 안 나와 고장처럼 보였다 — categoryCounts가 주어지면 0건인
  // 중분류는 칩 목록에서 아예 숨긴다.
  it('categoryCounts에서 0건인 중분류는 칩 목록에서 제외된다', () => {
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin={null}
        onSelectMin={() => {}}
        categoryCounts={{ 도시농업: 0, 농장체험: 5, '자연/과학': 3 }}
      />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.queryByText('도시농업')).not.toBeInTheDocument();
    expect(screen.getByText('농장체험')).toBeInTheDocument();
  });

  it('categoryCounts에 값이 없는(undefined) 중분류는 보수적으로 계속 노출한다', () => {
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin={null}
        onSelectMin={() => {}}
        categoryCounts={{ 농장체험: 5 }}
      />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('도시농업')).toBeInTheDocument();
  });

  it('categoryCounts가 아직 로드되지 않았으면(undefined) 전부 노출한다', () => {
    render(
      <MajorCategoryGrid selectedMaj="체험 / 농장" onSelectMaj={() => {}} selectedMin={null} onSelectMin={() => {}} />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('도시농업')).toBeInTheDocument();
    expect(screen.getByText('농장체험')).toBeInTheDocument();
  });
});

// [바텀시트 구조 복구 및 재적용](2026-09-04 사용자 지시): 중분류 선택 결과 카드를 이제
// 이 시트 안(칩 목록 바로 아래)에 그린다 — 시트 밖(HomeView 본문)에는 더 이상 그리지
// 않는다.
describe('MajorCategoryGrid — 결과 피드를 시트 안에 렌더링 (2026-09-04)', () => {
  it('selectedMin이 있고 결과가 있으면 시트 안에 카드를 렌더링한다', () => {
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={[nearbyItem({ id: 'r1', name: '도시농업 체험 행사' })]}
        isCategoryFeedLoading={false}
      />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('도시농업 체험 행사')).toBeInTheDocument();
    // 칩과 결과 카드가 같은 시트(✕ 닫기 버튼이 있는 컨테이너) 안에 함께 있어야 한다.
    expect(screen.getByLabelText('닫기')).toBeInTheDocument();
  });

  it('selectedMin이 있고 로딩 중이면 스켈레톤을 보여준다(결과 카드는 아직 없음)', () => {
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={null}
        isCategoryFeedLoading={true}
      />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.queryByText('도시농업 체험 행사')).not.toBeInTheDocument();
  });

  it('selectedMin이 있고 결과가 0건이면 안내 문구를 보여준다', () => {
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={[]}
        isCategoryFeedLoading={false}
      />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.getByText('조건에 맞는 행사를 찾는 중입니다.')).toBeInTheDocument();
  });

  it('selectedMin이 없으면(아직 중분류를 안 골랐으면) 결과 영역 자체가 없다', () => {
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin={null}
        onSelectMin={() => {}}
        categoryFeedItems={[nearbyItem({ id: 'r1', name: '도시농업 체험 행사' })]}
        isCategoryFeedLoading={false}
      />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    expect(screen.queryByText('도시농업 체험 행사')).not.toBeInTheDocument();
  });

  it('결과 카드를 누르면 onSelectResultItem이 그 아이템으로 호출된다', () => {
    const onSelectResultItem = vi.fn();
    const item = nearbyItem({ id: 'r1', name: '도시농업 체험 행사' });
    render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={[item]}
        isCategoryFeedLoading={false}
        onSelectResultItem={onSelectResultItem}
      />
    );

    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);
    fireEvent.click(screen.getByText('도시농업 체험 행사'));
    expect(onSelectResultItem).toHaveBeenCalledWith(item);
  });
});

// [무한 스크롤 도입](2026-09-04 사용자 지시): "더보기 버튼 말고 무한 스크롤로" — 시트
// 스크롤 컨테이너가 바닥 근처에 닿으면 onLoadMoreCategoryFeed를 호출하는지 검증한다.
// jsdom은 실제 레이아웃을 계산하지 않아 scrollHeight/clientHeight가 항상 0이므로,
// Object.defineProperty로 값을 직접 주입해 "바닥에 가까움"/"아직 멀음" 상황을 재현한다.
describe('MajorCategoryGrid — 결과 무한 스크롤 (2026-09-04)', () => {
  function fireScrollNearBottom(container: Element, overrides: Partial<{ scrollHeight: number; scrollTop: number; clientHeight: number }> = {}) {
    const el = container.querySelector('.overflow-y-auto')!;
    const values = { scrollHeight: 1000, scrollTop: 900, clientHeight: 100, ...overrides };
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(el, key, { value, configurable: true });
    }
    fireEvent.scroll(el);
  }

  it('바닥 근처까지 스크롤하면 onLoadMoreCategoryFeed를 호출한다(더 볼 결과가 있을 때)', () => {
    const onLoadMoreCategoryFeed = vi.fn();
    const { container } = render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={[nearbyItem({ id: 'r1', name: '도시농업 체험 행사' })]}
        isCategoryFeedLoading={false}
        categoryFeedHasMore={true}
        onLoadMoreCategoryFeed={onLoadMoreCategoryFeed}
      />
    );
    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);

    fireScrollNearBottom(container, { scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }); // 남은 거리 0px

    expect(onLoadMoreCategoryFeed).toHaveBeenCalledTimes(1);
  });

  it('아직 바닥에서 멀면 onLoadMoreCategoryFeed를 호출하지 않는다', () => {
    const onLoadMoreCategoryFeed = vi.fn();
    const { container } = render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={[nearbyItem({ id: 'r1', name: '도시농업 체험 행사' })]}
        isCategoryFeedLoading={false}
        categoryFeedHasMore={true}
        onLoadMoreCategoryFeed={onLoadMoreCategoryFeed}
      />
    );
    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);

    fireScrollNearBottom(container, { scrollHeight: 1000, scrollTop: 300, clientHeight: 100 }); // 남은 거리 600px

    expect(onLoadMoreCategoryFeed).not.toHaveBeenCalled();
  });

  it('더 볼 결과가 없으면(hasMore=false) 바닥에 닿아도 호출하지 않는다', () => {
    const onLoadMoreCategoryFeed = vi.fn();
    const { container } = render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={[nearbyItem({ id: 'r1', name: '도시농업 체험 행사' })]}
        isCategoryFeedLoading={false}
        categoryFeedHasMore={false}
        onLoadMoreCategoryFeed={onLoadMoreCategoryFeed}
      />
    );
    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);

    fireScrollNearBottom(container);

    expect(onLoadMoreCategoryFeed).not.toHaveBeenCalled();
  });

  it('이미 다음 페이지를 불러오는 중이면(isCategoryFeedLoadingMore=true) 중복 호출하지 않는다', () => {
    const onLoadMoreCategoryFeed = vi.fn();
    const { container } = render(
      <MajorCategoryGrid
        selectedMaj="체험 / 농장"
        onSelectMaj={() => {}}
        selectedMin="도시농업"
        onSelectMin={() => {}}
        categoryFeedItems={[nearbyItem({ id: 'r1', name: '도시농업 체험 행사' })]}
        isCategoryFeedLoading={false}
        isCategoryFeedLoadingMore={true}
        categoryFeedHasMore={true}
        onLoadMoreCategoryFeed={onLoadMoreCategoryFeed}
      />
    );
    fireEvent.click(screen.getByText('체험 / 농장').closest('button')!);

    fireScrollNearBottom(container);

    expect(onLoadMoreCategoryFeed).not.toHaveBeenCalled();
    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
  });
});
