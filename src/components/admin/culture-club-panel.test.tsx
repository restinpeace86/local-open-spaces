// [문화센터 통합 관리자 화면](2026-10-06, Decision 028) — CultureClubPanel
// 단위 테스트. emart-culture-club-panel.test.tsx(삭제됨)의 핵심 시나리오를
// 통합 패널 기준으로 다시 검증한다.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CultureClubPanel } from './culture-club-panel';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    brand: 'emart',
    source_class_id: 'class-1',
    class_title: '토요 엉클짐',
    store_code: '964',
    store_name: '제천',
    main_category_name: 'Little Club',
    sub_category_name: 'Kids & Children',
    classroom: null,
    class_day: ['토'],
    start_time: '1100',
    end_time: '1140',
    class_original_fee: null,
    class_fee: 12000,
    class_material_fee: null,
    instructor_name: null,
    min_age_months: 36,
    max_age_months: 48,
    schedule_start_date: '2026-10-03',
    total_sessions: null,
    normalized_status: 'OPEN',
    raw_status: '접수중',
    register_start_at: null,
    is_excluded: false,
    raw_extra: {},
    detail_fetched_at: null,
    collected_at: '2026-10-03T04:12:00+00:00',
    ...overrides,
  };
}

function stubFetch(rows: ReturnType<typeof makeRow>[], { patchError }: { patchError?: string } = {}) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/culture-club/stores')) {
      return Promise.resolve({ json: () => Promise.resolve({ stores: [{ storeCode: '964', label: '제천' }] }) } as Response);
    }
    if (url.startsWith('/api/culture-club/lottemart-stores')) {
      return Promise.resolve({ json: () => Promise.resolve({ stores: [{ storeCode: '455', label: '고양점' }] }) } as Response);
    }
    if (url.startsWith('/api/admin/culture-club') && (!init || init.method === undefined)) {
      return Promise.resolve({ json: () => Promise.resolve({ rows, total: rows.length }) } as Response);
    }
    if (url.startsWith('/api/admin/culture-club') && init?.method === 'PATCH') {
      return Promise.resolve({ json: () => Promise.resolve(patchError ? { error: patchError } : { ok: true }) } as Response);
    }
    return Promise.resolve({ json: () => Promise.resolve({}) } as Response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CultureClubPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('마운트 시 자동 조회하지 않고, 안내 문구를 보여준다', () => {
    stubFetch([]);
    render(<CultureClubPanel />);
    expect(screen.getByText(/조회하기.*눌러 수집 결과를 불러오세요/)).toBeInTheDocument();
  });

  it('조회하기를 누르면 행을 불러와 브랜드와 함께 표시한다', async () => {
    stubFetch([makeRow()]);
    render(<CultureClubPanel />);

    fireEvent.click(screen.getByText('조회하기'));

    expect(await screen.findByText('토요 엉클짐')).toBeInTheDocument();
    expect(screen.getAllByText('이마트').length).toBeGreaterThan(0);
  });

  it('브랜드 pill을 선택하면 조회 요청에 brand 파라미터가 포함된다', async () => {
    const fetchMock = stubFetch([makeRow()]);
    render(<CultureClubPanel />);

    fireEvent.click(screen.getByText('이마트'));
    fireEvent.click(screen.getByText('조회하기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/admin/culture-club?'));
      expect(call?.[0]).toContain('brand=emart');
    });
  });

  // [관리자 화면 브랜드 필터 누락 수정](2026-10-08 사용자 지적): "관리자
  // 화면도 이마트랑 롯데마트밖에없네 조건이? 신세계랑 현백 필터링조건이
  // 없는데?" — 신세계/현대백화점도 브랜드 pill로 선택 가능하고, 조회
  // 요청에 brand 파라미터로 반영되는지 검증한다.
  it('신세계/현대백화점 브랜드 pill도 선택 가능하고 조회 요청에 반영된다', async () => {
    const fetchMock = stubFetch([makeRow()]);
    render(<CultureClubPanel />);

    fireEvent.click(screen.getByText('신세계 아카데미'));
    fireEvent.click(screen.getByText('현대백화점'));
    fireEvent.click(screen.getByText('조회하기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/admin/culture-club?'));
      expect(call?.[0]).toContain('brand=shinsegae%2Chyundai');
    });
  });

  // [AK플라자 브랜드 필터 추가](2026-10-09 사용자 요청: "상세페이지까지
  // 조사하고나서 제안하는 수집방식으로 해" — 데이터 수집과 함께 관리자
  // 화면 브랜드 필터도 같이 추가한다, 신세계/현대백화점 추가 때와 동일한
  // 누락을 처음부터 피함).
  it('AK플라자 브랜드 pill도 선택 가능하고 조회 요청에 반영된다', async () => {
    const fetchMock = stubFetch([makeRow()]);
    render(<CultureClubPanel />);

    fireEvent.click(screen.getByText('AK플라자'));
    fireEvent.click(screen.getByText('조회하기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/admin/culture-club?'));
      expect(call?.[0]).toContain('brand=ak_plaza');
    });
  });

  // [스타필드 브랜드 필터 추가](2026-10-09 사용자 승인: "그렇게 진행하자"
  // — AK플라자와 동일하게 데이터 수집과 함께 관리자 화면 브랜드 필터도
  // 같이 추가한다).
  it('스타필드 브랜드 pill도 선택 가능하고 조회 요청에 반영된다', async () => {
    const fetchMock = stubFetch([makeRow()]);
    render(<CultureClubPanel />);

    fireEvent.click(screen.getByText('스타필드'));
    fireEvent.click(screen.getByText('조회하기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/admin/culture-club?'));
      expect(call?.[0]).toContain('brand=starfield');
    });
  });

  // [롯데백화점 브랜드 필터 추가](2026-10-09 사용자 승인: "4~6시간...내에서
  // 랜덤하게" — 다른 신규 브랜드와 동일하게 데이터 수집과 함께 관리자
  // 화면 브랜드 필터도 같이 추가한다).
  it('롯데백화점 브랜드 pill도 선택 가능하고 조회 요청에 반영된다', async () => {
    const fetchMock = stubFetch([makeRow()]);
    render(<CultureClubPanel />);

    fireEvent.click(screen.getByText('롯데백화점'));
    fireEvent.click(screen.getByText('조회하기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/admin/culture-club?'));
      expect(call?.[0]).toContain('brand=lotte_department');
    });
  });

  // [이랜드리테일 브랜드 필터 추가](2026-10-09 사용자 승인: "K 중도수강도
  // 포함해... J도 뭐 일단은 포함시켜" — 다른 신규 브랜드와 동일하게
  // 데이터 수집과 함께 관리자 화면 브랜드 필터도 같이 추가한다).
  it('이랜드리테일 브랜드 pill도 선택 가능하고 조회 요청에 반영된다', async () => {
    const fetchMock = stubFetch([makeRow()]);
    render(<CultureClubPanel />);

    fireEvent.click(screen.getByText('이랜드리테일'));
    fireEvent.click(screen.getByText('조회하기'));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).startsWith('/api/admin/culture-club?'));
      expect(call?.[0]).toContain('brand=eland_retail');
    });
  });

  it('노출 제외 체크박스를 누르면 id로 PATCH 요청을 보낸다', async () => {
    const fetchMock = stubFetch([makeRow({ id: 42 })]);
    render(<CultureClubPanel />);
    fireEvent.click(screen.getByText('조회하기'));
    await screen.findByText('토요 엉클짐');

    fireEvent.click(screen.getByLabelText('토요 엉클짐 노출 제외'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      expect(JSON.parse((patchCall?.[1] as RequestInit).body as string)).toEqual({ id: 42, is_excluded: true });
    });
  });

  it('행을 클릭하면 상세 모달이 열리고 기타 raw_extra 필드가 나열된다', async () => {
    stubFetch([makeRow({ raw_extra: { occupied_full_flag: false, channel_online: true } })]);
    render(<CultureClubPanel />);
    fireEvent.click(screen.getByText('조회하기'));
    await screen.findByText('토요 엉클짐');

    fireEvent.click(screen.getByText('토요 엉클짐'));

    expect(await screen.findByText('기타 정보(브랜드 전용 필드)')).toBeInTheDocument();
    expect(screen.getByText('occupied_full_flag')).toBeInTheDocument();
  });
});
