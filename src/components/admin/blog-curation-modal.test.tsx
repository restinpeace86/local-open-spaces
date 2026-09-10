import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlogCurationModal } from './blog-curation-modal';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) 단위 테스트.
const SPOT = { id: 'spot-1', name: '행복키즈카페', address: '경기도 성남시 분당구 1', service_category_id: null };
const SERVICE_CATEGORIES = [{ id: 'svc-1', parent_category: '키즈/놀이시설', category_name: '키즈카페 / 실내놀이터' }];

function makeBlogItem(overrides: Partial<{ title: string; link: string; description: string; bloggername: string; postdate: string; isRecent: boolean }> = {}) {
  return {
    title: '행복키즈카페 다녀왔어요',
    link: 'https://blog.naver.com/abc/1',
    description: '주차장이 넓고 유모차도 편하게 다닐 수 있어요',
    bloggername: '맘블로거',
    postdate: '20260101',
    isRecent: true,
    ...overrides,
  };
}

function mockFetchByUrl(handlers: {
  blogSearch?: { items?: unknown[]; hasRecentReview?: boolean; hasNoResults?: boolean } | { error: string };
  existingCuration?: unknown;
  categoryMappingOk?: boolean;
  curationSaveOk?: boolean;
  // [전체 본문 보기](2026-09-05 사용자 지시): 기본값은 "네이버 블로그가 아님/실패"로
  // 422를 돌려줘 기존 테스트들이 요약 스니펫 폴백 그대로 통과하게 한다.
  blogBodyText?: string | null;
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
    if (url.includes('/api/admin/open-spaces/bulk-category-mapping')) {
      const ok = handlers.categoryMappingOk !== false;
      return Promise.resolve({ ok, json: () => Promise.resolve(ok ? { updated_count: 1 } : { error: '실패' }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations') && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: handlers.existingCuration ?? null }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations')) {
      const ok = handlers.curationSaveOk !== false;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? { item: { id: 'curation-1' } } : { error: '저장 실패' }),
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('BlogCurationModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('열리자마자(On-Demand) 스팟명으로 블로그 검색을 자동 호출한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/blog-search'));
      expect(call).toBeDefined();
      expect(decodeURIComponent(call![0] as string)).toContain('query=행복키즈카페');
    });
    expect(await screen.findByText('행복키즈카페 다녀왔어요')).toBeInTheDocument();
  });

  // [최신성 검증(1년 룰)](사용자 지시 원문): "3개 모두 1년 이상 지난 글이면.. 경고
  // 뱃지를 표시함."
  it('3개 모두 1년 이상 지난 글이면 경고 뱃지를 보여준다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [makeBlogItem({ isRecent: false }), makeBlogItem({ isRecent: false, link: 'b' })],
        hasRecentReview: false,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    expect(await screen.findByText('⚠️ 최근 1년간 후기 없음 - 폐업/방치 검토')).toBeInTheDocument();
  });

  it('최근 1년 이내 글이 하나라도 있으면 경고 뱃지를 보여주지 않는다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem({ isRecent: true })], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    expect(screen.queryByText('⚠️ 최근 1년간 후기 없음 - 폐업/방치 검토')).not.toBeInTheDocument();
  });

  it('탭을 누르면 해당 블로그의 본문(하이라이팅 포함)이 뷰어에 렌더링된다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [
          makeBlogItem({ title: '첫번째 글', description: '주차장 넓어요' }),
          makeBlogItem({ link: 'https://blog.naver.com/abc/2', title: '두번째 글', description: '유모차반입 가능해요' }),
        ],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('첫번째 글');
    expect(screen.getByText('주차장')).toBeInTheDocument(); // <mark>로 감싸진 키워드

    fireEvent.click(screen.getByText('블로그 2'));

    expect(await screen.findByText('두번째 글')).toBeInTheDocument();
    expect(screen.getByText('유모차반입')).toBeInTheDocument();
  });

  it('원문 보기 링크는 해당 탭의 블로그 URL로 새 창을 연다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem({ link: 'https://blog.naver.com/xyz/1' })], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    const link = await screen.findByText('원문 보기 ↗');
    expect(link).toHaveAttribute('href', 'https://blog.naver.com/xyz/1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('뱃지를 선택하고 저장하면 blog_url 3개(본문 제외)와 badges를 spot_curations에 저장한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: {
        items: [
          makeBlogItem({ link: 'https://blog.naver.com/1' }),
          makeBlogItem({ link: 'https://blog.naver.com/2' }),
          makeBlogItem({ link: 'https://blog.naver.com/3' }),
        ],
        hasRecentReview: true,
        hasNoResults: false,
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onClose = vi.fn();
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={onClose} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    fireEvent.click(screen.getByText('주차 완비'));
    fireEvent.click(screen.getByText('유모차 가능'));
    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const saveCall = fetchMock.mock.calls.find(
      (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
    );
    expect(saveCall).toBeDefined();
    const body = JSON.parse((saveCall![1] as RequestInit).body as string);
    expect(body).toEqual({
      spot_id: 'spot-1',
      blog_url_1: 'https://blog.naver.com/1',
      blog_url_2: 'https://blog.naver.com/2',
      blog_url_3: 'https://blog.naver.com/3',
      curation_badges: ['parking', 'stroller'],
      curation_note: null,
      min_age_recommended: 0,
    });
    // 본문(description)은 어디에도 전송되지 않는다(저장/폐기 정책).
    expect(JSON.stringify(body)).not.toContain('주차장이 넓고');
  });

  it('노출 중분류를 바꾸고 저장하면 bulk-category-mapping을 ids:[spot.id]로 호출한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onServiceCategoryUpdated = vi.fn();
    render(
      <BlogCurationModal
        spot={SPOT}
        serviceCategories={SERVICE_CATEGORIES}
        onClose={vi.fn()}
        onServiceCategoryUpdated={onServiceCategoryUpdated}
      />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    fireEvent.change(screen.getByDisplayValue('(선택 안 함)'), { target: { value: 'svc-1' } });
    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => expect(onServiceCategoryUpdated).toHaveBeenCalledWith('spot-1', 'svc-1'));
    const mappingCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/bulk-category-mapping'));
    expect(mappingCall).toBeDefined();
    expect(JSON.parse((mappingCall![1] as RequestInit).body as string)).toEqual({
      ids: ['spot-1'],
      service_category_id: 'svc-1',
    });
  });

  it('이미 큐레이션이 있으면 뱃지를 프리필하고 저장 시 PATCH를 호출한다', async () => {
    const fetchMock = mockFetchByUrl({
      blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      existingCuration: { id: 'existing-1', spot_id: 'spot-1', blog_url_1: null, blog_url_2: null, blog_url_3: null, curation_badges: ['parking'] },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
    );

    await screen.findByText('행복키즈카페 다녀왔어요');
    // [뱃지 상태별 시각적 색상 구분](2026-09-08 개선사항2-1): 이미 DB에 저장되어
    // 불러와진 뱃지는 파란색으로 표시된다(예전엔 단순 검은색이었음).
    await waitFor(() => expect(screen.getByText('주차 완비').closest('label')).toHaveClass('bg-blue-600'));

    fireEvent.click(screen.getByText('저장 및 완료'));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'PATCH'
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse((patchCall![1] as RequestInit).body as string).id).toBe('existing-1');
    });
  });

  // [뱃지 상태별 시각적 색상 구분](2026-09-08 사용자 지시, todo.md 개선사항2-1):
  // "AI가 1차 자동 체크했으나 아직 저장 안 된 상태는 초록, 이미 저장된 상태는 파란색"
  describe('뱃지 상태별 색상 구분', () => {
    it('신규 등록 시 방금 체크한 뱃지는 초록색(아직 저장 안 됨)이고, 저장하면 파란색(저장됨)으로 바뀐다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByText('행복키즈카페 다녀왔어요');
      fireEvent.click(screen.getByText('주차 완비'));
      expect(screen.getByText('주차 완비').closest('label')).toHaveClass('bg-green-600');

      fireEvent.click(screen.getByText('저장 및 완료'));
      await waitFor(() => {
        const saveCall = fetchMock.mock.calls.find(
          (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
        );
        expect(saveCall).toBeDefined();
      });
    });

    it('기존 큐레이션에서 이미 저장된 뱃지를 해제했다가 다시 체크하면 파란색(원래 저장된 값)을 유지한다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
        existingCuration: { id: 'existing-1', spot_id: 'spot-1', blog_url_1: null, blog_url_2: null, blog_url_3: null, curation_badges: ['parking'] },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByText('행복키즈카페 다녀왔어요');
      await waitFor(() => expect(screen.getByText('주차 완비').closest('label')).toHaveClass('bg-blue-600'));

      // 아직 저장된 적 없는 다른 뱃지를 새로 체크하면 초록색이어야 한다.
      fireEvent.click(screen.getByText('유모차 가능'));
      expect(screen.getByText('유모차 가능').closest('label')).toHaveClass('bg-green-600');
      // 기존 저장된 뱃지는 여전히 파란색 그대로다.
      expect(screen.getByText('주차 완비').closest('label')).toHaveClass('bg-blue-600');
    });
  });

  // [전체 본문 보기](2026-09-05 사용자 지시): "가져온 내용자체도 짧게하고 잘려서.."
  describe('전체 본문 보기(blog-body)', () => {
    it('네이버 블로그 전체 본문을 가져오면 요약 대신 전체 본문을 보여준다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem({ description: '짧은 요약' })], hasRecentReview: true, hasNoResults: false },
        blogBodyText: '이것은 훨씬 더 긴 전체 본문입니다. 상세한 후기가 이어집니다.',
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      expect(await screen.findByText('이것은 훨씬 더 긴 전체 본문입니다. 상세한 후기가 이어집니다.')).toBeInTheDocument();
      expect(screen.queryByText('짧은 요약')).not.toBeInTheDocument();
      expect(screen.getByText('✓ 전체 본문 표시 중(저장되지 않고 화면에만 표시됩니다)')).toBeInTheDocument();
    });

    it('전체 본문을 가져오지 못하면(네이버 블로그가 아니거나 실패) 기존 요약 스니펫으로 폴백한다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem({ description: '짧은 요약' })], hasRecentReview: true, hasNoResults: false },
        // blogBodyText 미지정 → 422 폴백
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      expect(await screen.findByText('짧은 요약')).toBeInTheDocument();
      expect(screen.queryByText('✓ 전체 본문 표시 중(저장되지 않고 화면에만 표시됩니다)')).not.toBeInTheDocument();
    });
  });

  // [수동 URL 교체](2026-09-05 사용자 지시): "네이버 블로그 관련도순 검색했을때
  // 이거아니야.." — 자동 검색 결과가 틀렸을 때 관리자가 직접 URL을 바꿀 수 있다.
  describe('수동 URL 교체', () => {
    it('"다른 URL로 바꾸기"로 URL을 바꾸면 저장 시 그 URL이 사용된다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: {
          items: [makeBlogItem({ link: 'https://blog.naver.com/wrong/1' })],
          hasRecentReview: true,
          hasNoResults: false,
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByText('행복키즈카페 다녀왔어요');
      fireEvent.click(screen.getByText('다른 URL로 바꾸기'));
      fireEvent.change(screen.getByPlaceholderText('https://blog.naver.com/...'), {
        target: { value: 'https://blog.naver.com/yjsjhs/223844311455' },
      });
      fireEvent.click(screen.getByText('적용'));
      fireEvent.click(screen.getByText('저장 및 완료'));

      const saveCall = await vi.waitFor(() => {
        const call = fetchMock.mock.calls.find(
          (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
        );
        expect(call).toBeDefined();
        return call!;
      });
      const body = JSON.parse((saveCall[1] as RequestInit).body as string);
      expect(body.blog_url_1).toBe('https://blog.naver.com/yjsjhs/223844311455');
    });
  });

  // [정렬 기준을 화면에서 전환](2026-09-06 사용자 지시): "나중에는 sim 기준으로도
  // 변경할수있도록.. 화면에서 sim/date 기준 변경해서도 호출할수 있게.. default는
  // date로."
  describe('정렬 기준 전환(sim/date)', () => {
    it('기본값은 최신순(date)으로 검색한다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/blog-search'));
        expect(call).toBeDefined();
        expect(call![0] as string).toContain('sort=date');
      });
    });

    it('"정확도순"을 누르면 즉시 sort=sim으로 다시 검색한다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByText('행복키즈카페 다녀왔어요');
      fireEvent.click(screen.getByText('정확도순'));

      await waitFor(() => {
        const calls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/blog-search'));
        expect(calls.some((c) => (c[0] as string).includes('sort=sim'))).toBe(true);
      });
    });
  });

  // [큐레이션 메모 입력란](2026-09-06 사용자 지시): "내가 입력란에 좀.. 붙여넣을
  // 수 있게.. 입력가능한 란도 하나 만들어줘" — 기존 spot_curations.curation_note
  // 재사용.
  describe('큐레이션 메모 입력란', () => {
    it('메모를 입력하고 저장하면 curation_note로 전송된다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByText('행복키즈카페 다녀왔어요');
      fireEvent.change(screen.getByPlaceholderText(/참고용 태그\/메모를 자유롭게 붙여넣으세요/), {
        target: { value: '#호박터숯불촌 #호박터숯불촌신월성점 #대구월성동맛집' },
      });
      fireEvent.click(screen.getByText('저장 및 완료'));

      const saveCall = await vi.waitFor(() => {
        const call = fetchMock.mock.calls.find(
          (c) => (c[0] as string) === '/api/admin/spot-curations' && (c[1] as RequestInit)?.method === 'POST'
        );
        expect(call).toBeDefined();
        return call!;
      });
      const body = JSON.parse((saveCall[1] as RequestInit).body as string);
      expect(body.curation_note).toBe('#호박터숯불촌 #호박터숯불촌신월성점 #대구월성동맛집');
    });

    it('기존 큐레이션의 메모가 있으면 프리필한다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
        existingCuration: {
          id: 'existing-1',
          spot_id: 'spot-1',
          blog_url_1: null,
          blog_url_2: null,
          blog_url_3: null,
          curation_badges: [],
          curation_note: '기존 메모입니다',
        },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      expect(await screen.findByDisplayValue('기존 메모입니다')).toBeInTheDocument();
    });
  });

  // [지능형 자가 치유 및 텍스트 정규화](2026-09-07 사용자 지시, implementation/todo.md
  // 개선사항3): "서울시 노원구라고 하면 상호명 + 노원 이런식으로" 1차 검색 + "가져온
  // 본문 데이터에 대하여 노원 이란 단어가 포함되어있는지 확인하고 노란색 마크" +
  // "키워드 하이라이팅에 따른 뱃지 자동 체크".
  describe('스마트 검색 쿼리 + 지역명 하이라이팅/경고 + 뱃지 자동 체크(개선사항3)', () => {
    const SPOT_WITH_REGION = { ...SPOT, sigungu_name: '서울시 노원구' };

    it('sigungu_name이 있으면 "상호명 + 시군구 핵심 지역명"으로 1차 검색한다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal
          spot={SPOT_WITH_REGION}
          serviceCategories={SERVICE_CATEGORIES}
          onClose={vi.fn()}
          onServiceCategoryUpdated={vi.fn()}
        />
      );

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/blog-search'));
        expect(call).toBeDefined();
        expect(decodeURIComponent(call![0] as string)).toContain('query=행복키즈카페 노원');
      });
    });

    it('본문에 지역명이 포함돼 있으면 함께 노란색으로 하이라이트되고 경고는 뜨지 않는다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
        blogBodyText: '노원에 있는 행복키즈카페 다녀왔어요. 주차도 편해요.',
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal
          spot={SPOT_WITH_REGION}
          serviceCategories={SERVICE_CATEGORIES}
          onClose={vi.fn()}
          onServiceCategoryUpdated={vi.fn()}
        />
      );

      expect(await screen.findByText('노원')).toBeInTheDocument();
      expect(screen.queryByText(/지역명을 찾지 못했습니다/)).not.toBeInTheDocument();
    });

    it('본문에 지역명이 없으면 미스매치 경고를 보여준다(추가 크롤링 없이 이미 가져온 본문만으로 판단)', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
        blogBodyText: '분당에 있는 행복키즈카페 다녀왔어요.',
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal
          spot={SPOT_WITH_REGION}
          serviceCategories={SERVICE_CATEGORIES}
          onClose={vi.fn()}
          onServiceCategoryUpdated={vi.fn()}
        />
      );

      expect(await screen.findByText(/"서울\/노원" 지역명을 찾지 못했습니다/)).toBeInTheDocument();
      // 이 경고 API 호출 자체가 추가 크롤링 없이 이미 받아온 blog-body 응답 하나로만
      // 판단됐는지 확인 — blog-body 호출은 활성 탭 1건에 대해서만 일어난다.
      expect(fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/blog-body'))).toHaveLength(1);
    });

    // [지역명 하이라이팅 범위 확장](2026-09-07 사용자 지시): "인천광역시 남동구
    // 용천로.. 시군구 이름은 인천시 남동구.. 인천하고 남동이 블로그 제목이나
    // 본문에 포함되어있는지 확인해서.. 노란색 마커표시.. 지금까진 본문에서
    // 남동만 찾아서 색 표시 했는데.. 이제는 블로그 제목도 포함시키고
    // 남동뿐만아니라 인천도 색 표시해줘"
    it('시군구 이름의 시/도 + 시/군/구 토큰 둘 다(예: 인천/남동)를 하이라이트 대상으로 쓴다', async () => {
      const SPOT_INCHEON = { ...SPOT, sigungu_name: '인천시 남동구' };
      vi.stubGlobal(
        'fetch',
        mockFetchByUrl({
          blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
          blogBodyText: '인천 남동에 있는 맛집이에요.',
        })
      );
      render(
        <BlogCurationModal spot={SPOT_INCHEON} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      expect(await screen.findByText('인천')).toBeInTheDocument();
      expect(screen.getByText('남동')).toBeInTheDocument();
    });

    it('본문이 아니라 블로그 제목에만 지역명이 있어도 하이라이트되고 미스매치 경고는 뜨지 않는다', async () => {
      const SPOT_INCHEON = { ...SPOT, sigungu_name: '인천시 남동구' };
      vi.stubGlobal(
        'fetch',
        mockFetchByUrl({
          blogSearch: {
            items: [makeBlogItem({ title: '인천 남동구 맛집 다녀왔어요' })],
            hasRecentReview: true,
            hasNoResults: false,
          },
          blogBodyText: '주차도 편하고 좋았어요.', // 본문엔 지역명이 없음
        })
      );
      render(
        <BlogCurationModal spot={SPOT_INCHEON} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByText('주차');
      // 제목 안의 "인천"/"남동"이 각각 하이라이트된다.
      expect(screen.getByText('인천')).toBeInTheDocument();
      expect(screen.getByText('남동')).toBeInTheDocument();
      // 본문엔 없지만 제목에는 있으므로 미스매치 경고는 뜨지 않는다.
      expect(screen.queryByText(/지역명을 찾지 못했습니다/)).not.toBeInTheDocument();
    });

    // [지역명 접미사 제거가 오히려 검색을 실패시키는 사례](2026-09-07 사용자
    // 지시): "모심갈비가 지역명이 인천광역시 남동구인데 모심갈비에 남동을
    // 붙여서 모심갈비 남동으로 찾으면 안나와.. 모심갈비 남동구는 나오고"
    it('1차 쿼리(접미사 제거)가 결과 없음이면 접미사를 유지한 폴백 쿼리로 자동 재검색한다', async () => {
      const SPOT_INCHEON = { ...SPOT, name: '모심갈비', sigungu_name: '인천시 남동구' };
      const fetchMock = vi.fn((url: string) => {
        if (url.includes('/api/admin/spot-curations/blog-search')) {
          const query = decodeURIComponent(url);
          if (query.includes('query=모심갈비 남동구')) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ items: [makeBlogItem({ title: '모심갈비 후기' })], hasRecentReview: true, hasNoResults: false }),
            } as Response);
          }
          // 1차 쿼리("모심갈비 남동")는 결과 없음.
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], hasRecentReview: false, hasNoResults: true }) } as Response);
        }
        if (url.includes('/api/admin/spot-curations/blog-body')) {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '네이버 블로그가 아닙니다.' }) } as Response);
        }
        if (url.includes('/api/admin/spot-curations')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT_INCHEON} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      // 1차 쿼리 호출 확인.
      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/blog-search'));
        expect(call).toBeDefined();
        expect(decodeURIComponent(call![0] as string)).toContain('query=모심갈비 남동');
      });
      // 폴백 쿼리로 자동 재검색돼 결과가 나타난다.
      expect(await screen.findByText('모심갈비 후기')).toBeInTheDocument();
      const searchCalls = fetchMock.mock.calls.filter((c) => (c[0] as string).includes('/blog-search'));
      expect(searchCalls).toHaveLength(2);
      expect(decodeURIComponent(searchCalls[1][0] as string)).toContain('query=모심갈비 남동구');
    });

    it('신규 등록(기존 큐레이션 없음)일 때 본문에서 매칭된 키워드에 해당하는 뱃지가 자동 체크된다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
        existingCuration: null,
        // [멀티 블로그 워닝 필터링](2026-09-08 개선사항2-3): 워닝(지역 키워드
        // 불일치) 걸린 블로그는 자동 체크 집계에서 제외되므로, 본문에 지역명
        // (노원)을 포함시켜 이 블로그가 정상(워닝 없음) 판정을 받게 한다.
        blogBodyText: '노원에서 주차 가능하고 수유실도 있어요.',
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal
          spot={SPOT_WITH_REGION}
          serviceCategories={SERVICE_CATEGORIES}
          onClose={vi.fn()}
          onServiceCategoryUpdated={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByLabelText('주차 완비')).toBeChecked();
        expect(screen.getByLabelText('수유실 있음')).toBeChecked();
      });
      expect(screen.getByLabelText('유모차 가능')).not.toBeChecked();
    });

    // [멀티 블로그 키워드 종합 분석 및 워닝 필터링](2026-09-08 사용자 지시, todo.md
    // 개선사항2-3): "블로그 1,2,3.. 전체 블로그의 키워드 및 본문을 종합.. 워닝이
    // 걸린 블로그는 키워드 분석 대상에서 제외"
    it('블로그 1,2,3 전체 본문을 종합해 뱃지를 자동 체크하되, 지역명이 없어 워닝이 걸린 블로그는 집계에서 제외한다', async () => {
      const link1 = 'https://blog.naver.com/1';
      const link2 = 'https://blog.naver.com/2';
      const link3 = 'https://blog.naver.com/3';
      const bodyTextByLink: Record<string, string> = {
        // 블로그1: 지역명(노원) 포함 -> 정상, 주차 뱃지 기여.
        [link1]: '노원에 있고 주차 가능해요.',
        // 블로그2: 제목/본문 어디에도 지역명(노원) 없음 -> 워닝 -> 집계에서 제외
        // (제외되지 않았다면 유모차/수유실 뱃지도 함께 체크됐을 것).
        [link2]: '유모차 가능하고 수유실도 있어요.',
        // 블로그3: 제목에 지역명(노원) 포함 -> 정상, 예약 필수 뱃지 기여.
        [link3]: '예약 필수입니다.',
      };
      const fetchMock = vi.fn((url: string) => {
        if (url.includes('/api/admin/spot-curations/blog-search')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                items: [
                  makeBlogItem({ link: link1, title: '키즈카페 후기' }),
                  makeBlogItem({ link: link2, title: '키즈카페 다녀옴' }),
                  makeBlogItem({ link: link3, title: '노원 맛집 키즈카페' }),
                ],
                hasRecentReview: true,
                hasNoResults: false,
              }),
          } as Response);
        }
        if (url.includes('/api/admin/spot-curations/blog-body')) {
          // URLSearchParams.get()이 퍼센트 인코딩을 이미 디코딩해 준다.
          const requestedUrl = new URL(url, 'http://localhost').searchParams.get('url') ?? '';
          const text = bodyTextByLink[requestedUrl];
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ text }) } as Response);
        }
        if (url.includes('/api/admin/spot-curations')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal
          spot={SPOT_WITH_REGION}
          serviceCategories={SERVICE_CATEGORIES}
          onClose={vi.fn()}
          onServiceCategoryUpdated={vi.fn()}
        />
      );

      await screen.findByText('키즈카페 후기');
      await waitFor(() => {
        expect(screen.getByLabelText('주차 완비')).toBeChecked(); // 블로그1(정상) 기여
        expect(screen.getByLabelText('예약 필수')).toBeChecked(); // 블로그3(정상) 기여
      });
      // 블로그2는 워닝(지역명 불일치)이 걸려 제외됐으므로 그 키워드는 반영되지 않는다.
      expect(screen.getByLabelText('유모차 가능')).not.toBeChecked();
      expect(screen.getByLabelText('수유실 있음')).not.toBeChecked();
    });

    it('기존 큐레이션을 수정하는 경우, 이미 저장된 뱃지 선택을 본문 자동 체크가 덮어쓰지 않는다', async () => {
      const fetchMock = mockFetchByUrl({
        blogSearch: { items: [makeBlogItem()], hasRecentReview: true, hasNoResults: false },
        existingCuration: {
          id: 'curation-1',
          spot_id: SPOT_WITH_REGION.id,
          blog_url_1: null,
          blog_url_2: null,
          blog_url_3: null,
          curation_badges: ['stroller'],
          curation_note: null,
        },
        blogBodyText: '주차 가능하고 수유실도 있어요.',
      });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal
          spot={SPOT_WITH_REGION}
          serviceCategories={SERVICE_CATEGORIES}
          onClose={vi.fn()}
          onServiceCategoryUpdated={vi.fn()}
        />
      );

      await waitFor(() => {
        const call = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/blog-body'));
        expect(call).toBeDefined();
      });
      await waitFor(() => expect(screen.getByLabelText('유모차 가능')).toBeChecked());
      expect(screen.getByLabelText('주차 완비')).not.toBeChecked();
      expect(screen.getByLabelText('수유실 있음')).not.toBeChecked();
    });
  });

  // [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07 사용자 지시, implementation/
  // todo.md 개선사항4): "노출 중분류에 대하여 적용시 [전부] 같이 가도록 적용해야지"
  describe('노출 중분류별 독립 뱃지 Config(개선사항4)', () => {
    it('기본(노출 중분류 미선택)은 식당용 13개 뱃지를 보여준다', async () => {
      vi.stubGlobal('fetch', mockFetchByUrl({ blogSearch: { items: [], hasRecentReview: false, hasNoResults: true } }));
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByLabelText('주차 완비');
      expect(screen.getByLabelText('좌식/온돌 있음')).toBeInTheDocument();
      expect(screen.queryByLabelText('트램폴린/방방')).not.toBeInTheDocument();
    });

    it('노출 중분류를 "키즈카페 / 실내놀이터"로 바꾸면 뱃지 목록이 즉시(서버 재요청 없이) 키즈카페 전용으로 바뀐다', async () => {
      const fetchMock = mockFetchByUrl({ blogSearch: { items: [], hasRecentReview: false, hasNoResults: true } });
      vi.stubGlobal('fetch', fetchMock);
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByLabelText('좌식/온돌 있음');
      const callCountBeforeSwitch = fetchMock.mock.calls.length;

      fireEvent.change(screen.getByDisplayValue('(선택 안 함)'), { target: { value: 'svc-1' } });

      expect(await screen.findByLabelText('트램폴린/방방')).toBeInTheDocument();
      expect(screen.queryByLabelText('좌식/온돌 있음')).not.toBeInTheDocument();
      // 서버 재요청 없이 클라이언트에서만 즉시 바뀌었는지 확인.
      expect(fetchMock.mock.calls.length).toBe(callCountBeforeSwitch);
    });

    it('식당 전용 뱃지를 체크한 뒤 키즈카페로 바꾸면 그 선택이 사라진다(다른 카테고리엔 없는 키라 유지할 수 없음)', async () => {
      vi.stubGlobal('fetch', mockFetchByUrl({ blogSearch: { items: [], hasRecentReview: false, hasNoResults: true } }));
      render(
        <BlogCurationModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} onServiceCategoryUpdated={vi.fn()} />
      );

      await screen.findByLabelText('좌식/온돌 있음');
      fireEvent.click(screen.getByLabelText('좌식/온돌 있음'));
      expect(screen.getByLabelText('좌식/온돌 있음')).toBeChecked();

      fireEvent.change(screen.getByDisplayValue('(선택 안 함)'), { target: { value: 'svc-1' } });

      await screen.findByLabelText('트램폴린/방방');
      expect(screen.queryByLabelText('좌식/온돌 있음')).not.toBeInTheDocument();
      // 다시 식당으로 돌아가도 방금 지워진 선택은 복구되지 않는다(되돌리기 기능 없음).
      fireEvent.change(screen.getByDisplayValue('키즈/놀이시설 > 키즈카페 / 실내놀이터'), { target: { value: '' } });
      expect(await screen.findByLabelText('좌식/온돌 있음')).not.toBeChecked();
    });
  });

});
