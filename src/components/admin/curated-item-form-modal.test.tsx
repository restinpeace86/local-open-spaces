import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CuratedItemFormModal } from './curated-item-form-modal';

// [제휴 상품 ↔ 스팟(Spot) 연동](2026-09-10 사용자 지시, implementation/todo.md 개선사항6):
// 제휴 상품 등록 폼에서 장소를 선택하면 spot_id가 payload에 실린다.
describe('CuratedItemFormModal — 연동 장소(Spot)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/spots/search-external')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
      }
      if (url.includes('/api/spots/search')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [{ id: 'spot-9', name: '숲속 놀이터', address: '경기 성남시' }] }),
        } as Response);
      }
      if (url.includes('/api/admin/curated-items') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ item: { id: 'c1', ...body, created_at: '2026-09-10' } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('장소를 검색해 선택하면 등록 시 spot_id가 payload에 포함된다', async () => {
    const fetchMock = stubFetch();
    render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '숲속 특가권' } });
    fireEvent.change(screen.getByLabelText('제휴 링크(booking_url)'), { target: { value: 'https://x.com' } });

    fireEvent.change(screen.getByPlaceholderText(/장소명 3글자 이상/), { target: { value: '숲속 놀이터' } });
    fireEvent.mouseDown(await screen.findByText('숲속 놀이터'));

    // 선택되면 "변경" 버튼이 뜬다.
    expect(await screen.findByText('변경')).toBeInTheDocument();

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/curated-items') && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(post).toBeDefined();
      expect(JSON.parse((post![1] as RequestInit).body as string).spot_id).toBe('spot-9');
    });
  });

  it('장소를 선택하지 않으면 spot_id는 null로 전송된다', async () => {
    const fetchMock = stubFetch();
    render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '일반 상품' } });
    fireEvent.change(screen.getByLabelText('제휴 링크(booking_url)'), { target: { value: 'https://x.com' } });
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/curated-items') && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(JSON.parse((post![1] as RequestInit).body as string).spot_id).toBeNull();
    });
  });
});
