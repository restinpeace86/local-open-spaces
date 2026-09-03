import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotCurationsPanel } from './spot-curations-panel';

// [todo.md 개선사항 9](2026-09-03): "식당 목록을 리스트로 먼저 노출 → 리스트 항목 클릭 →
// 식당명 자동 바인딩된 모달 → 메뉴/시간 정보만 입력"으로 개편했다. 기존에는 신규 등록 시
// 모달 안에서 2글자 이상 타이핑해 자동완성 검색을 해야 했지만, 이제는 후보 목록
// (/api/admin/data-grid?table=open_spaces&category_min=놀이방식당)을 먼저 보여주고
// 클릭만 하면 된다 — 모달 자체의 검색 UI는 완전히 제거됐다.
function mockFetchByUrl(handlers: { dataGrid?: unknown; curations?: unknown }) {
  return vi.fn((url: string) => {
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
});
