import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpotNoticesPanel } from './spot-notices-panel';

// [네이버 플레이스 공지 온디맨드 레이더 — 관리자 스테이징함](2026-09-19 사용자 지시):
// 다른 자기완결 패널과 동일한 관례(마운트 시 자동 조회 안 함, "불러오기" 버튼으로
// 시작) — pending 목록 조회, 행 펼쳐서 편집, 발행/보관 흐름을 검증한다.
function mockFetchByUrl(handlers: { list?: unknown; patch?: unknown; uploadImage?: unknown }) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-curations/upload-image')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.uploadImage ?? { url: 'https://example.com/x.jpg' }) } as Response);
    }
    if (url.includes('/api/admin/spot-notices') && init?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.patch ?? {}) } as Response);
    }
    if (url.includes('/api/admin/spot-notices')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.list ?? { items: [], total: 0 }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

const SAMPLE_ROW = {
  id: 'notice-1',
  spot_id: 'spot-1',
  raw_title: '추석연휴~정상영업 합니다~^^',
  raw_content: '추석연휴 정상영업 합니다~^^',
  raw_image_url: 'https://ldb-phinf.pstatic.net/example.jpg',
  raw_category: '알림',
  raw_posted_at: '20260907',
  curated_title: null,
  curated_content: null,
  curated_image_url: null,
  status: 'pending' as const,
  created_at: '2026-09-07T00:00:00.000Z',
  published_at: null,
  open_spaces: { name: '딸부자 닭갈비 닭도리탕', address: '경기 의정부시' },
};

describe('SpotNoticesPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('불러오기를 누르면 검수 대기(pending) 목록을 조회한다', async () => {
    const fetchMock = mockFetchByUrl({ list: { items: [SAMPLE_ROW], total: 1 } });
    vi.stubGlobal('fetch', fetchMock);

    render(<SpotNoticesPanel />);
    fireEvent.click(screen.getByText('불러오기'));

    expect(await screen.findByText('딸부자 닭갈비 닭도리탕')).toBeInTheDocument();
    expect(screen.getByText('추석연휴~정상영업 합니다~^^')).toBeInTheDocument();

    const listCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-notices') && !(c[1] as RequestInit)?.method);
    expect(decodeURIComponent(listCall![0] as string)).toContain('status=pending');
  });

  it('행을 펼치면 원본 미리보기와 편집 폼이 보인다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl({ list: { items: [SAMPLE_ROW], total: 1 } }));
    render(<SpotNoticesPanel />);
    fireEvent.click(screen.getByText('불러오기'));
    await screen.findByText('딸부자 닭갈비 닭도리탕');

    fireEvent.click(screen.getByText('펼치기 ▼'));

    expect(screen.getByText(/원문\(네이버, 알림/)).toBeInTheDocument();
    expect(screen.getByText('🚀 발행')).toBeInTheDocument();
    expect(screen.getByText('보관')).toBeInTheDocument();
  });

  it('발행 버튼을 누르면 PATCH로 status=published를 전송하고 목록에서 사라진다(pending 탭 기준)', async () => {
    const fetchMock = mockFetchByUrl({
      list: { items: [SAMPLE_ROW], total: 1 },
      patch: { item: { ...SAMPLE_ROW, status: 'published', curated_title: '추석연휴~정상영업 합니다~^^' } },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotNoticesPanel />);
    fireEvent.click(screen.getByText('불러오기'));
    await screen.findByText('딸부자 닭갈비 닭도리탕');
    fireEvent.click(screen.getByText('펼치기 ▼'));

    fireEvent.click(screen.getByText('🚀 발행'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body).toMatchObject({ id: 'notice-1', status: 'published' });
    });

    // pending 탭에 남아있던 행이 published로 바뀌면서 현재(pending) 탭 목록에서 사라진다.
    await waitFor(() => expect(screen.queryByText('딸부자 닭갈비 닭도리탕')).not.toBeInTheDocument());
  });

  it('이미지를 업로드하면 미리보기가 뜨고, 저장 시 curated_image_url로 전송된다', async () => {
    const fetchMock = mockFetchByUrl({
      list: { items: [SAMPLE_ROW], total: 1 },
      uploadImage: { url: 'https://example.com/uploaded.jpg' },
      patch: { item: SAMPLE_ROW },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotNoticesPanel />);
    fireEvent.click(screen.getByText('불러오기'));
    await screen.findByText('딸부자 닭갈비 닭도리탕');
    fireEvent.click(screen.getByText('펼치기 ▼'));

    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const fileInput = screen.getByLabelText('발행 이미지(선택, 자체 업로드)') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('upload-image'));
      expect(uploadCall).toBeDefined();
    });

    fireEvent.click(screen.getByText('임시 저장'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PATCH');
      const body = JSON.parse((patchCall![1] as RequestInit).body as string);
      expect(body.curated_image_url).toBe('https://example.com/uploaded.jpg');
    });
  });

  it('탭을 바꾸면 해당 상태로 다시 조회한다', async () => {
    const fetchMock = mockFetchByUrl({ list: { items: [], total: 0 } });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotNoticesPanel />);
    fireEvent.click(screen.getByText('불러오기'));
    await waitFor(() => expect(screen.getByText('총 0건')).toBeInTheDocument());

    fireEvent.click(screen.getByText('발행됨'));

    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes('status=published'));
      expect(calls.length).toBeGreaterThan(0);
    });
  });
});
