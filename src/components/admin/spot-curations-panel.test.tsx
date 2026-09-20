import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotCurationsPanel } from './spot-curations-panel';

// [todo.md 개선사항 9](2026-09-03): "식당 목록을 리스트로 먼저 노출 → 리스트 항목 클릭 →
// 식당명 자동 바인딩된 모달 → 메뉴/시간 정보만 입력"으로 개편했다. 기존에는 신규 등록 시
// 모달 안에서 2글자 이상 타이핑해 자동완성 검색을 해야 했지만, 이제는 후보 목록
// (/api/admin/data-grid?table=open_spaces&category_min=놀이방식당)을 먼저 보여주고
// 클릭만 하면 된다 — 모달 자체의 검색 UI는 완전히 제거됐다.
function mockFetchByUrl(handlers: { dataGrid?: unknown; curations?: unknown; naverCrawl?: unknown }) {
  return vi.fn((url: string) => {
    // naver-crawl은 /api/admin/spot-curations 접두어를 공유하므로 더 구체적인 경로를 먼저 확인한다.
    if (url.includes('/api/admin/spot-curations/naver-crawl')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.naverCrawl ?? {}) } as Response);
    }
    if (url.includes('/api/admin/data-grid')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.dataGrid ?? { rows: [], total: 0 }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.curations ?? { items: [] }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('SpotCurationsPanel — 리스트 기반 등록/수정 (2026-09-03)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadList(handlers: { dataGrid?: unknown; curations?: unknown }) {
    vi.stubGlobal('fetch', mockFetchByUrl(handlers));
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
  }

  it('불러오기를 누르면 키즈친화 식당 후보 목록을 category_min=놀이방식당으로 조회한다', async () => {
    const fetchMock = mockFetchByUrl({
      dataGrid: { rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시 가금로 29 (가능동)' }], total: 1 },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));

    await screen.findByText('플레이버디 키즈카페');
    const dataGridCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid'));
    expect(dataGridCall).toBeDefined();
    const calledUrl = decodeURIComponent(dataGridCall![0] as string);
    expect(calledUrl).toContain('table=open_spaces');
    expect(calledUrl).toContain('category_min=놀이방식당');
  });

  it('주소에 "(가능동)" 표기가 있으면 목록에서 동 이름만 짧게 보여준다', async () => {
    await loadList({
      dataGrid: { rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시 가금로 29 (가능동)' }], total: 1 },
    });

    expect(await screen.findByText('가능동')).toBeInTheDocument();
    expect(screen.queryByText('경기도 의정부시 가금로 29 (가능동)')).not.toBeInTheDocument();
  });

  it('아직 큐레이션이 없는 스팟은 "미등록"으로 표시되고, 클릭하면 검색 없이 그 스팟명이 바로 채워진 등록 모달이 열린다', async () => {
    await loadList({
      dataGrid: { rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시 가금로 29' }], total: 1 },
      curations: { items: [] },
    });

    expect(await screen.findByText('미등록')).toBeInTheDocument();

    fireEvent.click(screen.getByText('플레이버디 키즈카페'));

    // 모달이 열리고, 검색창 없이 곧바로 스팟명이 요약 카드로 보인다 — "장소명 2글자 이상
    // 입력" 같은 검색 UI는 더 이상 존재하지 않는다.
    expect(screen.getByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/장소명/)).not.toBeInTheDocument();
    // 스팟명이 리스트 행과 모달 요약 카드 양쪽에 나타난다.
    expect(screen.getAllByText('플레이버디 키즈카페').length).toBeGreaterThanOrEqual(2);
  });

  it('이미 큐레이션이 있는 스팟은 "큐레이션됨"으로 표시되고, 클릭하면 기존 값이 채워진 수정 모달이 열린다', async () => {
    await loadList({
      dataGrid: { rows: [{ id: 'spot-1', name: '킹콩점프', address: '경기도 용인시 기흥구 흥덕중앙로 59 (영덕동, 흥덕노블레스)' }], total: 1 },
      curations: {
        items: [
          {
            id: 'curation-1',
            spot_id: 'spot-1',
            is_active: true,
            image_url: null,
            operating_hours_raw: null,
            open_time: null,
            close_time: null,
            break_start: null,
            break_end: null,
            last_order: null,
            menu_items: [{ name: '짜장면', price: 7000 }],
            // [가격 및 입장료 스마트 파싱](2026-09-08 사용자 지시) 프리필 확인용.
            child_fee: 12000,
            guardian_fee: 5000,
            naver_booking_url: null,
            curation_note: null,
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
            open_spaces: { name: '킹콩점프', address: '경기도 용인시 기흥구 흥덕중앙로 59 (영덕동, 흥덕노블레스)', category: 'INDOOR_PLAYGROUND' },
          },
        ],
      },
    });

    expect(await screen.findByText('큐레이션됨')).toBeInTheDocument();
    // "(동/읍/면)" 표기가 없는(동으로 끝나지 않는) 괄호는 폴백 경로를 탄다.
    expect(screen.getByText('경기도 용인시 기흥구')).toBeInTheDocument();

    fireEvent.click(screen.getByText('킹콩점프'));

    expect(screen.getByText('스팟 큐레이션 수정')).toBeInTheDocument();
    expect(screen.getByText(/짜장면/)).toBeInTheDocument();
    // [가격 및 입장료 스마트 파싱](2026-09-08 사용자 지시): 기존 큐레이션을
    // 다시 열면 이미 저장된 입장료도 프리필된다.
    expect(screen.getByPlaceholderText('어린이 요금(원)')).toHaveValue(12000);
    expect(screen.getByPlaceholderText('보호자 요금(원)')).toHaveValue(5000);
  });

  it('이미 큐레이션이 있는 스팟 행에는 노출 활성화 토글이 함께 노출된다', async () => {
    await loadList({
      dataGrid: { rows: [{ id: 'spot-1', name: '킹콩점프', address: '경기도 용인시' }], total: 1 },
      curations: {
        items: [
          {
            id: 'curation-1',
            spot_id: 'spot-1',
            is_active: true,
            image_url: null,
            operating_hours_raw: null,
            open_time: null,
            close_time: null,
            break_start: null,
            break_end: null,
            last_order: null,
            menu_items: [],
            naver_booking_url: null,
            curation_note: null,
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
            open_spaces: { name: '킹콩점프', address: '경기도 용인시', category: 'INDOOR_PLAYGROUND' },
          },
        ],
      },
    });

    await screen.findByText('큐레이션됨');
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  // [가격 및 입장료 스마트 파싱](2026-09-08 사용자 지시): "네이버 플레이스 등의
  // 가격 텍스트를 그대로 복사·붙여넣기할 수 있는 [가격 스마트 입력창]을 제공..
  // 어린이 요금, 보호자 요금 등의 필드에 숫자가 자동으로 쪼개져 매핑되도록 하고,
  // 관리자가 수정·저장할 수 있어야 합니다." — 원래 BlogCurationModal로 옮겼다가
  // 사용자 지시로 다시 이 화면(스팟 큐레이션)으로 되돌아왔다.
  it('입장료 텍스트를 붙여넣고 자동 파싱하면 어린이/보호자 요금이 채워지고, 등록 시 그대로 전송된다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시' }], total: 1 }),
        } as Response);
      }
      if (url.includes('/api/admin/spot-curations') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'curation-1' } }) } as Response);
      }
      if (url.includes('/api/admin/spot-curations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('플레이버디 키즈카페'));
    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/아동 12,000원/), {
      target: { value: '아동 12,000원\n보호자 5,000원' },
    });
    // 자동 파싱 버튼이 영업시간/메뉴/입장료 3곳에 있다(폼 순서: 영업시간, 메뉴,
    // 입장료) — 마지막(입장료) 버튼을 지정한다.
    const parseButtons = screen.getAllByText('⚡ 자동 파싱');
    fireEvent.click(parseButtons[parseButtons.length - 1]);

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse((saveCall![1] as RequestInit).body as string);
      expect(body.child_fee).toBe(12000);
      expect(body.guardian_fee).toBe(5000);
    });
  });

  // [스팟 큐레이션 메뉴 파싱 및 '키즈메뉴' 자동 감지](2026-09-15 사용자 지시,
  // implementation/todo.md [개선사항 5]).
  it('메뉴를 자동 파싱해 키즈메뉴 키워드가 매칭되면 [키즈메뉴] 뱃지가 자동으로 켜지고, 등록 시 curation_badges에 포함된다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시' }], total: 1 }),
        } as Response);
      }
      if (url.includes('/api/admin/spot-curations') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'curation-1' } }) } as Response);
      }
      if (url.includes('/api/admin/spot-curations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('플레이버디 키즈카페'));
    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/짜장면 7,000원/), {
      target: { value: '치즈돈까스 9,000원\n김치찌개 8,000원' },
    });
    // 자동 파싱 버튼이 영업시간/메뉴/입장료 3곳에 있다(폼 순서: 영업시간, 메뉴,
    // 입장료) — 두 번째(메뉴) 버튼을 지정한다.
    const parseButtons = screen.getAllByText('⚡ 자동 파싱');
    fireEvent.click(parseButtons[1]);

    // 키즈메뉴 항목(치즈돈까스)에 ⭐[키즈추천] 표시가 붙는다.
    expect(await screen.findByText('[키즈추천]')).toBeInTheDocument();
    // 뱃지 체크박스가 자동으로 켜진다.
    const badgeCheckbox = screen.getByLabelText(/키즈메뉴\] 뱃지/) as HTMLInputElement;
    expect(badgeCheckbox.checked).toBe(true);

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(saveCall).toBeDefined();
      const body = JSON.parse((saveCall![1] as RequestInit).body as string);
      expect(body.curation_badges).toContain('kids_menu');
      expect(body.menu_items).toEqual([
        { name: '치즈돈까스', price: 9000, is_kids_menu: true },
        { name: '김치찌개', price: 8000, is_kids_menu: false },
      ]);
    });
  });

  it('키즈메뉴가 매칭되지 않으면 뱃지 체크박스를 자동으로 켜지 않는다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시' }], total: 1 }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('플레이버디 키즈카페'));
    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/짜장면 7,000원/), {
      target: { value: '설렁탕 12,000원' },
    });
    const parseButtons = screen.getAllByText('⚡ 자동 파싱');
    fireEvent.click(parseButtons[1]);

    await screen.findByText('설렁탕 · 12,000원');
    const badgeCheckbox = screen.getByLabelText(/키즈메뉴\] 뱃지/) as HTMLInputElement;
    expect(badgeCheckbox.checked).toBe(false);
  });

  // [실사용 버그 제보](2026-09-19 사용자 지시) "스팟 큐레이션에서 키즈메뉴 선택된거
  // 수동 변경 가능하다고 적혀있는데 수동변경 안되던데? 자동체크 이후에?" — 관리자가
  // 체크박스를 직접 해제한 뒤 메뉴 텍스트를 수정해 다시 파싱하면(예: 메뉴 추가 후
  // 재파싱), 여전히 키즈메뉴가 매칭되므로 handleParseMenu가 매번 다시 true로
  // 되돌려버려 수동 해제가 무의미해지는 버그였다. 한 번이라도 체크박스를 직접
  // 조작하면 이후 자동 파싱은 그 값을 더 이상 건드리면 안 된다.
  it('자동 체크된 [키즈메뉴] 뱃지를 수동으로 해제하면, 메뉴를 다시 파싱해도 자동으로 다시 켜지지 않는다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시' }], total: 1 }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('플레이버디 키즈카페'));
    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/짜장면 7,000원/), {
      target: { value: '치즈돈까스 9,000원' },
    });
    const parseButtons = screen.getAllByText('⚡ 자동 파싱');
    fireEvent.click(parseButtons[1]);

    const badgeCheckbox = screen.getByLabelText(/키즈메뉴\] 뱃지/) as HTMLInputElement;
    expect(badgeCheckbox.checked).toBe(true);

    // 관리자가 수동으로 해제한다.
    fireEvent.click(badgeCheckbox);
    expect(badgeCheckbox.checked).toBe(false);

    // 메뉴를 더 추가하고 다시 파싱해도(여전히 키즈메뉴 매칭이 있음) 수동 해제가
    // 유지되어야 한다.
    fireEvent.change(screen.getByPlaceholderText(/짜장면 7,000원/), {
      target: { value: '치즈돈까스 9,000원\n김치찌개 8,000원' },
    });
    fireEvent.click(parseButtons[1]);
    await screen.findByText('김치찌개 · 8,000원');
    expect(badgeCheckbox.checked).toBe(false);
  });

  // [실사용 버그 제보](2026-09-19 사용자 지시) "애기밥이 메뉴로 있는데 키즈메뉴로
  // 자동 매칭이 안 됐다.. 이건 키즈메뉴 맞으니깐 수동으로 키즈메뉴 뱃지 주려고
  // 하는데 클릭해도 방법이 없다" — 원인 확인: [키즈메뉴] 뱃지 체크박스는
  // 큐레이션 전체에 붙는 뱃지 하나일 뿐, 유저 화면(detail-modal.tsx)에 항목별로
  // 붙는 ⭐[키즈추천] 표시는 메뉴 항목 각각의 is_kids_menu를 보는데 이걸 개별로
  // 켜고 끌 UI가 없었다. 항목을 클릭하면 그 항목만 토글되고(자동 파싱이 놓친
  // 항목을 구제), 함께 전체 뱃지도 OFF→ON 방향으로 제안되도록 했다.
  it('자동 매칭되지 않은 메뉴 항목도 클릭하면 [키즈추천]으로 수동 전환되고, 재파싱해도 유지된다', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '육담 퇴계점', address: '대구' }], total: 1 }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('육담 퇴계점'));
    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/짜장면 7,000원/), {
      target: { value: '애기밥 3,000원\n삼겹살 15,000원' },
    });
    const parseButtons = screen.getAllByText('⚡ 자동 파싱');
    fireEvent.click(parseButtons[1]);

    await screen.findByText('애기밥 · 3,000원');
    expect(screen.queryByText('[키즈추천]')).not.toBeInTheDocument();
    const badgeCheckbox = screen.getByLabelText(/키즈메뉴\] 뱃지/) as HTMLInputElement;
    expect(badgeCheckbox.checked).toBe(false);

    // "애기밥" 항목을 클릭해 수동으로 키즈메뉴로 전환한다.
    fireEvent.click(screen.getByText(/애기밥 · 3,000원/));
    expect(await screen.findByText('[키즈추천]')).toBeInTheDocument();
    // 전체 뱃지도 함께 OFF→ON으로 제안된다.
    expect(badgeCheckbox.checked).toBe(true);

    // 메뉴를 하나 더 추가해 재파싱해도(애기밥은 여전히 자동 매칭 안 됨) 수동
    // 전환이 유지되어야 한다.
    fireEvent.change(screen.getByPlaceholderText(/짜장면 7,000원/), {
      target: { value: '애기밥 3,000원\n삼겹살 15,000원\n된장찌개 7,000원' },
    });
    fireEvent.click(parseButtons[1]);
    await screen.findByText('된장찌개 · 7,000원');
    expect(screen.getByText('[키즈추천]')).toBeInTheDocument();
  });

  // [스팟 큐레이션 URL 크롤링 — 편의시설 뱃지 자동 체크](2026-09-19 사용자 지시):
  // "편의시설.. 가져온거랑 정합성 맞으면 체크해주는거.. 다만 이미 체크되어있는건
  // 해제하지 말고.. 자동으로 추가할때 놓칠 수도 있으니 사람이 수동으로 체크해줄
  // 수 있어야 하고.. 체크된걸 해제하는 것만 못하게".
  describe('편의시설 뱃지 자동 체크(2026-09-19)', () => {
    async function openNewCurationModal(naverCrawl?: unknown) {
      vi.stubGlobal(
        'fetch',
        mockFetchByUrl({
          dataGrid: { rows: [{ id: 'spot-1', name: '플레이버디 키즈카페', address: '경기도 의정부시' }], total: 1 },
          curations: { items: [] },
          naverCrawl,
        })
      );
      render(<SpotCurationsPanel />);
      fireEvent.click(screen.getByText('📥 불러오기'));
      await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
      fireEvent.click(screen.getByText('플레이버디 키즈카페'));
      expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();
    }

    it('가져온 편의시설과 일치하는 뱃지를 자동으로 체크한다', async () => {
      await openNewCurationModal({
        name: '테스트 업체',
        conveniences: ['주차', '아기의자', '유아시설 (놀이방)'],
      });

      fireEvent.change(screen.getByPlaceholderText(/map\.naver\.com/), {
        target: { value: 'https://map.naver.com/p/entry/place/36200306' },
      });
      fireEvent.click(screen.getByText('⚡ 데이터 가져오기'));

      // parking/kids_chair/kids_zone 키워드가 각각 "주차"/"아기의자"/"놀이방"과 매칭된다.
      expect((await screen.findByLabelText('주차 완비')) as HTMLInputElement).toHaveProperty('checked', true);
      expect(screen.getByLabelText('아기의자')).toHaveProperty('checked', true);
      expect(screen.getByLabelText('키즈존/놀이방')).toHaveProperty('checked', true);
      // 매칭되지 않은 뱃지는 그대로 미체크 상태다.
      expect(screen.getByLabelText('수유실 있음')).toHaveProperty('checked', false);
    });

    it('이미 체크된 뱃지는 이 화면에서 다시 눌러도 해제되지 않는다', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchByUrl({
          dataGrid: { rows: [{ id: 'spot-1', name: '킹콩점프', address: '경기도 용인시' }], total: 1 },
          curations: {
            items: [
              {
                id: 'curation-1',
                spot_id: 'spot-1',
                is_active: true,
                image_url: null,
                operating_hours_raw: null,
                open_time: null,
                close_time: null,
                break_start: null,
                break_end: null,
                last_order: null,
                menu_items: [],
                naver_booking_url: null,
                curation_note: null,
                curation_badges: ['parking'],
                created_at: '2026-09-01T00:00:00.000Z',
                updated_at: '2026-09-01T00:00:00.000Z',
                open_spaces: { name: '킹콩점프', address: '경기도 용인시', category: 'INDOOR_PLAYGROUND' },
              },
            ],
          },
        })
      );
      render(<SpotCurationsPanel />);
      fireEvent.click(screen.getByText('📥 불러오기'));
      await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
      fireEvent.click(screen.getByText('킹콩점프'));
      await screen.findByText('스팟 큐레이션 수정');

      const parkingCheckbox = screen.getByLabelText('주차 완비') as HTMLInputElement;
      expect(parkingCheckbox.checked).toBe(true);
      expect(parkingCheckbox.disabled).toBe(true); // 이미 체크된 뱃지는 해제할 수 없도록 잠김.

      fireEvent.click(parkingCheckbox);
      expect(parkingCheckbox.checked).toBe(true); // 클릭해도 여전히 체크 상태 유지.
    });

    it('자동 체크가 놓친 뱃지는 관리자가 직접 눌러서 추가로 체크할 수 있다', async () => {
      await openNewCurationModal();

      const nursingRoomCheckbox = screen.getByLabelText('수유실 있음') as HTMLInputElement;
      expect(nursingRoomCheckbox.checked).toBe(false);

      fireEvent.click(nursingRoomCheckbox);
      expect(nursingRoomCheckbox.checked).toBe(true);
    });

    // [해제 방지 범위 정정](2026-09-19 사용자 지적): "내가 여기서 체크 안된거에
    // 대하여 체크했는데.. 해제하려니깐 안되네.. 저장 안된거 여기서 누른거
    // 관련해서는 다시 해제 해야하는거 아니야 ? db에서 불러온거 말고?" — 해제
    // 금지는 DB에 이미 저장된 뱃지(파란색)에만 적용돼야 하고, 이번 화면에서
    // 방금 체크한 것(수동이든 크롤링 자동 매칭이든, 초록색=저장 전)은 실수로
    // 잘못 켰을 수 있으니 다시 끌 수 있어야 한다.
    it('DB에 아직 저장되지 않은 뱃지(방금 수동 체크)는 다시 눌러서 해제할 수 있다', async () => {
      await openNewCurationModal();

      const nursingRoomCheckbox = screen.getByLabelText('수유실 있음') as HTMLInputElement;
      fireEvent.click(nursingRoomCheckbox);
      expect(nursingRoomCheckbox.checked).toBe(true);
      expect(nursingRoomCheckbox.disabled).toBe(false);

      fireEvent.click(nursingRoomCheckbox);
      expect(nursingRoomCheckbox.checked).toBe(false);
    });

    it('DB에 아직 저장되지 않은 뱃지(크롤링 자동 매칭)도 다시 눌러서 해제할 수 있다', async () => {
      await openNewCurationModal({ name: '테스트 업체', conveniences: ['주차'] });

      fireEvent.change(screen.getByPlaceholderText(/map\.naver\.com/), {
        target: { value: 'https://map.naver.com/p/entry/place/36200306' },
      });
      fireEvent.click(screen.getByText('⚡ 데이터 가져오기'));

      const parkingCheckbox = (await screen.findByLabelText('주차 완비')) as HTMLInputElement;
      expect(parkingCheckbox.checked).toBe(true);
      expect(parkingCheckbox.disabled).toBe(false); // 자동 매칭됐지만 아직 저장 전이라 잠기지 않는다.

      fireEvent.click(parkingCheckbox);
      expect(parkingCheckbox.checked).toBe(false);
    });
  });
});

