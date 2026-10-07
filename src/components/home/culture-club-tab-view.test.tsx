// [문화센터 통합검색](2026-10-06 사용자 지시, project/decision-log.md Decision
// 028): "전체 통합검색 및 롯데마트나 이마트 필터검색도 가능하게" — 이마트
// 전용 화면 + 롯데마트 전용 화면 2개를 이 화면 하나로 합쳤다. 기본값은
// "전체"(브랜드 무관 통합검색)이고, 브랜드 pill로 특정 브랜드로 좁힐 수 있다.
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CultureClubTabView } from './culture-club-tab-view';

const mockUser = { current: null as { id: string } | null };
vi.mock('@/hooks/use-user', () => ({
  useUser: () => ({ user: mockUser.current, isLoading: false }),
}));
const getMyProfileMock = vi.fn();
vi.mock('@/lib/auth/profile', () => ({
  getMyProfile: () => getMyProfileMock(),
}));
vi.mock('@/lib/community/bookmarks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/community/bookmarks')>();
  return {
    ...actual,
    getMyBookmarkedIds: () =>
      Promise.resolve({ spotIds: new Set(), eventIds: new Set(), emartClassIds: new Set(), lottemartClassIds: new Set() }),
  };
});

type ClassFixture = {
  id: number;
  brand: 'emart' | 'lottemart';
  source_class_id: string;
  class_title: string;
  store_code: string | null;
  store_name: string | null;
  main_category_name: string | null;
  sub_category_name: string | null;
  class_day: string[];
  start_time: string;
  end_time: string;
  class_original_fee: number | null;
  class_fee: number | null;
  class_material_fee: number | null;
  instructor_name: string | null;
  min_age_months: number | null;
  max_age_months: number | null;
  schedule_start_date: string | null;
  total_sessions: number | null;
  normalized_status: 'OPEN' | 'CLOSED' | 'WAITING';
  raw_status: string | null;
  register_start_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_extra: Record<string, any>;
  collected_at: string;
};

function makeEmartClass(overrides: Partial<ClassFixture> = {}): ClassFixture {
  return {
    id: 1,
    brand: 'emart',
    source_class_id: '403oo9Mze2026S3760',
    class_title: '10/3(토) 11:00 두근두근 무지개 레이저쇼',
    store_code: '180',
    store_name: '춘천점',
    main_category_name: 'Little Club',
    sub_category_name: 'Kids & Children',
    class_day: ['토'],
    start_time: '1100',
    end_time: '1140',
    class_original_fee: null,
    class_fee: 12000,
    class_material_fee: 9000,
    instructor_name: null,
    min_age_months: 36,
    max_age_months: null,
    schedule_start_date: '2026-10-03',
    total_sessions: null,
    normalized_status: 'OPEN',
    raw_status: '접수중',
    register_start_at: '2026-07-23T10:00:00+09:00',
    raw_extra: {
      main_image_key: 'classImages/6450c059-7f36-47e0-8c2e-670eeb1aed31',
      class_detail_title: '햇살아이 오감나무',
      class_detail_content: '중국 여행을 떠나 짜장면을 만들어요\n\n*준비물: 쪽쪽이, 물티슈',
    },
    collected_at: '2026-10-03T04:12:00+00:00',
    ...overrides,
  };
}

function makeLottemartClass(overrides: Partial<ClassFixture> = {}): ClassFixture {
  return {
    id: 2,
    brand: 'lottemart',
    source_class_id: 'lm-1',
    class_title: '랄랄라 코알라',
    store_code: '455',
    store_name: '고양점',
    main_category_name: '영아강좌',
    sub_category_name: '오감자극',
    class_day: ['목'],
    start_time: '1120',
    end_time: '1200',
    class_original_fee: 140000,
    class_fee: 91000,
    class_material_fee: null,
    instructor_name: '문화센터',
    min_age_months: 5,
    max_age_months: 9,
    schedule_start_date: '2026-09-03',
    total_sessions: 12,
    normalized_status: 'WAITING',
    raw_status: '대기자신청',
    register_start_at: null,
    raw_extra: { semester_code: '202603', target_code: '4', discount_badge_text: '35% 할인', is_new: false, is_closing_soon: false, like_count: 1 },
    collected_at: '2026-10-03T04:12:00+00:00',
    ...overrides,
  };
}

