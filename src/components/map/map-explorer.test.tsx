import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapExplorer } from './map-explorer';

// [검색창/지도 검색 키워드 유연성 대폭 개선](2026-08-30 사용자 지시)를 위해 mockResolvedValueOnce로
// 실제 스팟 행을 주입하는 테스트를 추가하면서, 초기값의 빈 배열(`[]`)만 보고 추론된
// `never[]` 타입 때문에 이후 오버라이드가 막히지 않도록 명시적으로 `unknown[]`로 넓힌다.
const rpcMock = vi.fn(() => Promise.resolve({ data: [] as unknown[], error: null as string | null }));

// [Decision 019](2026-09-02): MapExplorer가 마운트하는 AiChatFab/AiChatSheet가 useUser()
// 훅(내부적으로 supabase.auth.getUser/onAuthStateChange 호출)을 쓰게 되면서, 이 목이
// rpc만 흉내 내던 것으로는 부족해졌다 — auth도 함께 흉내 내 항상 "비로그인" 상태로
// 렌더링되게 한다(이 파일의 테스트 목적과 무관한 로그인 상태라 비로그인 고정이 맞다).
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: rpcMock,
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

// Task 9-6-10(2026-08-23): rpcMock이 모듈 스코프 공용이라 초기화 없이는 호출 횟수가 테스트
// 파일 전체에 걸쳐 누적된다 — 여러 테스트가 정확한 호출 횟수(toHaveBeenCalledTimes(1) 등)를
// 검증하므로 매 테스트 전에 초기화해 서로 영향을 주지 않게 한다.
beforeEach(() => {
  rpcMock.mockClear();
  vi.mocked(rankAiRecommendedSpots).mockClear();
});

// implementation/todo.md: 재검색 버튼 테스트는 dragend를 트리거하는 것이 목적이므로
// 실제 Kakao SDK 대신 onDragEnd를 즉시 호출할 수 있는 버튼을 노출하는 스텁으로 대체한다.
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => mockSearchParams,
}));

// [스팟픽 전국구 서버사이드 검색](2026-08-30 사용자 지시) 테스트를 위해 focusPosition도
// 노출한다 — 검색 결과 클릭 시 실제 panTo 좌표가 selectedItem의 좌표와 일치하는지 확인한다.
// [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1: 마커 클릭 2단계 UX를 검증하기
// 위해 items/onSelectItem도 노출한다 — 각 item마다 "마커 클릭 시뮬레이션" 버튼을 만들어
// onSelectItem(item)을 직접 호출할 수 있게 한다(실제 Kakao 마커 렌더링/좌표 변환은
// 이 프로젝트의 다른 단위 테스트 대상이 아님, 기존 관례 그대로).
// [스팟픽 첫 진입 시 AI 추천 오탭 방지](2026-09-05 사용자 지시): "default로 가져오게
// 하지마 눌렀을때만 가져오게 해" — rankAiRecommendedSpots가 AI 추천 칩을 누르기 전에는
// 전혀 호출되지 않는지(지도 데이터가 바뀔 때마다 미리 계산해두지 않는지) 검증하려면 실제
// 구현을 감싼 스파이가 필요하다.
vi.mock('@/lib/spaces/ai-recommend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spaces/ai-recommend')>();
  return { ...actual, rankAiRecommendedSpots: vi.fn(actual.rankAiRecommendedSpots) };
});
const { rankAiRecommendedSpots } = await import('@/lib/spaces/ai-recommend');

// [노출 중분류 선택 시 현재 위치 도(道) 단위 노출](2026-09-10 사용자 지시): 도
// 스코프 필터는 현재 위치의 광역(addressName/sigunguName의 앞 토큰)에 의존한다.
// 기본값은 "위치 미설정"(addressName/sigunguName null)이라 필터가 걸리지 않아
// 기존 테스트 동작이 그대로 유지된다 — 도 스코프 테스트에서만 값을 채운다.
const mockUserLocation: { addressName: string | null; sigunguName: string | null } = {
  addressName: null,
  sigunguName: null,
};
vi.mock('@/hooks/use-user-location', () => ({
  DEFAULT_CENTER: { lat: 37.5665, lng: 126.978 },
  useUserLocation: () => ({
    center: { lat: 37.5665, lng: 126.978 },
    addressName: mockUserLocation.addressName,
    sigunguName: mockUserLocation.sigunguName,
    isOnboardingOpen: false,
    confirmLocation: vi.fn(),
    openOnboarding: vi.fn(),
    closeOnboarding: vi.fn(),
  }),
}));

vi.mock('@/components/map/kakao-map-view', () => ({
  KakaoMapView: ({
    items,
    onSelectItem,
    onDragEnd,
    focusPosition,
  }: {
    items: Array<{ id: string; name: string }>;
    onSelectItem?: (item: { id: string; name: string }) => void;
    onDragEnd?: (center: { lat: number; lng: number }) => void;
    focusPosition?: { lat: number; lng: number } | null;
  }) => (
    <div>
      <button type="button" onClick={() => onDragEnd?.({ lat: 37.5, lng: 127.1 })}>
        simulate-dragend
      </button>
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onSelectItem?.(item)}>
          {`simulate-marker-click-${item.name}`}
        </button>
      ))}
      {focusPosition && <div data-testid="focus-position">{`${focusPosition.lat},${focusPosition.lng}`}</div>}
    </div>
  ),
}));

