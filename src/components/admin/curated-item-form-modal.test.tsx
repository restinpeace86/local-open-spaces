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

// [마이리얼트립 검색 결과에서 등록](2026-09-16 사용자 지시): "검색어 입력 → 결과
// 카드에서 선택 → 자동입력" — prefill은 initial(수정 모드)과 달리 신규 등록(POST)
// 상태에서 값만 미리 채우는 것이라, id가 없어도 PATCH를 시도하면 안 된다.
describe('CuratedItemFormModal — prefill(마이리얼트립 검색 결과 등록, 2026-09-16)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prefill 값으로 입력창이 채워진 채로 열린다', () => {
    render(
      <CuratedItemFormModal
        prefill={{ title: '[교토] 기온 게이샤 지구 야간 워킹 투어', image_url: 'https://example.com/img.jpg', booking_url: 'https://experiences.myrealtrip.com/products/5905493' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByDisplayValue('[교토] 기온 게이샤 지구 야간 워킹 투어')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/img.jpg')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://experiences.myrealtrip.com/products/5905493')).toBeInTheDocument();
    // prefill은 신규 등록이지 수정이 아니므로 모달 제목도 등록 모드 그대로다.
    expect(screen.getByText('+ 신규 상품 등록')).toBeInTheDocument();
  });

  it('prefill로 채워진 상태에서 저장하면 PATCH가 아니라 POST로 등록된다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/curated-items') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'c1', ...body, created_at: '2026-09-16' } }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CuratedItemFormModal
        prefill={{ title: '오사카 투어', image_url: 'https://example.com/img.jpg', booking_url: 'https://experiences.myrealtrip.com/products/5905493' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'POST');
      expect(postCall).toBeDefined();
      expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === 'PATCH')).toBe(false);
    });
  });

  // [스팟 연결 후 등록 시 중복 작업 제거](2026-09-16 사용자 보고): "마이리얼트립
  // 에서 내 스팟과 연결있는데.. 제휴마케팅만들기 들어가면 스팟연결안되어있어서
  // 거기서 다시하고.. 그래서 2번하는걸로 되나?" — prefill.spot이 있으면 스팟을
  // 다시 검색하지 않아도 이미 선택된 상태로 열려야 한다.
  it('prefill.spot이 있으면 장소를 다시 검색하지 않아도 이미 연동된 상태로 열린다', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      void init;
      if (url.includes('/api/admin/service-categories')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: SERVICE_CATEGORIES }) } as Response);
      }
      if (url.includes('/api/admin/data-grid/space-link')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ space: { id: 'spot-9', name: '숲속 놀이터', standard_name: null, service_category_id: 'cat-1' } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CuratedItemFormModal
        prefill={{
          title: '숲속 키즈카페 입장권',
          booking_url: 'https://experiences.myrealtrip.com/products/5905493',
          spot: { id: 'spot-9', name: '숲속 놀이터', address: '경기 성남시' },
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    // 스팟 검색창이 아니라 이미 선택된 스팟명이 바로 보여야 한다("변경" 버튼 존재).
    expect(await screen.findByText('숲속 놀이터')).toBeInTheDocument();
    expect(screen.getByText('변경')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/장소명 3글자 이상/)).not.toBeInTheDocument();

    // 스팟이 이미 정해져 있으므로 노출 중분류 확인 UI도 곧바로 동작한다(spot.id 기준).
    expect(await screen.findByText(/노출 중분류: 체험 > 생태학습/)).toBeInTheDocument();
  });

  // [중복 등록 버그 수정](2026-09-16 사용자 보고): "반응 늦어서 똑같은거 2번
  // 입력한거에 대하여 큐레이션/제휴상품에 똑같은게 2개 들어가 있어" — 응답이
  // 늦는 동안 "등록하기"를 빠르게 두 번 눌러도 POST는 한 번만 나가야 한다.
  it('저장 버튼을 빠르게 두 번 눌러도 등록 요청은 한 번만 전송된다', async () => {
    let resolvePost: (() => void) | undefined;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/curated-items') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolvePost = () =>
            resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'c1', created_at: '2026-09-16' } }) } as Response);
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <CuratedItemFormModal
        prefill={{ title: '숲속 특가권', booking_url: 'https://x.com' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const submitButton = screen.getByText('등록하기');
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    resolvePost?.();

    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/api/admin/curated-items') && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(postCalls).toHaveLength(1);
    });
  });
});

// [실내/야외 분류 LLM 파이프라인](2026-09-17 사용자 지시): "공공데이터 및 외부
// 제휴 API에서 수집된 데이터를 분석하여 환경 속성을 자동으로 분류" — 제휴 상품
// 등록 폼에서 제목/설명을 그대로 넘겨 LLM 제안을 받고 select에 반영한다.
describe('CuratedItemFormModal — 실내/야외 자동 분류(2026-09-17)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubClassifyFetch(handlers: { classification?: string; confidence?: string; reason?: string; error?: string }) {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/classify-facility-environment')) {
        if (handlers.error) {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: handlers.error }) } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              result: {
                classification: handlers.classification ?? 'INDOOR',
                confidence: handlers.confidence ?? 'high',
                reason: handlers.reason ?? '실내 놀이시설로 명시됨',
              },
            }),
        } as Response);
      }
      if (url.includes('/api/admin/curated-items') && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: { id: 'c1', ...body, created_at: '2026-09-17' } }) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('제목/설명을 넣고 "🤖 LLM 자동 분류"를 누르면 결과를 보여주고 select에 매핑된 값을 채운다', async () => {
    stubClassifyFetch({ classification: 'INDOOR', confidence: 'high', reason: '실내 놀이시설로 명시됨' });
    render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '숲속 키즈카페 이용권' } });
    fireEvent.change(screen.getByLabelText('상세 설명'), { target: { value: '실내 놀이 공간입니다' } });
    fireEvent.click(screen.getByText('🤖 LLM 자동 분류'));

    expect(await screen.findByText(/INDOOR/)).toBeInTheDocument();
    expect(screen.getByText(/실내 놀이시설로 명시됨/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('실내')).toBeInTheDocument();
  });

  it('상품명을 입력하지 않으면 분류를 시도하지 않고 안내 문구를 보여준다', async () => {
    const fetchMock = stubClassifyFetch({});
    render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByText('🤖 LLM 자동 분류'));

    expect(await screen.findByText('상품명을 먼저 입력해 주세요.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/admin/classify-facility-environment'))).toBeUndefined();
  });

  it('분류 실패 시 에러 메시지를 보여준다', async () => {
    stubClassifyFetch({ error: 'LLM 분석 요청 실패 (HTTP 502)' });
    render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '숲속 키즈카페 이용권' } });
    fireEvent.click(screen.getByText('🤖 LLM 자동 분류'));

    expect(await screen.findByText('LLM 분석 요청 실패 (HTTP 502)')).toBeInTheDocument();
  });

  it('등록 시 facility_type이 payload에 포함된다', async () => {
    const fetchMock = stubClassifyFetch({ classification: 'OUTDOOR' });
    render(<CuratedItemFormModal onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '동물 목장 체험' } });
    fireEvent.change(screen.getByLabelText('제휴 링크(booking_url)'), { target: { value: 'https://x.com' } });
    fireEvent.click(screen.getByText('🤖 LLM 자동 분류'));
    await screen.findByDisplayValue('야외');

    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/api/admin/curated-items') && (c[1] as RequestInit)?.method === 'POST'
      );
      expect(JSON.parse((postCall![1] as RequestInit).body as string).facility_type).toBe('야외');
    });
  });
});
