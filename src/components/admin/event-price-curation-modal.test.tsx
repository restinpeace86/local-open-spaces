import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventPriceCurationModal } from './event-price-curation-modal';

// [이벤트/체험 스팟 다중 소스 가격 수집 및 관리자 검증 UI](2026-09-15 사용자 지시,
// implementation/todo.md [개선사항 6]) 단위 테스트.
const EVENT = { id: 'event-1', title: '가을 단풍 축제' };

function mockFetchByUrl(handlers: {
  candidates?: unknown[];
  final?: unknown;
  loadError?: string;
  saveOk?: boolean;
}) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/events/price-candidates') && (!init || init.method === undefined)) {
      if (handlers.loadError) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: handlers.loadError }) } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ candidates: handlers.candidates ?? [], final: handlers.final ?? null }),
      } as Response);
    }
    if (url.includes('/api/admin/events/price-candidates') && init?.method === 'PUT') {
      const ok = handlers.saveOk !== false;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? { item: JSON.parse(init.body as string) } : { error: '저장 실패' }),
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('모달을 열면 4개 소스 후보를 카드로 보여준다', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetchByUrl({
      candidates: [
        { source: 'blog', status: 'found', priceText: '성인 12,000원 / 아동 8,000원', ageText: null, sourceUrl: 'https://blog.naver.com/x' },
        { source: 'description', status: 'not_found', priceText: null, ageText: null },
        { source: 'official_site', status: 'error', priceText: null, ageText: null, sourceUrl: 'https://example.com', errorMessage: 'HTTP 404' },
        { source: 'raw_field', status: 'found', priceText: '무료', ageText: null, rawFieldName: 'PARTCPT_EXPN_INFO' },
      ],
    })
  );
  render(<EventPriceCurationModal event={EVENT} onClose={() => {}} />);

  expect(await screen.findByText(/성인 12,000원/)).toBeInTheDocument();
  expect(screen.getAllByText('🟢 가격/연령 감지됨')).toHaveLength(2);
  expect(screen.getByText('⚪ 데이터 없음')).toBeInTheDocument();
  expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();
  expect(screen.getByText(/raw_data\.PARTCPT_EXPN_INFO/)).toBeInTheDocument();
  expect(screen.getByText('수집된 블로그 글 확인하기 ↗')).toBeInTheDocument();
});

// [연령별 가격 구간 파싱](2026-09-15 사용자 보완 지시): "아동 5,000원이면 몇 세부터
// 몇 세까지가 아동인건지.. 가격이 연령별 구분되어있다면 이 연령기준도 같이 있어야
// 한다" — 유저 화면 노출이 아니라 관리자가 최종 확정할 때 라벨(연령/대상)-금액
// 매칭을 바로 볼 수 있게 카드에 구조화해 보여준다.
it('가격이 연령별로 나뉘어 있으면 라벨-금액 구간을 카드에 구조화해 보여준다', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetchByUrl({
      candidates: [
        {
          source: 'description',
          status: 'found',
          priceText: '성인 15,000원 / 36개월 미만 무료 / 아동 5,000원',
          ageText: null,
          priceTiers: [
            { label: '성인', priceWon: 15000, isFree: false },
            { label: '36개월 미만', priceWon: 0, isFree: true },
            { label: '아동', priceWon: 5000, isFree: false },
          ],
        },
      ],
    })
  );
  render(<EventPriceCurationModal event={EVENT} onClose={() => {}} />);

  expect(await screen.findByText(/성인: 15,000원/)).toBeInTheDocument();
  expect(screen.getByText(/36개월 미만: 무료/)).toBeInTheDocument();
  expect(screen.getByText(/아동: 5,000원/)).toBeInTheDocument();
});

it('priceTiers가 없는 후보(과거 스냅샷 등)도 에러 없이 렌더링된다', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetchByUrl({
      candidates: [{ source: 'description', status: 'found', priceText: '10,000원', ageText: null }],
    })
  );
  render(<EventPriceCurationModal event={EVENT} onClose={() => {}} />);

  expect(await screen.findByText(/10,000원/)).toBeInTheDocument();
});

it('기존에 확정된 값이 있으면 최종 입력 폼에 미리 채워진다', async () => {
  vi.stubGlobal(
    'fetch',
    mockFetchByUrl({
      candidates: [],
      final: { final_price_type: 'paid', final_age_text: '36개월 이상', final_price_text: '성인 10,000원', admin_note: '확인 완료' },
    })
  );
  render(<EventPriceCurationModal event={EVENT} onClose={() => {}} />);

  expect(await screen.findByDisplayValue('36개월 이상')).toBeInTheDocument();
  expect(screen.getByDisplayValue('성인 10,000원')).toBeInTheDocument();
  expect(screen.getByDisplayValue('확인 완료')).toBeInTheDocument();
});

it('최종 확정 값을 입력하고 저장하면 PUT으로 전송하고 모달을 닫는다', async () => {
  const fetchMock = mockFetchByUrl({ candidates: [] });
  vi.stubGlobal('fetch', fetchMock);
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(<EventPriceCurationModal event={EVENT} onClose={onClose} onSaved={onSaved} />);

  await waitFor(() => expect(screen.queryByText('수집 중...')).not.toBeInTheDocument());

  fireEvent.click(screen.getByText('유료'));
  fireEvent.change(screen.getByPlaceholderText(/36개월 이상/), { target: { value: '초등학생 이하' } });
  fireEvent.change(screen.getByPlaceholderText(/성인 12,000원/), { target: { value: '성인 15,000원' } });
  fireEvent.click(screen.getByText('💾 가격 정보 최종 확정 및 저장'));

  await waitFor(() => {
    const saveCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === 'PUT');
    expect(saveCall).toBeDefined();
    const body = JSON.parse((saveCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      event_id: 'event-1',
      final_price_type: 'paid',
      final_age_text: '초등학생 이하',
      final_price_text: '성인 15,000원',
    });
  });
  expect(onSaved).toHaveBeenCalledWith('event-1');
  expect(onClose).toHaveBeenCalled();
});

it('가격 유형 버튼을 다시 누르면 선택이 해제된다', async () => {
  vi.stubGlobal('fetch', mockFetchByUrl({ candidates: [] }));
  render(<EventPriceCurationModal event={EVENT} onClose={() => {}} />);
  await waitFor(() => expect(screen.queryByText('수집 중...')).not.toBeInTheDocument());

  const freeButton = screen.getByText('무료');
  fireEvent.click(freeButton);
  expect(freeButton.className).toContain('bg-gray-900');
  fireEvent.click(freeButton);
  expect(freeButton.className).not.toContain('bg-gray-900');
});

it('후보 수집에 실패하면 에러 메시지를 보여준다', async () => {
  vi.stubGlobal('fetch', mockFetchByUrl({ loadError: '가격 후보 수집 실패' }));
  render(<EventPriceCurationModal event={EVENT} onClose={() => {}} />);

  expect(await screen.findByText('가격 후보 수집 실패')).toBeInTheDocument();
});