describe('MapExplorer 재검색 버튼', () => {
  it('지도 드래그(dragend) 후 재검색 버튼 클릭 시 새로운 중심 좌표로 RPC를 재조회한다', async () => {
    render(<MapExplorer />);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    // Task 9-6-10(2026-08-23): /nearby가 상시 공간 전용으로 단일화되면서 p_item_type='SPACE'가
    // 항상 함께 넘어간다.
    expect(rpcMock).toHaveBeenLastCalledWith('get_nearby_spaces_and_events', {
      user_lng: 126.978,
      user_lat: 37.5665,
      radius_meters: 5000,
      p_item_type: 'SPACE',
    });

    expect(screen.queryAllByText('이 위치에서 재검색').length).toBe(0);

    fireEvent.click(screen.getByText('simulate-dragend'));

    const recenterButtons = await screen.findAllByText('이 위치에서 재검색');
    expect(recenterButtons.length).toBeGreaterThan(0);

    fireEvent.click(recenterButtons[0]);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock).toHaveBeenLastCalledWith('get_nearby_spaces_and_events', {
      user_lng: 127.1,
      user_lat: 37.5,
      radius_meters: 5000,
      p_item_type: 'SPACE',
    });

    expect(screen.queryAllByText('이 위치에서 재검색').length).toBe(0);
  });
});

// Task 9-6-10(2026-08-23): 드래그+재검색으로 탐색 기준점이 바뀐 뒤, "내 위치/설정위치로
// 이동" 버튼을 누르면 원래 설정 위치로 되돌아가 그 위치 기준으로 재조회한다.
describe('MapExplorer 내 위치/설정위치로 이동 버튼 (Task 9-6-10)', () => {
  it('재검색으로 위치가 바뀐 뒤 버튼을 누르면 원래 설정 위치로 되돌아가 재조회한다', async () => {
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-dragend'));
    const recenterButtons = await screen.findAllByText('이 위치에서 재검색');
    fireEvent.click(recenterButtons[0]);

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock).toHaveBeenLastCalledWith(
      'get_nearby_spaces_and_events',
      expect.objectContaining({ user_lng: 127.1, user_lat: 37.5 })
    );

    fireEvent.click(screen.getByLabelText('내 위치/설정위치로 이동'));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(3));
    expect(rpcMock).toHaveBeenLastCalledWith(
      'get_nearby_spaces_and_events',
      expect.objectContaining({ user_lng: 126.978, user_lat: 37.5665 })
    );
  });
});

// Task 9-6-10(2026-08-23): 상시 공간 전용 단일화 — RPC가 이미 SPACE만 반환하므로 이벤트
// on/off 토글(LayerToggle, "상시 시설 보기")은 더 이상 필요 없어 완전히 제거했다.
describe('MapExplorer 상시 공간 전용 단일화 (Task 9-6-10)', () => {
  it('상시 시설 on/off 토글(LayerToggle)이 더 이상 렌더링되지 않는다', () => {
    render(<MapExplorer />);
    expect(screen.queryByText('상시 시설 보기')).not.toBeInTheDocument();
    expect(screen.queryByText('상시 시설 보임')).not.toBeInTheDocument();
  });
});

function makeSpaceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'space-1',
    name: '용인어린이상상의숲',
    category: 'KIDS_ACTIVITY',
    distance_meters: 100,
    item_type: 'SPACE',
    lng: 127.1,
    lat: 37.5,
    address: '경기도 용인시 처인구 동백죽전대로 61',
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

