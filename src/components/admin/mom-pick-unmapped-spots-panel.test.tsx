import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MomPickUnmappedSpotsPanel } from './mom-pick-unmapped-spots-panel';

// [관리자 화면 — 노출 중분류 미지정 + 맘스픽 글 있음 우선순위 큐](2026-09-13 사용자
// 지시): "맘스픽 글이 올라왔고 장소연결됐는데 노출중분류가 안되어 있다.. 관리자가
// 맘스픽에서 쓴글이랑 블로그 큐레이션 가지고 확인하고 노출중분류 추가하던가" —
// 다른 자기완결 패널(MomPickPostsPanel 등)과 달리 "탭을 열자마자 자동 조회"하는지,
// 글/블로그 큐레이션이 함께 보이는지, 워크벤치 진입(연결)만 확인한다(워크벤치 내부
// 동작 자체는 category-mapping-panel.test.tsx와 동일하게 mobile-curation-
// workbench.test.tsx가 이미 담당 — 여기서 다시 검증하지 않는다).
function mockFetchByUrl(handlers: { spots?: unknown; categories?: unknown }) {
  return vi.fn((url: string) => {
    if (url.includes('/api/admin/mom-pick-unmapped-spots')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.spots ?? { spots: [] }) } as Response);
    }
    if (url.includes('/api/admin/service-categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.categories ?? { items: [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/nearby')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations/blog-search')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [], hasRecentReview: false, hasNoResults: true }) } as Response);
    }
    if (url.includes('/api/admin/spot-curations')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

const SAMPLE_SPOT = {
  id: 'spot-1',
  name: '행복어린이공원',
  address: '경기도 성남시 분당구',
  category_min: '공원',
  sigungu_name: '분당구',
  service_category_id: null,
  posts: [
    {
      id: 'post-1',
      post_type: 'survey_review' as const,
      rating: null,
      content: '아이가 정말 좋아했어요',
      created_at: '2026-09-10T00:00:00Z',
      author_nickname: '민지맘',
    },
  ],
  curatedBlogUrls: ['https://blog.example.com/review-1'],
};

describe('MomPickUnmappedSpotsPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('다른 자기완결 패널과 달리 탭이 열리면 자동으로 조회한다(불러오기 버튼 없이)', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl({ spots: { spots: [SAMPLE_SPOT] } }));
    render(<MomPickUnmappedSpotsPanel />);

    expect(await screen.findByText('행복어린이공원')).toBeInTheDocument();
  });

  it('스팟 정보/맘스픽 글/기존 블로그 큐레이션을 함께 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl({ spots: { spots: [SAMPLE_SPOT] } }));
    render(<MomPickUnmappedSpotsPanel />);

    await screen.findByText('행복어린이공원');
    expect(screen.getByText(/경기도 성남시 분당구/)).toBeInTheDocument();
    expect(screen.getByText(/표준 중분류: 공원/)).toBeInTheDocument();
    expect(screen.getByText('아이가 정말 좋아했어요')).toBeInTheDocument();
    expect(screen.getByText(/민지맘/)).toBeInTheDocument();
    expect(screen.getByText('https://blog.example.com/review-1')).toBeInTheDocument();
  });

  it('노출 중분류 미지정 스팟이 없으면 안내 문구만 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl({ spots: { spots: [] } }));
    render(<MomPickUnmappedSpotsPanel />);

    expect(await screen.findByText('노출 중분류 지정이 필요한 장소가 없습니다.')).toBeInTheDocument();
  });

  it('"노출 중분류 지정하기"를 누르면 큐레이션 워크벤치가 열리고, 닫으면 목록으로 돌아온다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl({ spots: { spots: [SAMPLE_SPOT] } }));
    render(<MomPickUnmappedSpotsPanel />);

    await screen.findByText('행복어린이공원');
    fireEvent.click(screen.getByText('노출 중분류 지정하기'));

    expect(await screen.findByText('🧰 큐레이션 워크벤치')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('닫기'));

    await waitFor(() => expect(screen.queryByText('🧰 큐레이션 워크벤치')).not.toBeInTheDocument());
    expect(screen.getByText('행복어린이공원')).toBeInTheDocument();
  });

  it('조회 실패 시 에러 메시지를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/admin/mom-pick-unmapped-spots')) {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: '조회 실패했습니다' }) } as Response);
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) } as Response);
      })
    );
    render(<MomPickUnmappedSpotsPanel />);

    expect(await screen.findByText('조회 실패했습니다')).toBeInTheDocument();
  });
});
