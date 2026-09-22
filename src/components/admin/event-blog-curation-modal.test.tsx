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
  existingPriceText?: string | null;
  existingTargetAudience?: string | null;
  saveOk?: boolean;
  blogBodyText?: string;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-curations/blog-search')) {
      const body = handlers.blogSearch ?? { items: [], hasRecentReview: false, hasNoResults: true };
      return Promise.resolve({ ok: !('error' in body), json: () => Promise.resolve(body) } as Response);
    }
    if (url.includes('/api/admin/spot-curations/blog-body')) {
      if (handlers.blogBodyText) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ text: handlers.blogBodyText }) } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '네이버 블로그가 아닙니다.' }) } as Response);
    }
    if (url.includes('/api/admin/events/blog-curation') && (!init || init.method === undefined)) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            urls: handlers.existingUrls ?? [],
            price_text: handlers.existingPriceText ?? null,
            target_audience: handlers.existingTargetAudience ?? null,
          }),
      } as Response);
    }
    if (url.includes('/api/admin/events/blog-curation')) {
      const ok = handlers.saveOk !== false;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? JSON.parse(init!.body as string) : { error: '저장 실패' }),
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

  // [블로그 하이라이팅](2026-09-11 사용자 지시): "가격이나 연령과 관련된 단어들을..
  // 노란색 형광펜 색칠해줘".
  it('블로그 제목/본문에서 가격·연령 관련 단어를 노란색으로 하이라이트한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [makeBlogItem({ title: '초등학생 이상 참가비 15,000원 행사 후기' })],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await waitFor(() => expect(container.querySelectorAll('mark').length).toBeGreaterThan(0));
    const markedTexts = Array.from(container.querySelectorAll('mark')).map((m) => m.textContent);
    expect(markedTexts).toEqual(expect.arrayContaining(['초등학생 이상', '참가비', '15,000원']));
  });

  it('식당 전용 뱃지 키워드(주차 등)는 섞여서 하이라이트되지 않는다(노출 중분류 개념 없음)', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [makeBlogItem({ title: '주차 가능한 행사장', description: '주차 공간이 넓어요' })],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await screen.findByText('주차 가능한 행사장');
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  // [블로그 검수 결과 반영 — 가격](2026-09-11 사용자 지시): "기껏 블로그에서 가격
  // 찾았는데.. 어디다 반영을 못하네.. 블로그글 복붙하면 파싱할 수 있는거라든지..".
  it('가격 정보 입력란에 직접 타이핑할 수 있다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await screen.findByText('가을 단풍 축제 다녀왔어요');
    const input = screen.getByLabelText(/가격 정보/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '성인 5,000원' } });
    expect(input.value).toBe('성인 5,000원');
  });

  it('"현재 블로그에서 자동 채우기" 버튼을 누르면 블로그 본문/요약에서 가격을 찾아 입력란을 채운다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [makeBlogItem({ description: '참가비 10,000원 입니다' })],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await screen.findByText('가을 단풍 축제 다녀왔어요');
    fireEvent.click(screen.getByText('🔍 현재 블로그에서 자동 채우기'));

    await waitFor(() => {
      const input = screen.getByLabelText(/가격 정보/) as HTMLInputElement;
      expect(input.value).toBe('참가비 10,000원');
    });
    expect(screen.queryByText(/가격을 찾지 못했어요/)).not.toBeInTheDocument();
  });

  it('블로그에서 가격을 찾지 못하면 안내 문구를 보여주고 입력란은 그대로 둔다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [makeBlogItem({ description: '단풍이 예뻐요, 가격 정보 없음' })],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await screen.findByText('가을 단풍 축제 다녀왔어요');
    fireEvent.click(screen.getByText('🔍 현재 블로그에서 자동 채우기'));

    expect(await screen.findByText(/가격을 찾지 못했어요/)).toBeInTheDocument();
    expect((screen.getByLabelText(/가격 정보/) as HTMLInputElement).value).toBe('');
  });

  // [타겟 연령 체크](2026-09-11 사용자 지시): "타겟 연령, INFANT/KIDS_PRE/KIDS_SCHOOL/
  // FAMILY 혹은 타겟 연령 선택 체크할 수 있도록 해줘".
  it('타겟 연령 버튼 4개가 렌더링되고, 클릭하면 선택/해제(단일 선택) 토글된다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await screen.findByText('가을 단풍 축제 다녀왔어요');
    const infant = screen.getByText('영유아');
    const kidsPre = screen.getByText('미취학');
    expect(screen.getByText('취학아동')).toBeInTheDocument();
    expect(screen.getByText('가족')).toBeInTheDocument();

    expect(infant).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(infant);
    expect(infant).toHaveAttribute('aria-pressed', 'true');

    // 다른 걸 누르면 단일 선택이라 이전 선택은 해제된다.
    fireEvent.click(kidsPre);
    expect(kidsPre).toHaveAttribute('aria-pressed', 'true');
    expect(infant).toHaveAttribute('aria-pressed', 'false');

    // 이미 선택된 걸 다시 누르면 미선택으로 돌아간다.
    fireEvent.click(kidsPre);
    expect(kidsPre).toHaveAttribute('aria-pressed', 'false');
  });

  it('기존에 저장된 가격/타겟 연령이 있으면 프리필한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      existingPriceText: '성인 15,000원',
      existingTargetAudience: 'FAMILY',
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<EventBlogCurationModal event={EVENT} onClose={vi.fn()} />);

    await waitFor(() => {
      expect((screen.getByLabelText(/가격 정보/) as HTMLInputElement).value).toBe('성인 15,000원');
    });
    expect(screen.getByText('가족')).toHaveAttribute('aria-pressed', 'true');
  });

  // [건드리지 않은 필드는 보내지 않는다](2026-09-11 사용자 지시 반영): 다른 화면에서
  // 이미 검수해 둔 값을 실수로 덮어쓰지 않기 위한 안전장치.
  it('가격/타겟 연령을 건드리지 않으면 PUT body에 해당 키를 포함하지 않는다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem({ link: 'https://blog.naver.com/1' })], hasRecentReview: true, hasNoResults: false },
      existingPriceText: '성인 15,000원',
      existingTargetAudience: 'FAMILY',
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(<EventBlogCurationModal event={EVENT} onClose={onClose} />);

    await waitFor(() => {
      expect((screen.getByLabelText(/가격 정보/) as HTMLInputElement).value).toBe('성인 15,000원');
    });
    fireEvent.click(screen.getByLabelText(/블로그 1/));
    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string) === '/api/admin/events/blog-curation' && (c[1] as RequestInit)?.method === 'PUT'
    );
    const body = JSON.parse((saveCall![1] as RequestInit).body as string);
    expect(body).toEqual({ event_id: 'event-1', urls: ['https://blog.naver.com/1'] });
    expect(body).not.toHaveProperty('price_text');
    expect(body).not.toHaveProperty('target_audience');
  });

  it('가격/타겟 연령을 바꾸면 PUT body에 변경된 값(명시적 null 포함)이 포함된다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem({ link: 'https://blog.naver.com/1' })], hasRecentReview: true, hasNoResults: false },
      existingPriceText: '성인 15,000원',
      existingTargetAudience: 'FAMILY',
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(<EventBlogCurationModal event={EVENT} onClose={onClose} />);

    await waitFor(() => {
      expect((screen.getByLabelText(/가격 정보/) as HTMLInputElement).value).toBe('성인 15,000원');
    });
    fireEvent.change(screen.getByLabelText(/가격 정보/), { target: { value: '무료' } });
    // 이미 선택된 '가족'을 다시 눌러 명시적으로 해제(null)한다.
    fireEvent.click(screen.getByText('가족'));
    fireEvent.click(screen.getByLabelText(/블로그 1/));
    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string) === '/api/admin/events/blog-curation' && (c[1] as RequestInit)?.method === 'PUT'
    );
    const body = JSON.parse((saveCall![1] as RequestInit).body as string);
    expect(body).toEqual({
      event_id: 'event-1',
      urls: ['https://blog.naver.com/1'],
      price_text: '무료',
      target_audience: null,
    });
  });
});