// [스팟픽 전국구 서버사이드 검색](2026-08-30 사용자 지시): 지도 중심/반경 안에서만 텍스트로
// 거르던 기존 방식을 걷어내고, 검색어가 있으면 /api/spots/search(open_spaces 전체 대상)를
// 호출해 지도 화면 위치와 무관한 결과를 렌더링하도록 바뀌었다. 검색 결과 클릭 시 지도가
// 해당 좌표로 panTo하고 상세 모달이 열리는지도 함께 검증한다.
describe('MapExplorer 전국구 서버사이드 검색 (2026-08-30)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  function mockSearchResponse(items: unknown[]) {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items }),
    });
  }

  it('검색어를 입력하면 지도 반경(RPC 결과)과 무관하게 /api/spots/search 결과를 렌더링한다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    mockSearchResponse([makeSpaceRow({ id: 'nationwide-1', name: '용인어린이상상의숲' })]);

    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    const searchInputs = screen.getAllByPlaceholderText('공간/행사 이름, 키워드 검색');
    fireEvent.change(searchInputs[0], { target: { value: '용인 어린이상상' } });

    // [todo.md 개선사항 6](2026-09-03): MapExplorer가 마운트 시 카테고리 필터용 전역
    // 카운트도 함께 fetch하게 되면서(/api/nearby/spot-category-counts) mock.calls[0]이
    // 더 이상 항상 이 검색 호출이라는 보장이 없다 — URL로 정확히 찾는다.
    await waitFor(
      () =>
        expect(
          (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) => (c[0] as string).includes('/api/spots/search'))
        ).toBe(true),
      { timeout: 1000 }
    );
    const calledUrl = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      (c[0] as string).includes('/api/spots/search')
    )![0] as string;
    expect(decodeURIComponent(calledUrl)).toBe('/api/spots/search?q=용인 어린이상상');

    await waitFor(() => expect(screen.getAllByText('용인어린이상상의숲').length).toBeGreaterThan(0), {
      timeout: 1000,
    });
  });

  it('검색 결과를 클릭하면 지도가 해당 좌표로 이동(panTo)하고 상세 모달이 열린다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    mockSearchResponse([
      makeSpaceRow({ id: 'nationwide-2', name: '부산 씨사이드파크', lat: 35.15, lng: 129.05 }),
    ]);

    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    const searchInputs = screen.getAllByPlaceholderText('공간/행사 이름, 키워드 검색');
    fireEvent.change(searchInputs[0], { target: { value: '씨사이드' } });

    const results = await screen.findAllByText('부산 씨사이드파크', {}, { timeout: 1000 });
    fireEvent.click(results[0]);

    await waitFor(() => expect(screen.getByTestId('focus-position').textContent).toBe('35.15,129.05'));
    expect(screen.getAllByLabelText('닫기').length).toBeGreaterThan(0);
  });

  it('검색어를 지우면 다시 지도 반경 기반 결과로 돌아간다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ id: 'nearby-1', name: '분당 놀이터' })], error: null });
    mockSearchResponse([makeSpaceRow({ id: 'nationwide-3', name: '제주 오름공원' })]);

    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await screen.findAllByText('분당 놀이터');

    const searchInputs = screen.getAllByPlaceholderText('공간/행사 이름, 키워드 검색');
    fireEvent.change(searchInputs[0], { target: { value: '제주' } });

    await screen.findAllByText('제주 오름공원', {}, { timeout: 1000 });
    expect(screen.queryAllByText('분당 놀이터').length).toBe(0);

    fireEvent.change(searchInputs[0], { target: { value: '' } });

    await waitFor(() => expect(screen.getAllByText('분당 놀이터').length).toBeGreaterThan(0), { timeout: 1000 });
    expect(screen.queryAllByText('제주 오름공원').length).toBe(0);
  });
});

// [todo.md 개선사항 6](2026-09-03 사용자 지시): "작년 8월 디자인(플랫 단일 탭) 대신, 4대
// 대분류 탭 + 클릭 시 바텀시트로 하위 중분류 노출 구조로 가는 것이 맞다"는 확인에 따라
// 2026-08-29에 도입했던 1단 플랫 필터를 다시 2단(대분류 탭 → 바텀시트 중분류)으로
// 되돌렸다 — 이 describe 블록도 그 새 흐름에 맞춰 갱신한다.
// [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08 사용자 지시): 실측
// service_categories 데이터(2026-09-08 확인)를 그대로 픽스처로 쓴다 — 지도
// 대분류/중분류 바텀시트가 이제 이 데이터를 유일한 출처로 삼는다.
const SERVICE_CATEGORIES_FIXTURE = [
  { id: 'sc-1', parent_category: '농장/체험', category_name: '체험농장·농원' },
  { id: 'sc-2', parent_category: '농장/체험', category_name: '휴양마을' },
  { id: 'sc-3', parent_category: '문화시설', category_name: '미술관 / 전시체험관' },
  { id: 'sc-4', parent_category: '문화시설', category_name: '어린이 과학관 / 박물관' },
  { id: 'sc-5', parent_category: '문화시설', category_name: '어린이 도서관' },
  { id: 'sc-6', parent_category: '자연/공원', category_name: '대형 근린공원 / 잔디광장' },
  { id: 'sc-7', parent_category: '자연/공원', category_name: '생태공원 / 산책로' },
  { id: 'sc-8', parent_category: '키즈/놀이시설', category_name: '키즈카페 / 실내놀이터' },
  { id: 'sc-9', parent_category: '키즈/놀이시설', category_name: '키즈친화 식당(놀이시설 포함)' },
];