// [OPEN_SPACES 노출 이름 수동 수정](2026-09-20 사용자 지시, "장우랑 놀이방" 사례):
// "스팟큐레이션으로 데이터 가져올때 상호명도 가져오는데.. 자동적으로 상호명도
// 들어가도록" — 네이버 플레이스 크롤링이 반환한 상호명이 노출 이름 입력창에
// 자동으로 채워지고, 폼을 저장하면 open_spaces.display_name에도 반영되는지 검증한다.
describe('SpotCurationsPanel — 노출 이름 자동 채움(2026-09-20)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetchWithSave(naverCrawl?: unknown) {
    return vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/spot-curations/naver-crawl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(naverCrawl ?? {}) } as Response);
      }
      if (url.includes('/api/admin/data-grid/display-name')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ row: {} }) } as Response);
      }
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '장우랑 & 양주회센터', address: '경기도 양주시' }], total: 1 }),
        } as Response);
      }
      if (url.includes('/api/admin/spot-curations') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'curation-1' } }) } as Response);
      }
      if (url.includes('/api/admin/spot-curations')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it('신규 등록 모달을 열면 노출 이름 입력창 기본값은 원본 상호명이다', async () => {
    vi.stubGlobal('fetch', mockFetchWithSave());
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('장우랑 & 양주회센터'));
    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();

    expect(screen.getByLabelText(/노출 이름/)).toHaveValue('장우랑 & 양주회센터');
  });

  it('⚡ 데이터 가져오기로 크롤링한 상호명이 노출 이름 입력창에 자동으로 채워진다', async () => {
    vi.stubGlobal('fetch', mockFetchWithSave({ name: '장우랑 놀이방' }));
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('장우랑 & 양주회센터'));
    await screen.findByText('+ 스팟 큐레이션 등록');

    fireEvent.change(screen.getByPlaceholderText(/map\.naver\.com/), {
      target: { value: 'https://map.naver.com/p/entry/place/36200306' },
    });
    fireEvent.click(screen.getByText('⚡ 데이터 가져오기'));

    await waitFor(() => expect(screen.getByLabelText(/노출 이름/)).toHaveValue('장우랑 놀이방'));
  });

  it('노출 이름을 바꾸고 저장하면 open_spaces.display_name을 PATCH한다', async () => {
    const fetchMock = mockFetchWithSave();
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('장우랑 & 양주회센터'));
    await screen.findByText('+ 스팟 큐레이션 등록');

    fireEvent.change(screen.getByLabelText(/노출 이름/), { target: { value: '장우랑 놀이방' } });
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string).includes('/api/admin/data-grid/display-name') && (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body).toEqual({ id: 'spot-1', display_name: '장우랑 놀이방' });
    });
  });

  it('노출 이름을 건드리지 않고 저장하면 display_name PATCH를 호출하지 않는다', async () => {
    const fetchMock = mockFetchWithSave();
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('장우랑 & 양주회센터'));
    await screen.findByText('+ 스팟 큐레이션 등록');

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(saveCall).toBeDefined();
    });
    expect(fetchMock.mock.calls.some((c) => (c[0] as string).includes('/api/admin/data-grid/display-name'))).toBe(false);
  });
});

