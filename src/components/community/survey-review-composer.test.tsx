import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurveyReviewComposer } from './survey-review-composer';

vi.mock('@/hooks/use-user-location', () => ({
  useUserLocation: () => ({ center: { lat: 37.5665, lng: 126.978 } }),
}));

vi.mock('./spot-picker', () => ({
  SpotPicker: () => <div data-testid="spot-picker">이름으로 검색 UI</div>,
}));

// FaceStickerEditor는 tfjs/canvas에 의존하므로 jsdom에서 직접 검증하지 않고,
// 큐 진행 로직(confirm/skip/cancel 콜백)만 검증하기 위해 간단히 대체한다.
vi.mock('./face-sticker-editor', () => ({
  FaceStickerEditor: ({
    file,
    onConfirm,
    onSkip,
    onCancel,
  }: {
    file: File;
    onConfirm: (blob: Blob) => void;
    onSkip: () => void;
    onCancel: () => void;
  }) => (
    <div data-testid="face-sticker-editor">
      <span>편집 대상: {file.name}</span>
      <button type="button" onClick={() => onConfirm(new Blob(['stub'], { type: 'image/png' }))}>
        완료(스텁)
      </button>
      <button type="button" onClick={onSkip}>
        편집 없이 올리기(스텁)
      </button>
      <button type="button" onClick={onCancel}>
        이 사진 취소(스텁)
      </button>
    </div>
  ),
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

  // 1단계에서 "내 주변에서 찾기" 목록을 보려면 검색 모드에서 토글해야 한다
  // (2026-09-13 기본값 변경 이후) — 목록이 이미 도착해 있어야 클릭할 수 있으므로
  // 토글 전에 fetch가 끝나길 기다린다.
  async function switchToNearbyListMode() {
    fireEvent.click(screen.getByText('📍 내 주변에서 찾기'));
  }

  // [맘스픽 글쓰기 장소선택 속도 개선](2026-09-13 사용자 지시): "어느 스팟인가요
  // 해서 내 주변 찾는거 엄청 느린데?.. 힘들면 그냥 이름으로 검색이 처음에
  // 나오도록해" — 1단계 진입 시 "내 주변 인기 스팟"을 기다릴 필요 없이 이름
  // 검색(SpotPicker) UI가 바로 보여야 한다.
  it('1단계 진입 시 "내 주변 인기 스팟"을 기다리지 않고 이름 검색 UI가 바로 보인다', async () => {
    stubPopularFetch();
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    expect(screen.getByTestId('spot-picker')).toBeInTheDocument();
    expect(screen.queryByText('행복어린이공원')).not.toBeInTheDocument();
    expect(screen.queryByText('내 주변 인기 스팟을 찾는 중...')).not.toBeInTheDocument();
  });

  it('"내 주변에서 찾기"로 전환하면 30km lat/lng로 이미 조회해 둔 목록을 보여준다', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [popularItem()] }) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    // 검색 모드가 기본이어도 "내 주변 인기 스팟" 조회 자체는 백그라운드로 계속
    // 진행된다(토글했을 때 바로 보이도록).
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/api/mom-pick/popular-spots');
      expect(calledUrl).toContain('lat=37.5665');
      expect(calledUrl).toContain('lng=126.978');
    });

    await switchToNearbyListMode();
    expect(await screen.findByText('행복어린이공원')).toBeInTheDocument();
  });

  it('이벤트 항목은 🎪 아이콘과 함께 노출된다', async () => {
    stubPopularFetch([popularItem({ id: 'event-1', name: '가을 나들이 축제', item_type: 'EVENT', category_min: null })]);
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    await switchToNearbyListMode();
    const nameEl = await screen.findByText('가을 나들이 축제');
    expect(nameEl).toBeInTheDocument();
    expect(nameEl.parentElement?.textContent).toContain('🎪');
  });

  it('장소를 선택하지 않고 "다음"을 누르면 에러 문구를 보여주고 단계가 넘어가지 않는다', async () => {
    stubPopularFetch();
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    fireEvent.click(screen.getByText('다음'));

    expect(await screen.findByText('먼저 장소를 선택해주세요.')).toBeInTheDocument();
    expect(screen.queryByText('이 장소는 몇 세 아이와 가기 가장 좋았나요?')).not.toBeInTheDocument();
  });

  it('장소 선택 후 2단계(설문)로 넘어가 다중/단일 선택 문항에 응답할 수 있다', async () => {
    stubPopularFetch();
    render(<SurveyReviewComposer onPosted={vi.fn()} />);
    await switchToNearbyListMode();
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

    await switchToNearbyListMode();
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

    await switchToNearbyListMode();
    fireEvent.click(await screen.findByText(/가을 나들이 축제/));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() =>
      expect(createSurveyReviewMock).toHaveBeenCalledWith(expect.objectContaining({ spotId: null, eventId: 'event-1' }))
    );
  });

  it('등록에 성공하면 폼이 초기화되어 다시 1단계로 돌아간다(검색 모드가 기본)', async () => {
    stubPopularFetch();
    createSurveyReviewMock.mockResolvedValue({ id: 'post-1' });
    render(<SurveyReviewComposer onPosted={vi.fn()} />);

    await switchToNearbyListMode();
    fireEvent.click(await screen.findByText('행복어린이공원'));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('다음'));
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => expect(screen.getByText('어느 스팟인가요?')).toBeInTheDocument());
    // 폼이 초기화되면 검색 모드(기본값)로 돌아가 이름 검색 UI가 바로 보인다.
    expect(await screen.findByTestId('spot-picker')).toBeInTheDocument();
  });

  // [Decision — 2026-09-14 사용자 지시] "최종적으로 얼굴 인식해서 얼굴에
  // 스티커 합성해줘.. 사용자가 최종 판단하고.. 클릭으로 수동으로도": 사진을
  // 고르면 바로 업로드하지 않고 FaceStickerEditor를 거치도록 큐를 진행한다.
  describe('3단계 사진 업로드 — 얼굴 스티커 편집 큐', () => {
    function fetchMockFor(uploadUrl = 'https://storage.example/photo.png') {
      return vi.fn((url: string) => {
        if (url.includes('/api/mom-pick/popular-spots')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [popularItem()] }) } as Response);
        }
        if (url.includes('/api/mom-pick/upload-image')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ url: uploadUrl }) } as Response);
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      });
    }

    async function goToStep3() {
      await switchToNearbyListMode();
      fireEvent.click(await screen.findByText('행복어린이공원'));
      fireEvent.click(screen.getByText('다음'));
      fireEvent.click(screen.getByText('다음'));
    }

    function selectPhotoFiles(...files: File[]) {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files } });
    }

    it('사진을 고르면 즉시 업로드하지 않고 FaceStickerEditor가 먼저 열린다', async () => {
      vi.stubGlobal('fetch', fetchMockFor());
      render(<SurveyReviewComposer onPosted={vi.fn()} />);
      await goToStep3();

      const file = new File(['x'], 'photo1.png', { type: 'image/png' });
      selectPhotoFiles(file);

      expect(await screen.findByTestId('face-sticker-editor')).toBeInTheDocument();
      expect(screen.getByText('편집 대상: photo1.png')).toBeInTheDocument();
    });

    it('편집기에서 "완료"를 누르면 편집된 결과(blob)가 업로드되고 썸네일이 추가된다', async () => {
      const fetchMock = fetchMockFor('https://storage.example/edited.png');
      vi.stubGlobal('fetch', fetchMock);
      render(<SurveyReviewComposer onPosted={vi.fn()} />);
      await goToStep3();

      selectPhotoFiles(new File(['x'], 'photo1.png', { type: 'image/png' }));
      await screen.findByTestId('face-sticker-editor');
      fireEvent.click(screen.getByText('완료(스텁)'));

      await waitFor(() => {
        const uploadCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('upload-image'));
        expect(uploadCall).toBeTruthy();
      });
      await waitFor(() => expect(screen.queryByTestId('face-sticker-editor')).not.toBeInTheDocument());
      expect(await screen.findByAltText('')).toBeInTheDocument();
    });

    it('"편집 없이 올리기"를 누르면 원본 파일이 그대로 업로드된다', async () => {
      const fetchMock = fetchMockFor();
      vi.stubGlobal('fetch', fetchMock);
      render(<SurveyReviewComposer onPosted={vi.fn()} />);
      await goToStep3();

      selectPhotoFiles(new File(['x'], 'photo1.png', { type: 'image/png' }));
      await screen.findByTestId('face-sticker-editor');
      fireEvent.click(screen.getByText('편집 없이 올리기(스텁)'));

      await waitFor(() => {
        const uploadCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('upload-image'));
        expect(uploadCall).toBeTruthy();
      });
      await waitFor(() => expect(screen.queryByTestId('face-sticker-editor')).not.toBeInTheDocument());
    });

    it('"이 사진 취소"를 누르면 업로드 없이 큐에서 제거된다', async () => {
      const fetchMock = fetchMockFor();
      vi.stubGlobal('fetch', fetchMock);
      render(<SurveyReviewComposer onPosted={vi.fn()} />);
      await goToStep3();

      selectPhotoFiles(new File(['x'], 'photo1.png', { type: 'image/png' }));
      await screen.findByTestId('face-sticker-editor');
      fireEvent.click(screen.getByText('이 사진 취소(스텁)'));

      await waitFor(() => expect(screen.queryByTestId('face-sticker-editor')).not.toBeInTheDocument());
      const uploadCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('upload-image'));
      expect(uploadCall).toBeFalsy();
    });

    it('여러 장을 고르면 한 장씩 순서대로 편집기가 열린다', async () => {
      vi.stubGlobal('fetch', fetchMockFor());
      render(<SurveyReviewComposer onPosted={vi.fn()} />);
      await goToStep3();

      selectPhotoFiles(
        new File(['x'], 'photo1.png', { type: 'image/png' }),
        new File(['y'], 'photo2.png', { type: 'image/png' })
      );

      expect(await screen.findByText('편집 대상: photo1.png')).toBeInTheDocument();
      fireEvent.click(screen.getByText('편집 없이 올리기(스텁)'));

      expect(await screen.findByText('편집 대상: photo2.png')).toBeInTheDocument();
    });
  });
});