function stubFetch(classes: ClassFixture[], opts: { emartStores?: object[]; lottemartStores?: object[] } = {}) {
  const fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/culture-club/stores')) {
      return Promise.resolve({
        json: () => Promise.resolve({ stores: opts.emartStores ?? [{ storeCode: '180', label: '이마트 춘천점' }] }),
      } as Response);
    }
    if (url.startsWith('/api/culture-club/lottemart-stores')) {
      return Promise.resolve({
        json: () => Promise.resolve({ stores: opts.lottemartStores ?? [{ storeCode: '455', label: '고양점' }] }),
      } as Response);
    }
    if (url.startsWith('/api/culture-club/search')) {
      return Promise.resolve({ json: () => Promise.resolve({ items: classes, total: classes.length }) } as Response);
    }
    return Promise.resolve({ json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CultureClubTabView — 기본값(전체, 브랜드 무관 통합검색)', () => {
  it('기본값은 "전체"이고 지점 선택이 보이지 않는다(브랜드마다 지점 네임스페이스가 달라서)', async () => {
    stubFetch([makeEmartClass(), makeLottemartClass()]);
    render(<CultureClubTabView />);

    await screen.findByText(/두근두근/);
    expect(screen.getByText('전체')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('지점')).not.toBeInTheDocument();
  });

  it('"전체"에서는 브랜드 필터 요청 파라미터 없이 조회한다', async () => {
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    const searchCall = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/culture-club/search'));
    expect(searchCall?.[0]).not.toContain('brand=');
    expect(searchCall?.[0]).not.toContain('store_code=');
  });

  it('카드에 지점명이 보인다(브랜드 뱃지는 위치 줄과 중복이라 제거됨, 2026-10-07 사용자 지적)', async () => {
    stubFetch([makeEmartClass(), makeLottemartClass()]);
    render(<CultureClubTabView />);

    await screen.findByText(/두근두근/);
    const card = screen.getByText(/두근두근/).closest('.rounded-xl') as HTMLElement;
    expect(within(card).getByText(/춘천점/)).toBeInTheDocument();
    expect(within(card).queryByText('이마트')).not.toBeInTheDocument();
  });

  it('가격 옆에 재료비가 작게 표시된다', async () => {
    stubFetch([makeEmartClass({ class_fee: 12000, class_material_fee: 9000 })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText(/12,000원/)).toBeInTheDocument();
    expect(screen.getByText(/재료비 9,000원 포함/)).toBeInTheDocument();
  });

  it('연령 범위가 개월 수 컬럼으로부터 표시된다', async () => {
    stubFetch([makeLottemartClass({ min_age_months: 5, max_age_months: 9 })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText(/5개월~9개월/)).toBeInTheDocument();
  });

  it('total_sessions이 있으면 가격 옆에 "N회"로 표시된다(2026-10-07 사용자 지적: "몇회가 안보여")', async () => {
    stubFetch([makeLottemartClass({ total_sessions: 12, class_fee: 91000 })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText('12회')).toBeInTheDocument();
    expect(screen.getByText(/91,000원/)).toBeInTheDocument();
  });

  it('total_sessions이 없으면 "회" 표시를 생략한다', async () => {
    stubFetch([makeEmartClass({ total_sessions: null })]);
    render(<CultureClubTabView />);

    await screen.findByText(/두근두근/);
    expect(screen.queryByText(/^\d+회$/)).not.toBeInTheDocument();
  });

  it('register_start_at이 있으면(이마트) 접수일자가 표시된다(2026-10-07 사용자 지적: "접수일자는 왜 안보이지")', async () => {
    stubFetch([makeEmartClass({ register_start_at: '2026-07-23T10:00:00+09:00' })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText(/📅 접수/)).toBeInTheDocument();
    expect(screen.getByText(/2026\.07\.23/)).toBeInTheDocument();
  });

  it('register_start_at이 없으면(롯데마트) 접수일자 줄 자체를 생략한다(추측하지 않음)', async () => {
    stubFetch([makeLottemartClass({ register_start_at: null })]);
    render(<CultureClubTabView />);

    await screen.findByText('랄랄라 코알라');
    expect(screen.queryByText(/📅 접수/)).not.toBeInTheDocument();
  });

  it('상태 배지는 raw_status(브랜드별 원문 라벨)를 그대로 보여준다', async () => {
    stubFetch([makeLottemartClass({ raw_status: '대기자신청', normalized_status: 'WAITING' })]);
    render(<CultureClubTabView />);

    expect(await screen.findAllByText('대기자신청')).not.toHaveLength(0);
  });

  it('하루 1회 갱신이라는 안내와 함께 마지막 업데이트 시각을 보여준다', async () => {
    stubFetch([makeEmartClass({ collected_at: '2026-10-03T04:12:00+00:00' })]);
    render(<CultureClubTabView />);

    expect(await screen.findByText(/마지막 업데이트/)).toBeInTheDocument();
    expect(screen.getByText(/하루 1회 갱신돼요/)).toBeInTheDocument();
  });

  it('요일 필터를 선택하면 초기화 버튼이 보이고, 누르면 선택이 풀린다', async () => {
    stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    fireEvent.click(screen.getByText('토'));
    expect(screen.getByText('↻ 초기화')).toBeInTheDocument();
    expect(screen.getByText('토')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByText('↻ 초기화'));
    await waitFor(() => expect(screen.getByText('토')).toHaveAttribute('aria-pressed', 'false'));
  });

  it('"전체"에서는 카테고리/대상 칩이 보이지 않는다(분류 체계가 브랜드마다 달라서)', async () => {
    stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    expect(screen.queryByText('Club Originals')).not.toBeInTheDocument();
    expect(screen.queryByText('어린이청소년')).not.toBeInTheDocument();
  });
});

describe('CultureClubTabView — 브랜드 필터', () => {
  it('이마트를 선택하면 지점 뱃지와 이마트 카테고리 칩이 나타나고, brand가 요청에 포함된다(지점은 선택 전까지 전체)', async () => {
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    fireEvent.click(screen.getByText('이마트 컬처클럽'));

    await screen.findByText('이마트 춘천점');
    expect(screen.getByText('Club Originals')).toBeInTheDocument();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('/api/culture-club/search?') && (url as string).includes('brand=emart'));
      expect(call).toBeTruthy();
      expect(call?.[0]).not.toContain('store_codes=');
    });
  });

  it('지점 뱃지를 누르면 선택되고, 요청에 store_codes가 포함된다', async () => {
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    fireEvent.click(screen.getByText('이마트 컬처클럽'));
    const storeBadge = await screen.findByText('이마트 춘천점');
    fireEvent.click(storeBadge);

    expect(storeBadge).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('/api/culture-club/search?') && (url as string).includes('store_codes=180'));
      expect(call).toBeTruthy();
    });
  });

  it('롯데마트를 선택하면 지점 뱃지와 수강대상 칩이 나타난다', async () => {
    stubFetch([makeEmartClass(), makeLottemartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    fireEvent.click(screen.getByText('롯데마트 문화센터'));

    await screen.findByText('고양점');
    expect(screen.getByText('엄마와함께')).toBeInTheDocument();
    expect(screen.queryByText('Club Originals')).not.toBeInTheDocument();
  });

  it('"전체"로 되돌아가면 다시 지점/카테고리 칩이 사라진다', async () => {
    stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    fireEvent.click(screen.getByText('이마트 컬처클럽'));
    await screen.findByText('이마트 춘천점');

    fireEvent.click(screen.getByText('전체'));
    await waitFor(() => expect(screen.queryByText('이마트 춘천점')).not.toBeInTheDocument());
  });

  it('반경 pill을 바꾸면 요청에 radius_km가 반영된다(기본값 10km)', async () => {
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('/api/culture-club/search?'));
      expect(call?.[0]).toContain('radius_km=10');
    });

    fireEvent.click(screen.getByText('20km'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('/api/culture-club/search?') && (url as string).includes('radius_km=20'));
      expect(call).toBeTruthy();
    });
  });
});

