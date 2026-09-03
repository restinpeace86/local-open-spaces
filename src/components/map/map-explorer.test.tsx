import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
describe('MapExplorer 대분류 탭 + 중분류 바텀시트 필터 (2026-09-03, todo.md 개선사항 6)', () => {
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

  it('대분류 탭을 누르면 그 대분류의 중분류만 바텀시트에 노출되고, 체육시설은 어디에도 없다', () => {
    render(<MapExplorer />);
    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);

    const sheet = within(getOpenSheet());
    expect(sheet.getByText('도서관')).toBeInTheDocument();
    expect(sheet.getByText('미술관')).toBeInTheDocument();
    expect(sheet.queryByText('놀이터')).not.toBeInTheDocument();
    expect(sheet.queryByText('테니스장')).not.toBeInTheDocument();
  });

  // [단일 선택 유지](2026-08-29 사용자 지시 원칙 그대로): 바텀시트를 거치더라도 한 번에
  // 하나의 중분류만 선택 가능하다 — 다른 중분류를 고르면 교체되고, 같은 중분류를 다시
  // 고르면 해제된다. 선택 상태는 해당 중분류가 속한 대분류 탭의 라벨이 그 중분류 이름
  // 으로 바뀌는 것으로 확인한다(spot-category-filter.tsx의 표시 관례) — 시트 자신의
  // 헤더는 항상 대분류 고정 라벨을 쓰므로(getOpenSheet 재사용을 위해) 이 라벨과는
  // 헷갈리지 않는다.
  it('중분류는 한 번에 하나만 선택 가능하고(단일 선택), 같은 중분류를 다시 고르면 해제된다', () => {
    render(<MapExplorer />);

    fireEvent.click(screen.getAllByRole('button', { name: '자연/공원' })[0]);
    fireEvent.click(within(getOpenSheet()).getByText('공원'));
    expect(screen.getAllByRole('button', { name: '공원' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: '자연/공원' }).length).toBe(0);

    fireEvent.click(screen.getAllByRole('button', { name: '문화시설' })[0]);
    fireEvent.click(within(getOpenSheet()).getByText('도서관'));
    expect(screen.getAllByRole('button', { name: '도서관' }).length).toBeGreaterThan(0);
    // 다른 대분류(자연/공원)를 골랐으므로 이전 선택(공원)의 대분류 탭은 원래 라벨로 돌아간다.
    expect(screen.getAllByRole('button', { name: '자연/공원' }).length).toBeGreaterThan(0);

    // 지금은 대분류 탭이 "도서관"으로 표시 중이므로 그 이름으로 다시 열어 같은 중분류를
    // 재클릭하면 해제되어 대분류 탭이 원래 라벨("문화시설")로 돌아간다.
    fireEvent.click(screen.getAllByRole('button', { name: '도서관' })[0]);
    fireEvent.click(within(getOpenSheet()).getByText('도서관'));
    expect(screen.queryAllByRole('button', { name: '도서관' }).length).toBe(0);
    expect(screen.getAllByRole('button', { name: '문화시설' }).length).toBeGreaterThan(0);
  });

  it('AI 추천 칩을 누르면 페이지 이동 없이 추천 바텀시트가 뜬다', () => {
    render(<MapExplorer />);
    fireEvent.click(screen.getAllByText(/AI 추천/)[0]);
    expect(screen.getByText(/AI가 추천하는 나들이 장소/)).toBeInTheDocument();
  });
});

// [스팟픽 UI/UX 개선 4종](2026-09-01 사용자 지시) 항목 1: 마커 클릭 2단계 UX(표준 지도
// 앱 방식) — 1단계는 가벼운 미리보기 카드만, 2단계(카드 터치)에서만 전체 상세 모달.
describe('MapExplorer 마커 클릭 2단계 UX (2026-09-01)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response)));
  });

  // 이 화면은 위치 미설정 시 LocationOnboardingModal이 기본으로 열려 있어 그쪽에도
  // aria-label="닫기" 버튼이 있다 — DetailModal이 실제로 열렸는지는 그 안에만 있는
  // "주소" dt 텍스트로 판별한다(스팟 상세는 항상 이 필드를 렌더링함).

  it('마커를 클릭하면 전체 상세 모달 대신 미리보기 카드가 먼저 뜬다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));

    expect(screen.getAllByText('용인어린이상상의숲').length).toBeGreaterThan(0);
    expect(screen.queryByText('주소')).not.toBeInTheDocument();
    expect(screen.getByLabelText('미리보기 닫기')).toBeInTheDocument();
  });

  it('미리보기 카드를 한 번 더 터치하면 전체 상세 모달이 열린다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));
    fireEvent.click(screen.getByLabelText('용인어린이상상의숲 상세보기'));

    expect(await screen.findByText('주소')).toBeInTheDocument();
    expect(screen.queryByLabelText('미리보기 닫기')).not.toBeInTheDocument();
  });

  it('미리보기 카드의 닫기(✕) 버튼을 누르면 아무것도 열리지 않고 카드만 사라진다', async () => {
    rpcMock.mockResolvedValueOnce({ data: [makeSpaceRow()], error: null });
    render(<MapExplorer />);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('simulate-marker-click-용인어린이상상의숲'));
    fireEvent.click(screen.getByLabelText('미리보기 닫기'));

    expect(screen.queryByLabelText('미리보기 닫기')).not.toBeInTheDocument();
    expect(screen.queryByText('주소')).not.toBeInTheDocument();
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
});
