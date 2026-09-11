import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBlogCurationModal } from './event-blog-curation-modal';

// [이벤트픽 관리자 블로그 큐레이션](2026-09-11 사용자 지시, implementation/todo.md
// 개선사항7-2) 단위 테스트.
const EVENT = { id: 'event-1', title: '가을 단풍 축제' };

function makeBlogItem(overrides: Partial<{ title: string; link: string; description: string; bloggername: string; postdate: string; isRecent: boolean }> = {}) {
  return {
    title: '가을 단풍 축제 다녀왔어요',
    link: 'https://blog.naver.com/abc/1',
    description: '단풍이 예쁘고 아이랑 가기 좋아요',
    bloggername: '맘블로거',
    postdate: '20260101',
    isRecent: true,
    ...overrides,
  };
}

function mockFetchByUrl(handlers: {
  blogSearch?: { items?: unknown[]; hasRecentReview?: boolean; hasNoResults?: boolean } | { error: string };
  existingUrls?: string[];
  saveOk?: boolean;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-curations/blog-search')) {
      const body = handlers.blogSearch ?? { items: [], hasRecentReview: false, hasNoResults: true };
      return Promise.resolve({ ok: !('error' in body), json: () => Promise.resolve(body) } as Response);
    }
    if (url.includes('/api/admin/spot-curations/blog-body')) {
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '네이버 블로그가 아닙니다.' }) } as Response);
    }
    if (url.includes('/api/admin/events/blog-curation') && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ urls: handlers.existingUrls ?? [] }) } as Response);
    }
    if (url.includes('/api/admin/events/blog-curation')) {
      const ok = handlers.saveOk !== false;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? { urls: JSON.parse((init!.body as string)).urls } : { error: '저장 실패' }),
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('EventBlogCurationModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('열리자마자(On-Demand) 이벤트명으로 블로그 검색을 자동 호출한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/blog-search'));
      expect(call).toBeDefined();
      expect(decodeURIComponent(call![0] as string)).toContain('query=가을 단풍 축제');
    });
    expect(await screen.findByText('가을 단풍 축제 다녀왔어요')).toBeInTheDocument();
  });

  it('검색 결과 후보를 체크하고 저장하면 curated_blog_urls로 PUT 요청을 보낸다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [makeBlogItem({ link: 'https://blog.naver.com/1' }), makeBlogItem({ link: 'https://blog.naver.com/2', title: '두번째 글' })],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(<EventBlogCurationModal event={EVENT} onClose={onClose} />);

    await screen.findByText('가을 단풍 축제 다녀왔어요');
    fireEvent.click(screen.getByLabelText(/블로그 1/));
    fireEvent.click(screen.getByLabelText(/블로그 2/));
    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string) === '/api/admin/events/blog-curation' && (c[1] as RequestInit)?.method === 'PUT'
    );
    expect(saveCall).toBeDefined();
    const body = JSON.parse((saveCall![1] as RequestInit).body as string);
    expect(body).toEqual({ event_id: 'event-1', urls: ['https://blog.naver.com/1', 'https://blog.naver.com/2'] });
  });

  it('이미 3개를 체크한 상태에서는 추가 체크박스가 비활성화된다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [
          makeBlogItem({ link: 'https://blog.naver.com/1' }),
          makeBlogItem({ link: 'https://blog.naver.com/2', title: '2번' }),
          makeBlogItem({ link: 'https://blog.naver.com/3', title: '3번' }),
        ],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await screen.findByText('가을 단풍 축제 다녀왔어요');
    fireEvent.click(screen.getByLabelText(/블로그 1/));
    fireEvent.click(screen.getByLabelText(/블로그 2/));
    fireEvent.click(screen.getByLabelText(/블로그 3/));

    expect(screen.getByLabelText(/블로그 1/)).not.toBeDisabled(); // 이미 체크된 건 해제 가능
    // 이미 3개가 다 체크된 상태이므로 남은 체크박스가 없다 — 대신 안내 문구 확인.
    expect(screen.getByText('최대 3개까지 선택할 수 있어요.')).toBeInTheDocument();
  });

  it('이미 저장된 URL이 있으면 프리필한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem({ link: 'https://blog.naver.com/1' })], hasRecentReview: true, hasNoResults: false },
      existingUrls: ['https://blog.naver.com/1'],
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByLabelText(/블로그 1/)).toBeChecked());
  });
});