describe('CultureClubTabView — 클래스 상세 바텀시트', () => {
  it('이마트 카드를 클릭하면 상세 시트가 열리고 지점/신청 버튼/클래스소개가 보인다', async () => {
    stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    fireEvent.click(screen.getAllByText(/두근두근/)[0]);

    expect(await screen.findByText('이마트 강좌 상세')).toBeInTheDocument();
    expect(screen.getByText('접수가능지점 춘천점')).toBeInTheDocument();
    expect(screen.getByText('접수중하러 가기 ↗')).toBeInTheDocument();
    expect(screen.getByText('중국 여행을 떠나 짜장면을 만들어요', { exact: false })).toBeInTheDocument();
  });

  it('이마트 신청하러 가기 버튼은 class_id가 포함된 상세 페이지로 새 탭 연결된다', async () => {
    stubFetch([makeEmartClass({ source_class_id: '403oo9Mze2026S3760' })]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);
    fireEvent.click(screen.getAllByText(/두근두근/)[0]);

    const link = await screen.findByText('접수중하러 가기 ↗');
    expect(link.closest('a')).toHaveAttribute('href', 'https://www.cultureclub.emart.com/class/403oo9Mze2026S3760');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
  });

  it('롯데마트 카드를 클릭하면 courseview.do 딥링크로 연결되고 class_intro가 소개로 보인다', async () => {
    stubFetch([makeLottemartClass({ raw_extra: { semester_code: '202603', target_code: '4', class_intro: '오감 자극 놀이 소개' } })]);
    render(<CultureClubTabView />);
    await screen.findByText('랄랄라 코알라');
    fireEvent.click(screen.getByText('랄랄라 코알라'));

    expect(await screen.findByText('롯데마트 강좌 상세')).toBeInTheDocument();
    const link = screen.getByText('대기자신청하러 가기 ↗');
    expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('search_str_cd=455'));
    expect(link.closest('a')).toHaveAttribute('href', expect.stringContaining('cls_cd=lm-1'));
    expect(screen.getByText('오감 자극 놀이 소개', { exact: false })).toBeInTheDocument();
  });

  it('접수마감 상태면 신청 버튼이 비활성(링크 없음)으로 보인다', async () => {
    stubFetch([makeLottemartClass({ raw_status: '접수마감', normalized_status: 'CLOSED' })]);
    render(<CultureClubTabView />);
    await screen.findByText('랄랄라 코알라');
    fireEvent.click(screen.getByText('랄랄라 코알라'));

    await screen.findByText('롯데마트 강좌 상세');
    const closedLabel = screen.getAllByText('접수마감').find((el) => el.tagName === 'SPAN' && el.className.includes('bg-gray-200'));
    expect(closedLabel).toBeTruthy();
  });

  it('찜 버튼을 눌러도 상세 시트가 열리지 않는다(이벤트 버블링 차단)', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active', birth_years: [], birth_months: [] });
    stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    const bookmarkButton = await screen.findByLabelText('찜하기');
    fireEvent.click(bookmarkButton);

    expect(screen.queryByText('이마트 강좌 상세')).not.toBeInTheDocument();
    mockUser.current = null;
  });

  it('✕를 누르면 상세 시트가 닫힌다', async () => {
    stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);
    fireEvent.click(screen.getAllByText(/두근두근/)[0]);
    await screen.findByText('이마트 강좌 상세');

    fireEvent.click(screen.getByLabelText('닫기'));

    expect(screen.queryByText('이마트 강좌 상세')).not.toBeInTheDocument();
  });
});