describe('MapExplorer 대분류 탭 + 중분류 바텀시트 필터 (2026-09-03, todo.md 개선사항 6)', () => {
  // [노출 중분류 기준 카테고리 필터 전면 교체](2026-09-08): 이 describe 블록의
  // 테스트는 실제 중분류 칩 라벨을 검증하므로, 마운트 시 호출되는
  // /api/nearby/service-categories를 이 픽스처로 응답하도록 고정한다(다른
  // describe 블록은 이 fetch가 실패해도 무해하므로 건드리지 않는다 — 기존 관례).
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/nearby/service-categories')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ items: SERVICE_CATEGORIES_FIXTURE, counts: {} }),
          } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('기존 목적별 테마 칩과 키즈/무료/오늘·주말 Quick 필터가 더 이상 렌더링되지 않는다', () => {
    render(<MapExplorer />);
    expect(screen.queryByText('공원·광장')).not.toBeInTheDocument();
    expect(screen.queryByText('👶 키즈')).not.toBeInTheDocument();
    expect(screen.queryByText('🎁 무료')).not.toBeInTheDocument();
    expect(screen.queryByText('⚡ 오늘/주말')).not.toBeInTheDocument();
  });

  it('AI 추천 액션 + 4대 대분류 탭이 바로 노출되고, 중분류는 바텀시트를 열기 전엔 보이지 않는다', () => {
    render(<MapExplorer />);
    expect(screen.getAllByText(/AI 추천/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '키즈/놀이시설' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '농장/체험' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '자연/공원' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '문화시설' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('도서관')).not.toBeInTheDocument();
    expect(screen.queryByText('테니스장')).not.toBeInTheDocument();
  });

  // 대분류 탭 클릭 시 바텀시트가 하나 이상(데스크톱/모바일 두 인스턴스 중 클릭한 쪽) 열리므로,
  // 시트 안의 중분류 버튼은 헤더가 아니라 시트 오버레이(.fixed) 안에서만 찾는다 — 대분류
  // 탭 자신도 선택된 중분류로 라벨이 바뀔 수 있어(아래 참고) 화면 전체에서 텍스트로 찾으면
  // 모호해질 수 있기 때문이다.
  function getOpenSheet() {
    return screen.getByTestId('spot-category-sheet');
  }

  it('대분류 탭을 누르면 그 대분류의 중분류만 바텀시트에 노출되고, 체육시설은 어디에도 없다', async () => {
    render(<MapExplorer />);
    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);

    const sheet = within(getOpenSheet());
    expect(await sheet.findByText('어린이 도서관')).toBeInTheDocument();
    expect(sheet.getByText('미술관 / 전시체험관')).toBeInTheDocument();
    expect(sheet.queryByText('키즈카페 / 실내놀이터')).not.toBeInTheDocument();
    expect(sheet.queryByText('테니스장')).not.toBeInTheDocument();
  });

  // [단일 선택 유지](2026-08-29 사용자 지시 원칙 그대로): 바텀시트를 거치더라도 한 번에
  // 하나의 중분류만 선택 가능하다 — 다른 중분류를 고르면 교체되고, 같은 중분류를 다시
  // 고르면 해제된다. 선택 상태는 "닫혀 있을 때도 상시 노출되는 바깥 대분류 탭"의
  // 라벨이 그 중분류 이름으로 바뀌는 것으로 확인한다(spot-category-filter.tsx의 표시
  // 관례) — [개선사항5](2026-09-04)로 시트가 더 이상 자동으로 닫히지 않게 되면서, 열려
  // 있는 시트 안에는 라벨을 바꾸지 않는 별도 고정 탭이 함께 남아 있을 수 있어(동일한
  // 대분류 라벨이 중복 노출) 반드시 data-testid="spot-category-tabs"로 바깥 탭만 정확히
  // 짚어 확인한다.
  function getOuterTabs() {
    return screen.getAllByTestId('spot-category-tabs')[0]; // [0] = 데스크톱 인스턴스(항상 먼저 렌더링됨)
  }

  it('중분류는 한 번에 하나만 선택 가능하고(단일 선택), 같은 중분류를 다시 고르면 해제된다', async () => {
    render(<MapExplorer />);

    fireEvent.click(screen.getAllByRole('button', { name: '자연/공원' })[0]);
    fireEvent.click(await within(getOpenSheet()).findByText('대형 근린공원 / 잔디광장'));
    expect(within(getOuterTabs()).getByRole('button', { name: '대형 근린공원 / 잔디광장' })).toBeInTheDocument();
    expect(within(getOuterTabs()).queryByRole('button', { name: '자연/공원' })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(await within(getOpenSheet()).findByText('어린이 도서관'));
    expect(within(getOuterTabs()).getByRole('button', { name: '어린이 도서관' })).toBeInTheDocument();
    // 다른 대분류(자연/공원)를 골랐으므로 이전 선택(대형 근린공원)의 대분류 탭은 원래
    // 라벨로 돌아간다.
    expect(within(getOuterTabs()).getByRole('button', { name: '자연/공원' })).toBeInTheDocument();

    // 지금은 대분류 탭이 "어린이 도서관"으로 표시 중이므로 그 이름으로 다시 열어 같은
    // 중분류를 재클릭하면 해제되어 대분류 탭이 원래 라벨("문화시설")로 돌아간다.
    fireEvent.click(within(getOuterTabs()).getByRole('button', { name: '어린이 도서관' }));
    fireEvent.click(await within(getOpenSheet()).findByText('어린이 도서관'));
    expect(within(getOuterTabs()).queryByRole('button', { name: '어린이 도서관' })).not.toBeInTheDocument();
    expect(within(getOuterTabs()).getByRole('button', { name: '문화시설' })).toBeInTheDocument();
  });

  it('AI 추천 칩을 누르면 페이지 이동 없이 추천 바텀시트가 뜬다', () => {
    render(<MapExplorer />);
    fireEvent.click(screen.getAllByText(/AI 추천/)[0]);
    expect(screen.getByText(/AI가 추천하는 나들이 장소/)).toBeInTheDocument();
  });

  // [스팟픽 첫 진입 시 AI 추천 오탭 방지](2026-09-05 사용자 지시): "default로 가져오게
  // 하지마 눌렀을때만 가져오게 해" — AI 추천 칩을 누르기 전까지는 랭킹 계산 자체가 한
  // 번도 호출되지 않아야 한다(지도 데이터가 바뀔 때마다 미리 계산해두는 낭비 금지).
  it('AI 추천 칩을 누르기 전에는 추천 랭킹을 계산하지 않고, 누르면 그 시점에 한 번만 계산한다', () => {
    render(<MapExplorer />);

    expect(rankAiRecommendedSpots).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByText(/AI 추천/)[0]);

    expect(rankAiRecommendedSpots).toHaveBeenCalledTimes(1);
  });
});