// [노출중분류 있는것/없는것 따로 보기](2026-09-06 사용자 지시): "스팟 큐레이션 탭에
// 노출중분류 된거랑 안된거 따로도 볼수 있게해줘 기본적으로 노출중분류가 분류된
// 식당에 대하여 스팟 큐레이션에서 메뉴작업할꺼라.. 일단은 노출중분류 있는것만도
// 볼수있어야돼"
describe('SpotCurationsPanel — 노출중분류 있는것/없는것 따로 보기', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('기본값은 "있음"이 선택돼 있어 처음 불러올 때부터 only_mapped=true로 조회한다', async () => {
    const fetchMock = mockFetchByUrl({ dataGrid: { rows: [], total: 0 } });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);

    fireEvent.click(screen.getByText('📥 불러오기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid'));
      expect(call).toBeDefined();
      expect(decodeURIComponent(call![0] as string)).toContain('only_mapped=true');
    });
  });

  it('"없음"을 누르면 only_unmapped=true로, "전체"를 누르면 필터 없이 조회한다', async () => {
    const fetchMock = mockFetchByUrl({ dataGrid: { rows: [], total: 0 } });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(0));
    fetchMock.mockClear();

    fireEvent.click(screen.getByText('없음'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid'));
      expect(call).toBeDefined();
      const url = decodeURIComponent(call![0] as string);
      expect(url).toContain('only_unmapped=true');
      expect(url).not.toContain('only_mapped');
    });
    fetchMock.mockClear();

    fireEvent.click(screen.getByText('전체'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/data-grid'));
      expect(call).toBeDefined();
      const url = decodeURIComponent(call![0] as string);
      expect(url).not.toContain('only_mapped');
      expect(url).not.toContain('only_unmapped');
    });
  });

  it('행마다 service_category_id 유무에 따라 "노출중분류 있음/없음" 뱃지를 보여준다', async () => {
    await (async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchByUrl({
          dataGrid: {
            rows: [
              { id: 'spot-1', name: '노출중분류 있는 식당', address: '서울', service_category_id: 'svc-1' },
              { id: 'spot-2', name: '노출중분류 없는 식당', address: '서울', service_category_id: null },
            ],
            total: 2,
          },
        })
      );
      render(<SpotCurationsPanel />);
      fireEvent.click(screen.getByText('📥 불러오기'));
    })();

    await screen.findByText('노출중분류 있는 식당');
    expect(screen.getAllByText('노출중분류 있음').length).toBeGreaterThan(0);
    expect(screen.getAllByText('노출중분류 없음').length).toBeGreaterThan(0);
  });
});