describe('CultureClubTabView — 접수 시작 안내(우수맘 전용)', () => {
  const FAR_FUTURE = '2099-01-01T10:00:00+09:00';

  it('우수맘이고 register_start_at이 미래면 접수 시작 안내가 보인다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'excellent', birth_years: [], birth_months: [] });
    stubFetch([makeEmartClass({ register_start_at: FAR_FUTURE })]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);
    fireEvent.click(screen.getAllByText(/두근두근/)[0]);

    expect(await screen.findByText('🔔 접수 시작 안내')).toBeInTheDocument();
    mockUser.current = null;
  });

  it('열심맘(우수맘 미달)이면 안내가 보이지 않는다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active', birth_years: [], birth_months: [] });
    stubFetch([makeEmartClass({ register_start_at: FAR_FUTURE })]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);
    fireEvent.click(screen.getAllByText(/두근두근/)[0]);
    await screen.findByText('이마트 강좌 상세');

    expect(screen.queryByText('🔔 접수 시작 안내')).not.toBeInTheDocument();
    mockUser.current = null;
  });

  it('register_start_at이 없으면(롯데마트 등) 안내가 보이지 않는다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'excellent', birth_years: [], birth_months: [] });
    stubFetch([makeLottemartClass({ register_start_at: null })]);
    render(<CultureClubTabView />);
    await screen.findByText('랄랄라 코알라');
    fireEvent.click(screen.getByText('랄랄라 코알라'));
    await screen.findByText('롯데마트 강좌 상세');

    expect(screen.queryByText('🔔 접수 시작 안내')).not.toBeInTheDocument();
    mockUser.current = null;
  });
});