// [노출 중분류 기준 카테고리 필터 전면 교체 + 반경 컷오프 폐지](2026-09-08 사용자
// 지시): "반경 컷오프 완전 폐지 + 도 전역 노출로 해줘(지도에 찍히는 거 기준).. 현재
// 노출 중분류 기준으로 카테고리 필터 전면교체할것"
describe('MapExplorer 노출 중분류 전역 노출(2026-09-08)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/nearby/service-categories')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ items: SERVICE_CATEGORIES_FIXTURE, counts: {} }),
          } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    mockUserLocation.addressName = null;
    mockUserLocation.sigunguName = null;
  });

  it('중분류를 선택하면 반경/중심과 무관한 전국 조회 RPC(get_spots_by_service_category)를 그 id로 호출한다', async () => {
    render(<MapExplorer />);
    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith('get_nearby_spaces_and_events', expect.anything())
    );
    rpcMock.mockClear();

    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(await within(screen.getByTestId('spot-category-sheet')).findByText('어린이 도서관'));

    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith('get_spots_by_service_category', { p_service_category_id: 'sc-5' })
    );
  });

  it('중분류를 선택하면 지도 마커가 반경 기반 목록이 아니라 전국 조회 결과로 바뀐다(전역 노출)', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ id: 'near-1', name: '반경내스팟' })], error: null });
    rpcMock.mockResolvedValueOnce({
      data: [makeSpaceRow({ id: 'far-1', name: '전국스팟', lat: 35.1, lng: 129.0 })],
      error: null,
    });

    render(<MapExplorer />);
    await screen.findByText('simulate-marker-click-반경내스팟');

    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(await within(screen.getByTestId('spot-category-sheet')).findByText('어린이 도서관'));

    await screen.findByText('simulate-marker-click-전국스팟');
    expect(screen.queryByText('simulate-marker-click-반경내스팟')).not.toBeInTheDocument();
  });

  it('선택한 중분류를 다시 눌러 해제하면 지도 마커가 반경 기반 기본 목록으로 되돌아온다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ id: 'near-1', name: '반경내스팟' })], error: null });
    rpcMock.mockResolvedValueOnce({
      data: [makeSpaceRow({ id: 'far-1', name: '전국스팟', lat: 35.1, lng: 129.0 })],
      error: null,
    });

    render(<MapExplorer />);
    await screen.findByText('simulate-marker-click-반경내스팟');

    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(await within(screen.getByTestId('spot-category-sheet')).findByText('어린이 도서관'));
    await screen.findByText('simulate-marker-click-전국스팟');

    // 같은 중분류를 다시 눌러 선택 해제한다.
    fireEvent.click(screen.getAllByRole('button', { name: '어린이 도서관' })[0]);
    fireEvent.click(await within(screen.getByTestId('spot-category-sheet')).findByText('어린이 도서관'));

    await screen.findByText('simulate-marker-click-반경내스팟');
    expect(screen.queryByText('simulate-marker-click-전국스팟')).not.toBeInTheDocument();
  });

  // [노출 중분류 선택 시 현재 위치 도(道) 단위 노출](2026-09-10 사용자 지시,
  // project/decision-log.md): 반경 컷오프는 폐지 유지, 단 노출 중분류 데이터는
  // 현재 설정 위치가 포함하는 도로 제한. 판교(경기) → 경기+서울, 그 외 도 제외.
  it('중분류 데이터가 현재 위치의 도(경기 → 경기+서울)로 제한되고 다른 도는 지도에서 빠진다', async () => {
    mockUserLocation.addressName = '경기도 성남시 분당구 판교로 68';
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ id: 'near-1', name: '반경내스팟' })], error: null });
    rpcMock.mockResolvedValueOnce({
      data: [
        makeSpaceRow({ id: 'gg-1', name: '경기도서관', address: '경기 성남시 분당구 A로 1' }),
        makeSpaceRow({ id: 'seoul-1', name: '서울도서관', address: '서울특별시 중구 B로 2' }),
        makeSpaceRow({ id: 'daegu-1', name: '대구도서관', address: '대구광역시 수성구 C로 3' }),
        makeSpaceRow({ id: 'sejong-1', name: '세종도서관', address: '세종특별자치시 D로 4' }),
      ],
      error: null,
    });

    render(<MapExplorer />);
    await screen.findByText('simulate-marker-click-반경내스팟');

    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(await within(screen.getByTestId('spot-category-sheet')).findByText('어린이 도서관'));

    await screen.findByText('simulate-marker-click-경기도서관');
    expect(screen.getByText('simulate-marker-click-서울도서관')).toBeInTheDocument();
    expect(screen.queryByText('simulate-marker-click-대구도서관')).not.toBeInTheDocument();
    expect(screen.queryByText('simulate-marker-click-세종도서관')).not.toBeInTheDocument();
  });

  it('바텀시트 리스트/건수는 도 단위 사전 필터 없이 순수 반경 기준으로 나온다(도 경계 인접 스팟 포함)', async () => {
    // 현재 위치는 경기(도 스코프 = 경기+서울), 지도 기준점은 테스트 기본값 서울시청(37.5665/126.978).
    mockUserLocation.addressName = '경기도 성남시 분당구 판교로 68';
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ id: 'near-1', name: '반경내스팟' })], error: null });
    rpcMock.mockResolvedValueOnce({
      data: [
        // 경기 · 반경 내(≈1.5km) → 지도 O, 바텀시트 O
        makeSpaceRow({ id: 'gg-in', name: '경기근처도서관', address: '경기 성남시 A로 1', lat: 37.57, lng: 126.99 }),
        // 충남 · 반경 내(≈1km) → 지도 X(도 필터), 바텀시트 O(반경만)
        makeSpaceRow({ id: 'cn-in', name: '충남경계도서관', address: '충청남도 천안시 B로 2', lat: 37.56, lng: 126.98 }),
        // 경기 · 반경 밖(≈12km) → 지도 O(반경 없음), 바텀시트 X(반경)
        makeSpaceRow({ id: 'gg-far', name: '경기먼도서관', address: '경기 용인시 C로 3', lat: 37.5, lng: 127.1 }),
      ],
      error: null,
    });

    render(<MapExplorer />);
    await screen.findByText('simulate-marker-click-반경내스팟');
    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(await within(screen.getByTestId('spot-category-sheet')).findByText('어린이 도서관'));

    // 지도 마커: 경기 2건, 충남 0건(도 필터)
    await screen.findByText('simulate-marker-click-경기근처도서관');
    expect(screen.getByText('simulate-marker-click-경기먼도서관')).toBeInTheDocument();
    expect(screen.queryByText('simulate-marker-click-충남경계도서관')).not.toBeInTheDocument();

    // 바텀시트 건수: 반경 10km 내 2건(경기근처 + 충남경계) — 도 필터 없이 반경 기준
    await waitFor(() => expect(screen.getByText(/주변 2건/)).toBeInTheDocument());
  });

  it('현재 위치가 강원이면 강원 데이터만 남는다(인접 도 미포함)', async () => {
    mockUserLocation.addressName = '강원특별자치도 강릉시 E로 1';
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ id: 'near-1', name: '반경내스팟' })], error: null });
    rpcMock.mockResolvedValueOnce({
      data: [
        makeSpaceRow({ id: 'gw-1', name: '강원도서관', address: '강원도 강릉시 F로 2' }),
        makeSpaceRow({ id: 'gg-2', name: '경기도서관', address: '경기도 수원시 G로 3' }),
      ],
      error: null,
    });

    render(<MapExplorer />);
    await screen.findByText('simulate-marker-click-반경내스팟');

    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(await within(screen.getByTestId('spot-category-sheet')).findByText('어린이 도서관'));

    await screen.findByText('simulate-marker-click-강원도서관');
    expect(screen.queryByText('simulate-marker-click-경기도서관')).not.toBeInTheDocument();
  });
});

