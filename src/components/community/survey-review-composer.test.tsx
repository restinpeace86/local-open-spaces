import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurveyReviewComposer } from './survey-review-composer';

vi.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ center: { lat: 37.5665, lng: 126.978 } }),
}));

const createSurveyReviewMock = vi.fn();
vi.mock('@/lib/community/posts', () => ({
  createSurveyReview: (...args: unknown[]) => createSurveyReviewMock(...args),
}));

function popularItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'space-1',
    name: '행복어린이공원',
    item_type: 'SPACE',
    category_min: '공원',
    address: '경기도 성남시 분당구',
    distance_meters: 1200,
    ...overrides,
  };
}

// [Decision 020](2026-09-04) / spec/community/mom-pick-grades.md 2.1·2.6·3-4: [설문형
// 스마트 리뷰 폼] 3단계 위저드 검증.
describe('SurveyReviewComposer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    createSurveyReviewMock.mockReset();
  });

  function stubPopularFetch(items: unknown[] = [popularItem()]) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/api/mom-pick/popular-spots')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items }) } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      })
    );
  }

  it('1단계에서 내 주변 인기 스팟 목록을 30km lat/lng로 조회해 보여준다', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [popularItem()] }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    expect(await screen.findByText('행복어린이공원')).toBeInTheDocument();
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/mom-pick/popular-spots');
    expect(calledUrl).toContain('lat=37.5665');
    expect(calledUrl).toContain('lng=126.978');
  });

  it('이벤트 항목은 🎪 아이콘과 함께 노출된다', async () => {
    stubPopularFetch([popularItem({ id: 'event-1', name: '가을 나들이 축제', item_type: 'EVENT', category_min: null })]);
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    const nameEl = await screen.findByText('가을 나들이 축제');
    expect(nameEl).toBeInTheDocument();
    expect(nameEl.parentElement?.textContent).toContain('🎪');
  });

  it('장소를 선택하지 않고 "다음"을 누르면 에러 문구를 보여주고 단계가 넘어가지 않는다', async () => {
    stubPopularFetch();
    render(<SurveyReviewComposer onPosted={vi.fn()} />);
    await screen.findByText('행복어린이공원');

    fireEvent.click(screen.getByText('다음'));

    expect(await screen.findByText('먼저 장소를 선택해주세요.')).toBeInTheDocument();
    expect(screen.queryByText('이 장소는 몇 세 아이와 가기 가장 좋았나요?')).not.toBeInTheDocument();
  });

  it('장소 선택 후 2단계(설문)로 넘어가 다중/단일 선택 문항에 응답할 수 있다', async () => {
    stubPopularFetch();
    render(<SurveyReviewComposer onPosted={vi.fn()} />);
    fireEvent.click(await screen.findByText('행복어린이공원'));
    fireEvent.click(screen.getByText('다음'));

    expect(await screen.findByText('이 장소는 몇 세 아이와 가기 가장 좋았나요?')).toBeInTheDocument();

    // 다중 선택(연령대) — 두 개를 누르면 둘 다 눌린 상태(aria-pressed=true)가 된다.
    fireEvent.click(screen.getByText('영유아'));
    fireEvent.click(screen.getByText('미취학'));
    expect(screen.getByText('영유아')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('미취학')).toHaveAttribute('aria-pressed', 'true');

    // 단일 선택(방문 환경) — 라디오처럼 하나만 선택된다.
    fireEvent.click(screen.getByText('☀️ 탁 트인 야외'));
    expect(screen.getByText('☀️ 탁 트인 야외')).toHaveAttribute('aria-checked', 'true');
  });

  it('3단계에서 자유글을 입력하고 등록하면 선택한 스팟/설문/글 내용을 그대로 createSurveyReview에 전달한다', async () => {
    stubPopularFetch();
    createSurveyReviewMock.mockResolvedValue({ id: 'post-1' });
    const onPosted = vi.fn();
    render(<SurveyReviewComposer onPosted={onPosted} />);

    fireEvent.click(await screen.findByText('행복어린이공원'));
    fireEvent.click(screen.getByText('다음')); // → 2단계
    fireEvent.click(screen.getByText('영유아'));
    fireEvent.click(screen.getByText('다음')); // → 3단계

    fireEvent.change(screen.getByPlaceholderText(/주차장은 넓은데/), { target: { value: '아이가 정말 좋아했어요' } });
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => expect(onPosted).toHaveBeenCalledWith({ id: 'post-1' }));
    expect(createSurveyReviewMock).toHaveBeenCalledWith(
      expect.objectContaining({
        spotId: 'space-1',
        eventId: null,
        content: '아이가 정말 좋아했어요',
        survey: expect.objectContaining({ ageGroups: ['영유아'] }),
      })
    );
  });

  it('이벤트를 선택하면 eventId로, spotId는 null로 전달한다', async () => {
    stubPopularFetch([popularItem({ id: 'event-1', name: '가을 나들이 축제', item_type: 'EVENT', category_min: null })]);
    createSurveyReviewMock.mockResolvedValue({ id: 'post-2' });
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    fireEvent.click(await screen.findByText(/가을 나들이 축제/));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() =>
      expect(createSurveyReviewMock).toHaveBeenCalledWith(expect.objectContaining({ spotId: null, eventId: 'event-1' }))
    );
  });

  it('등록에 성공하면 폼이 초기화되어 다시 1단계로 돌아간다', async () => {
    stubPopularFetch();
    createSurveyReviewMock.mockResolvedValue({ id: 'post-1' });
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    fireEvent.click(await screen.findByText('행복어린이공원'));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => expect(screen.getByText('어느 스팟인가요?')).toBeInTheDocument());
    expect(await screen.findByText('행복어린이공원')).toBeInTheDocument(); // 목록에서 다시 고를 수 있는 상태
  });
});
