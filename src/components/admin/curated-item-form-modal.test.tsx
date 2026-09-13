import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CuratedItemFormModal } from './curated-item-form-modal';

const SERVICE_CATEGORIES = [{ id: 'cat-1', parent_category: '체험', category_name: '생태학습' }];

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

  // [노출 중분류 확인/입력](2026-09-13 사용자 지시): "큐레이션/제휴 상품 등록탭에서도
  // 장소 입력하면 해당 장소가 노출 중분류 없으면 관리자가 입력할수있도록.. events쪽의
  // 관리자 상세 팝업에서.. 하는것처럼" — raw-data-modal.tsx의 SpaceLinkEditor와 동일한
  // SpotServiceCategoryCheck를 이 폼에도 붙였는지 검증한다.
  describe('노출 중분류 확인/입력(2026-09-13)', () => {
    function stubFetchWithSpaceLink(serviceCategoryId: string | null) {
      const fetchMock = vi.fn((url: string, init?: RequestInit) => {
        void init;
        if (url.includes('/api/spots/search-external')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
        }
        if (url.includes('/api/spots/search')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ items: [{ id: 'spot-9', name: '숲속 놀이터', address: '경기 성남시' }] }),
          } as Response);
        }
        if (url.includes('/api/admin/service-categories')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: SERVICE_CATEGORIES }) } as Response);
        }
        if (url.includes('/api/admin/data-grid/space-link')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ space: { id: 'spot-9', name: '숲속 놀이터', standard_name: null, service_category_id: serviceCategoryId } }),
          } as Response);
        }
        if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ updated: 1 }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      });
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('연동한 장소에 노출 중분류가 없으면 경고와 선택·저장 UI를 보여준다', async () => {
      stubFetchWithSpaceLink(null);
      render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText(/장소명 3글자 이상/), { target: { value: '숲속 놀이터' } });
      fireEvent.mouseDown(await screen.findByText('숲속 놀이터'));

      expect(await screen.findByText(/노출 중분류가 없어요/)).toBeInTheDocument();
    });

    it('연동한 장소에 노출 중분류가 있으면 초록 배지로 보여준다', async () => {
      stubFetchWithSpaceLink('cat-1');
      render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText(/장소명 3글자 이상/), { target: { value: '숲속 놀이터' } });
      fireEvent.mouseDown(await screen.findByText('숲속 놀이터'));

      expect(await screen.findByText(/노출 중분류: 체험 > 생태학습/)).toBeInTheDocument();
      expect(screen.queryByText(/노출 중분류가 없어요/)).not.toBeInTheDocument();
    });

    it('경고에서 노출 중분류를 선택하고 저장하면 초록 배지로 바뀐다', async () => {
      const fetchMock = stubFetchWithSpaceLink(null);
      render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

      fireEvent.change(screen.getByPlaceholderText(/장소명 3글자 이상/), { target: { value: '숲속 놀이터' } });
      fireEvent.mouseDown(await screen.findByText('숲속 놀이터'));
      await screen.findByText(/노출 중분류가 없어요/);

      fireEvent.change(screen.getByDisplayValue('(선택 안 함)'), { target: { value: 'cat-1' } });
      fireEvent.click(screen.getByText('저장'));

      await waitFor(() => expect(screen.getByText(/노출 중분류: 체험 > 생태학습/)).toBeInTheDocument());
      expect(screen.queryByText(/노출 중분류가 없어요/)).not.toBeInTheDocument();

      const mappingCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/admin/open-spaces/bulk-category-mapping'));
      expect(mappingCall).toBeDefined();
      expect(JSON.parse((mappingCall![1] as RequestInit).body as string)).toEqual({ ids: ['spot-9'], service_category_id: 'cat-1' });
    });

    it('장소를 연동하지 않으면 노출 중분류 UI 자체가 보이지 않는다', async () => {
      stubFetchWithSpaceLink(null);
      render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

      expect(screen.queryByText(/노출 중분류/)).not.toBeInTheDocument();
    });
  });
});