// [마커 클릭/호버 → 상세 카드 바로 진입](2026-09-10 사용자 지시): 예전엔 마커 클릭 →
// 화면 중앙/하단 고정 프리뷰 카드 → 재탭 → 상세(2단계)였다. 사용자가 "프리뷰 카드가
// 마커랑 따로 노는 것처럼 보임 / 마커 누르면 바로 상세로 가야 하는 거 아니냐"고 지적 →
// 프리뷰 카드를 KakaoMapView가 마커 좌표에 앵커한 오버레이로 옮기고(PC 호버 시 프리뷰,
// 클릭 시 상세 / 모바일 첫 탭 프리뷰, 재탭 상세). KakaoMapView는 이 파일에서 mock되므로
// 여기서는 "마커 클릭(=onSelectItem) → 상세 카드"만 검증한다(호버/앵커 프리뷰는
// KakaoMapView 내부라 별도 단위 테스트 대상이 아님 — 기존 관례).
describe('MapExplorer 마커 클릭 → 상세 카드', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response)));
  });

  // 이 화면은 위치 미설정 시 LocationOnboardingModal이 기본으로 열려 있어 그쪽에도
  // aria-label="닫기" 버튼이 있다 — DetailModal이 실제로 열렸는지는 그 안에만 있는
  // "주소" dt 텍스트로 판별한다(스팟 상세는 항상 이 필드를 렌더링함).

  it('마커를 클릭하면 상세 카드가 바로 열린다(중간 프리뷰 단계 없음)', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));

    expect(await screen.findByText('주소')).toBeInTheDocument();
  });

  it('바텀시트가 펼쳐진 상태에서 마커를 클릭하면 시트가 자동으로 접힌다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText(/목록 보기/));
    expect(screen.getByText(/접기/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));

    expect(screen.getByText(/목록 보기/)).toBeInTheDocument();
    expect(screen.queryByText(/접기/)).not.toBeInTheDocument();
  });

  it('리스트 패널에서 항목을 클릭하면(마커 클릭 아님) 기존처럼 바로 전체 상세 모달이 열린다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    const listButtons = screen.getAllByText('용인어린이상상의숲').map((el) => el.closest('button')).filter(Boolean);
    // simulate-marker-click 버튼이 아닌, 실제 ItemListPanel 항목 버튼을 찾아 클릭한다.
    const listItemButton = listButtons.find((btn) => !btn?.textContent?.startsWith('simulate-marker-click'));
    fireEvent.click(listItemButton!);

    expect(await screen.findByText('주소')).toBeInTheDocument();
    expect(screen.queryByLabelText('미리보기 닫기')).not.toBeInTheDocument();
  });

  // [리스트 → 상세 → 닫기 후 리스트 포커스 복원](2026-09-10 사용자 지시): "카드
  // 리스트 → 상세 카드 진입한 거면, 닫았을 때 카드 리스트에 그 누른 지점이
  // 포커스 되어 있어야 한다."
  it('리스트에서 항목을 골라 상세를 열고 닫으면, 그 항목이 리스트에서 계속 포커스(aria-current)된다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    const listItemButton = screen
      .getAllByText('용인어린이상상의숲')
      .map((el) => el.closest('button'))
      .find((btn) => btn && !btn.textContent?.startsWith('simulate-marker-click'));
    fireEvent.click(listItemButton!);
    await screen.findByText('주소');

    // 상세 카드 닫기(배경 클릭이 아니라 X 버튼) — DetailModal의 "닫기".
    fireEvent.click(screen.getAllByLabelText('닫기')[0]);

    await waitFor(() => expect(screen.queryByText('주소')).not.toBeInTheDocument());
    // 리스트의 그 항목 버튼이 여전히 aria-current="true".
    const focused = screen
      .getAllByText('용인어린이상상의숲')
      .map((el) => el.closest('button'))
      .find((btn) => btn?.getAttribute('aria-current') === 'true');
    expect(focused).toBeTruthy();
  });

  it('마커로 상세를 열고 닫으면 리스트 포커스는 남지 않는다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));
    await screen.findByText('주소');
    fireEvent.click(screen.getAllByLabelText('닫기')[0]);
    await waitFor(() => expect(screen.queryByText('주소')).not.toBeInTheDocument());

    const focused = screen
      .getAllByText('용인어린이상상의숲')
      .map((el) => el.closest('button'))
      .find((btn) => btn?.getAttribute('aria-current') === 'true');
    expect(focused).toBeFalsy();
  });
});