describe('CultureClubTabView — 기본 필터(아이 연령 + 위치)', () => {
  afterEach(() => {
    mockUser.current = null;
  });

  it('로그인 + 아이 연령 정보가 있으면 연령 기준 배너가 보이고 age_months가 자동으로 조회에 붙는다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active', birth_years: [2024], birth_months: [10] });
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    expect(await screen.findByText('24개월')).toBeInTheDocument();
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('age_months=24'));
      expect(call).toBeTruthy();
    });
  });

  it('아이가 2명이면 첫째/둘째 스위처가 보이고, 전환하면 age_months가 바뀐다', async () => {
    mockUser.current = { id: 'user-1' };
    getMyProfileMock.mockResolvedValue({ grade: 'active', birth_years: [2024, 2021], birth_months: [10, 10] });
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    await screen.findByText('첫째 24개월');
    expect(screen.getByText('둘째 5세')).toBeInTheDocument();

    fireEvent.click(screen.getByText('둘째 5세'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/culture-club/search') && (url as string).includes('age_months=60'));
      expect(call).toBeTruthy();
    });
  });

  it('비로그인/아이 정보 없음이면 연령 배너를 생략한다(추측 없음)', async () => {
    stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    expect(screen.queryByText('👶 기준', { exact: false })).not.toBeInTheDocument();
  });

  it('위치(lat/lng)는 항상 조회 파라미터에 포함된다(위치 미설정 시 서울시청 기본값)', async () => {
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);

    const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/culture-club/search'));
    expect(call?.[0]).toContain('lat=37.5665');
    expect(call?.[0]).toContain('lng=126.978');
  });
});

describe('CultureClubTabView — 검색창(제출 시에만 검색)', () => {
  it('입력 중에는 조회하지 않고, 조회 버튼을 눌러야 q 파라미터가 붙는다', async () => {
    const fetchMock = stubFetch([makeEmartClass()]);
    render(<CultureClubTabView />);
    await screen.findByText(/두근두근/);
    fetchMock.mockClear();

    fireEvent.change(screen.getByPlaceholderText('강좌명 검색 (예: 트니트니)'), { target: { value: '트니트니' } });
    expect(fetchMock.mock.calls.find(([url]) => (url as string).includes('q='))).toBeUndefined();

    fireEvent.click(screen.getByText('조회'));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('q=%ED%8A%B8%EB%8B%88%ED%8A%B8%EB%8B%88'));
      expect(call).toBeTruthy();
    });
  });
});
