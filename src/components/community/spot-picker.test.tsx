import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotPicker } from './spot-picker';

// [사용자 글쓰기 스팟 검색 최종 플로우](2026-09-10 사용자 지시, implementation/
// todo.md 개선사항5): 3글자+디바운스, 내부 DB → 외부 카카오 로컬 Fallback,
// 미등록 장소 선택 시 Auto-Upsert.
function stubFetch(handlers: {
  internal?: unknown[];
  external?: Array<{ externalId: string; name: string; address: string; lat: number; lng: number }>;
  upsert?: { ok?: boolean; item?: unknown; error?: string };
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/spots/search-external')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: handlers.external ?? [] }) } as Response);
      }
      if (url.includes('/api/spots/search')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: handlers.internal ?? [] }) } as Response);
      }
      if (url.includes('/api/spots/upsert-external')) {
        void init;
        const u = handlers.upsert ?? { ok: true, item: { id: 'new-1', name: '숲속 놀이터', address: '경기 성남시' } };
        return Promise.resolve({ ok: u.ok !== false, json: () => Promise.resolve(u) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    })
  );
}

describe('SpotPicker (개선사항5)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('3글자 미만이면 검색하지 않는다', async () => {
    const fetchMock = vi.fn();
    stubFetch({});
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotPicker selected={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '숲속' } });
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('내부 결과가 충분하면(3건 이상) 외부 검색은 하지 않는다', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            url.includes('search-external')
              ? { items: [] }
              : { items: [
                  { id: 'a', name: '놀이터A', address: '주소A' },
                  { id: 'b', name: '놀이터B', address: '주소B' },
                  { id: 'c', name: '놀이터C', address: '주소C' },
                ] }
          ),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotPicker selected={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '놀이터' } });
    expect(await screen.findByText('놀이터A')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('search-external'))).toBe(false);
  });

  it('내부 결과가 부족하면 외부 카카오 로컬 결과를 함께 보여준다', async () => {
    stubFetch({
      internal: [{ id: 'a', name: '내부 놀이터', address: '내부 주소' }],
      external: [{ externalId: 'KAKAO_LOCAL_1', name: '외부 놀이터', address: '경기 성남시 분당구', lat: 37.4, lng: 127.1 }],
    });
    render(<SpotPicker selected={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '놀이터' } });
    expect(await screen.findByText('내부 놀이터')).toBeInTheDocument();
    expect(await screen.findByText(/외부 놀이터/)).toBeInTheDocument();
    expect(screen.getByText('지도 검색 결과 · 선택하면 자동으로 등록돼요')).toBeInTheDocument();
  });

  it('외부 장소를 선택하면 Auto-Upsert 후 반환된 id로 onSelect가 호출된다', async () => {
    const onSelect = vi.fn();
    stubFetch({
      internal: [],
      external: [{ externalId: 'KAKAO_LOCAL_1', name: '숲속 놀이터', address: '경기 성남시', lat: 37.4, lng: 127.1 }],
      upsert: { ok: true, item: { id: 'new-1', name: '숲속 놀이터', address: '경기 성남시' } },
    });
    render(<SpotPicker selected={null} onSelect={onSelect} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '숲속 놀이터' } });
    const ext = await screen.findByText(/숲속 놀이터/);
    fireEvent.mouseDown(ext);

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith({ id: 'new-1', name: '숲속 놀이터', address: '경기 성남시' })
    );
  });

  it('Auto-Upsert가 실패하면 에러 문구를 보여주고 선택하지 않는다', async () => {
    const onSelect = vi.fn();
    stubFetch({
      internal: [],
      external: [{ externalId: 'KAKAO_LOCAL_1', name: '숲속 놀이터', address: '경기 성남시', lat: 37.4, lng: 127.1 }],
      upsert: { ok: false, error: '장소 등록에 실패했습니다.' },
    });
    render(<SpotPicker selected={null} onSelect={onSelect} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '숲속 놀이터' } });
    fireEvent.mouseDown(await screen.findByText(/숲속 놀이터/));

    expect(await screen.findByText('장소 등록에 실패했습니다.')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