// [장소 단위 대표 1건 노출 — 그룹 펼쳐보기](2026-09-09 사용자 지시): "장소기준으로는
// 난지캠핑장 하나 아니야?" → "장소 단위로 묶어서 대표 1건만 노출.. 다건에 대하여서는
// 클릭시 쫙 뜨는걸로 하자" — 상세 모달의 "다른 예약 옵션 보기" 버튼이 get_spot_group_members
// RPC를 호출해 그룹 멤버 목록을 펼쳐 보여주고, 그중 하나를 고르면 그 멤버의 전체 상세로
// 이어지는지 검증한다.
describe('MapExplorer 그룹 펼쳐보기(2026-09-09)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/nearby/service-categories')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], counts: {} }) } as Response);
        }
        // 상세 모달이 여는 스팟 큐레이션 조회 — 이 테스트 목적과 무관하니 항상 없음으로 응답한다.
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response);
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('group_id가 있는 스팟의 상세를 열면 "다른 예약 옵션 보기" 버튼이 보인다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ group_id: 'group-1' })], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));

    expect(await screen.findByText('🔗 이 장소의 다른 예약 옵션 보기')).toBeInTheDocument();
  });

  it('group_id가 없으면 버튼이 보이지 않는다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ group_id: null })], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));

    await screen.findByText('주소');
    expect(screen.queryByText('🔗 이 장소의 다른 예약 옵션 보기')).not.toBeInTheDocument();
  });

  it('버튼을 누르면 get_spot_group_members를 호출해 그룹 멤버 목록을 보여주고, 하나를 고르면 그 상세로 이어진다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow({ group_id: 'group-1' })], error: null });
    rpcMock.mockResolvedValueOnce({
      data: [
        makeSpaceRow({ id: 'space-1', name: '용인어린이상상의숲', group_id: 'group-1' }),
        makeSpaceRow({ id: 'space-2', name: '용인어린이상상의숲 B타입', group_id: 'group-1' }),
      ],
      error: null,
    });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));
    fireEvent.click(await screen.findByText('🔗 이 장소의 다른 예약 옵션 보기'));

    await waitFor(() =>
      expect(rpcMock).toHaveBeenCalledWith('get_spot_group_members', { p_group_id: 'group-1' })
    );
    expect(await screen.findByText('이 장소의 다른 예약 옵션')).toBeInTheDocument();
    expect(await screen.findByText('용인어린이상상의숲 B타입')).toBeInTheDocument();

    fireEvent.click(screen.getByText('용인어린이상상의숲 B타입'));

    expect(await screen.findByText('주소')).toBeInTheDocument();
    expect(screen.queryByText('이 장소의 다른 예약 옵션')).not.toBeInTheDocument();
  });
});