// [스팟 큐레이션 요일별 영업시간](2026-09-19 사용자 지시): "요일별로 시간 담을 수
// 있게.. 매일 같으면 모든 요일 동일하게, 요일별로 다르면 요일별로" — 실측 확인한
// 딸부자 닭갈비 실제 스키마(토/일/월/화/수는 정규, 목(9/24)/금(9/25)은 추석 연휴
// 임시 스케줄)로 검증한다.
describe('요일별 영업시간(2026-09-19)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function openNewCurationModal(naverCrawl?: unknown) {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        dataGrid: { rows: [{ id: 'spot-1', name: '딸부자 닭갈비 닭도리탕', address: '경기 의정부시' }], total: 1 },
        curations: { items: [] },
        naverCrawl,
      })
    );
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('딸부자 닭갈비 닭도리탕'));
    expect(await screen.findByText('+ 스팟 큐레이션 등록')).toBeInTheDocument();
  }

  const REAL_BUSINESS_HOUR_DAYS = [
    { day: '토', start: '11:00', end: '22:00', breakStart: null, breakEnd: null, description: null },
    { day: '일', start: '11:00', end: '22:00', breakStart: null, breakEnd: null, description: null },
    { day: '월', start: '14:00', end: '22:00', breakStart: null, breakEnd: null, description: null },
    { day: '화', start: '14:00', end: '22:00', breakStart: null, breakEnd: null, description: null },
    { day: '수', start: '14:00', end: '22:00', breakStart: null, breakEnd: null, description: null },
    { day: '목(9/24)', start: '11:00', end: '22:00', breakStart: null, breakEnd: null, description: '추석 연휴' },
    { day: '금(9/25)', start: '11:00', end: '22:00', breakStart: null, breakEnd: null, description: '추석' },
  ];

  it('데이터를 가져오면 요일별 표가 실제 크롤링 데이터로 채워지고, 임시 공휴일 스케줄은 제외된다', async () => {
    await openNewCurationModal({ businessHourDays: REAL_BUSINESS_HOUR_DAYS });

    fireEvent.change(screen.getByPlaceholderText(/map\.naver\.com/), {
      target: { value: 'https://map.naver.com/p/entry/place/36200306' },
    });
    fireEvent.click(screen.getByText('⚡ 데이터 가져오기'));

    await waitFor(() => {
      const dayInputs = screen.getAllByPlaceholderText('오픈(예: 10:00)');
      // 첫 번째 "오픈" 입력은 위쪽 단일 openTime 필드라 요일별 표는 그 다음 7개.
      expect(dayInputs.length).toBeGreaterThanOrEqual(8);
    });

    const openInputs = screen.getAllByPlaceholderText('오픈(예: 10:00)').slice(1) as HTMLInputElement[]; // 월~일 순서
    const closeInputs = screen.getAllByPlaceholderText('마감(예: 22:00)').slice(1) as HTMLInputElement[];

    // WEEKDAY_LABELS 순서: 월,화,수,목,금,토,일
    expect(openInputs.map((el) => el.value)).toEqual(['14:00', '14:00', '14:00', '', '', '11:00', '11:00']);
    expect(closeInputs.map((el) => el.value)).toEqual(['22:00', '22:00', '22:00', '', '', '22:00', '22:00']);
  });

  it('모든 요일이 같은 시간이면 7개 요일 모두 동일한 시간으로 채워진다', async () => {
    const uniformDays = ['월', '화', '수', '목', '금', '토', '일'].map((day) => ({
      day,
      start: '08:00',
      end: '20:00',
      breakStart: null,
      breakEnd: null,
      description: null,
    }));
    await openNewCurationModal({ businessHourDays: uniformDays });

    fireEvent.change(screen.getByPlaceholderText(/map\.naver\.com/), {
      target: { value: 'https://map.naver.com/p/entry/place/36200306' },
    });
    fireEvent.click(screen.getByText('⚡ 데이터 가져오기'));

    await waitFor(() => {
      const openInputs = screen.getAllByPlaceholderText('오픈(예: 10:00)').slice(1) as HTMLInputElement[];
      expect(openInputs.every((el) => el.value === '08:00')).toBe(true);
    });
    const closeInputs = screen.getAllByPlaceholderText('마감(예: 22:00)').slice(1) as HTMLInputElement[];
    expect(closeInputs.every((el) => el.value === '20:00')).toBe(true);
  });

  it('관리자가 요일별로 직접 입력하면 저장 시 그대로 전송된다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '딸부자 닭갈비 닭도리탕', address: '경기 의정부시' }], total: 1 }),
        } as Response);
      }
      if (url.includes('/api/admin/spot-curations') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ item: { id: 'curation-1' } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('딸부자 닭갈비 닭도리탕'));
    await screen.findByText('+ 스팟 큐레이션 등록');

    const openInputs = screen.getAllByPlaceholderText('오픈(예: 10:00)').slice(1) as HTMLInputElement[];
    const closeInputs = screen.getAllByPlaceholderText('마감(예: 22:00)').slice(1) as HTMLInputElement[];
    fireEvent.change(openInputs[0], { target: { value: '09:00' } }); // 월
    fireEvent.change(closeInputs[0], { target: { value: '18:00' } });

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      expect(postCall).toBeDefined();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.operating_hours_by_day[0]).toEqual({ day: '월', open: '09:00', close: '18:00' });
    });
  });

  it('요일별 표를 전혀 안 채우면 operating_hours_by_day는 null로 저장된다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/data-grid')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rows: [{ id: 'spot-1', name: '딸부자 닭갈비 닭도리탕', address: '경기 의정부시' }], total: 1 }),
        } as Response);
      }
      if (url.includes('/api/admin/spot-curations') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'curation-1' } }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotCurationsPanel />);
    fireEvent.click(screen.getByText('📥 불러오기'));
    await waitFor(() => expect(screen.queryByText('불러오는 중...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('딸부자 닭갈비 닭도리탕'));
    await screen.findByText('+ 스팟 큐레이션 등록');

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.operating_hours_by_day).toBeNull();
    });
  });
});