// [바텀시트 GPS 거리순 정렬](2026-09-08 사용자 지시, todo.md 개선사항3-1): "하단
// 바텀시트 리스트는 유저의 '현재 GPS 위치'를 기준으로 가까운 거리순으로 정렬합니다
// (단 하단 바텀시트 리스트는 현재 설정한 위치 기준 반경 10km 로 제한합니다.)"
describe('MapExplorer 바텀시트 GPS 거리순 정렬(개선사항3-1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('실시간 GPS 기준 10km를 넘는 항목은 바텀시트 목록에서 제외된다(데스크톱 목록/지도는 그대로 유지)', async () => {
    // GPS 위치를 makeSpaceRow() 기본 좌표(37.5, 127.1)로 고정한다.
    const getCurrentPosition = vi.fn((success) => success({ coords: { latitude: 37.5, longitude: 127.1 } }));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    // '서울시청카페'는 effectiveCenter(기본 서울시청, 37.5665/126.978)와 정확히 같은
    // 좌표라 서버 거리(distance_meters)는 가장 가깝지만, 실시간 GPS(37.5/127.1)
    // 로부터는 10km를 넘는다 — GPS 기준 정렬/제한이 실제로 적용됐다면 바텀시트에서
    // 빠지고, 지도/데스크톱 목록은 원래 순서/전체 개수를 그대로 유지해야 한다.
    rpcMock.mockResolvedValueOnce({
      data: [
        makeSpaceRow({ id: 'seoul-1', name: '서울시청카페', distance_meters: 50, lat: 37.5665, lng: 126.978 }),
        makeSpaceRow({ id: 'gps-1', name: '용인어린이상상의숲', distance_meters: 4800 }),
      ],
      error: null,
    });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByText(/주변 1건/)).toBeInTheDocument());
    // GPS와 가까운 쪽은 데스크톱 목록 + 모바일 바텀시트 둘 다 보인다.
    expect(screen.getAllByText('용인어린이상상의숲').length).toBeGreaterThanOrEqual(2);
    // GPS와 먼 쪽은 데스크톱 목록에는 여전히 보이지만(1회), 바텀시트에서는 빠져
    // 전체 등장 횟수가 1회(데스크톱만)여야 한다.
    expect(screen.getAllByText('서울시청카페')).toHaveLength(1);
  });

  // [반경 필터가 GPS 없을 때 통째로 빠지던 버그 수정](2026-09-10 사용자 지시,
  // todo.md 개선사항2-1·2-5): GPS 권한이 없어도 설정/온보딩한 위치(effectiveCenter,
  // 테스트 기본값 서울시청 37.5665/126.978)를 기준점으로 폴백해 반경 필터·거리순
  // 정렬·건수 카운트를 "항상" 적용한다(예전엔 GPS 없으면 전국구 결과를 그대로
  // 내려줘 경북 칠곡 등 원거리 스팟이 상단에 노출되고 274건처럼 카운트도 틀렸다).
  it('GPS를 가져올 수 없으면 설정 위치 기준으로 반경 필터/거리순 정렬이 적용된다', async () => {
    const getCurrentPosition = vi.fn((_success, error) => error());
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    rpcMock.mockResolvedValueOnce({
      data: [
        makeSpaceRow({ id: 'seoul-1', name: '서울시청카페', lat: 37.5665, lng: 126.978 }),
        // 설정 위치(서울시청)에서 수백 km 떨어진 부산 — 반경 밖이라 바텀시트에서 빠진다.
        makeSpaceRow({ id: 'busan-1', name: '부산먼곳', lat: 35.1796, lng: 129.0756 }),
      ],
      error: null,
    });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
    // 카운트는 반경 내 1건만.
    expect(await screen.findByText(/주변 1건/)).toBeInTheDocument();
    // 반경 내(설정 위치와 동일 좌표)는 바텀시트에도 노출, 반경 밖 부산은 바텀시트에서 제외.
    expect(screen.getAllByText('서울시청카페').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('부산먼곳')).toHaveLength(1); // 데스크톱 목록에만(바텀시트 제외)
  });
});
