import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotDedupQuickModal } from './spot-dedup-quick-modal';

// [open_spaces 상세에서 중복 스팟 검토](2026-09-09 사용자 지시): "8월 일반캠핑존
// C형.. 장소기준으로는 난지캠핑장 하나 아니야?" — 한 장소에 여러 건이 겹칠 때
// (실측: 한강공원 난지캠핑장 42건) 체크박스로 여러 후보를 한 번에 골라 한 번의
// 합치기로 전부 묶을 수 있는지 검증한다.
const SPOT = { id: 'spot-1', name: '8월 일반캠핑존 A형(2인용, 자갈형) 26년 한강공원 난지캠핑장', category: 'ETC', category_min: '캠핑장', address: null };
const SERVICE_CATEGORIES = [{ id: 'svc-1', parent_category: '자연/공원', category_name: '캠핑장 / 피크닉장' }];

function makeCandidate(overrides: Partial<{ id: string; name: string; distance_m: number }> = {}) {
  return {
    id: 'cand-1',
    name: '8월 일반캠핑존 B형(4인용, 자갈형) 26년 한강공원 난지캠핑장',
    category: 'ETC',
    category_min: '캠핑장',
    address: null,
    distance_m: 0,
    ...overrides,
  };
}

function mockFetchByUrl(handlers: { nearby?: unknown; applyOk?: boolean }) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('/api/admin/spot-dedup/nearby')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(handlers.nearby ?? { items: [] }) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/pending-groups')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ group_key: 'k' }) } as Response);
    }
    if (url.includes('/api/admin/spot-dedup/apply')) {
      const ok = handlers.applyOk !== false;
      return Promise.resolve({
        ok,
        json: () => Promise.resolve(ok ? { group_id: 'group-1', updated_count: 3 } : { error: '병합 실패' }),
      } as Response);
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

describe('SpotDedupQuickModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('30m 이내 유사 장소가 없으면 안내 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', mockFetchByUrl({ nearby: { items: [] } }));
    render(<SpotDedupQuickModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} />);

    expect(await screen.findByText('30m 이내에 유사한 장소가 없습니다.')).toBeInTheDocument();
  });

  it('여러 후보를 체크하면 "선택한 N건 합치기" 버튼 개수가 늘어난다', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchByUrl({
        nearby: {
          items: [
            makeCandidate({ id: 'cand-1', name: '8월 일반캠핑존 B형', distance_m: 0 }),
            makeCandidate({ id: 'cand-2', name: '8월 일반캠핑존 C형', distance_m: 0 }),
            makeCandidate({ id: 'cand-3', name: '8월 프리캠핑존', distance_m: 0 }),
          ],
        },
      })
    );
    render(<SpotDedupQuickModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} />);

    await screen.findByText('8월 일반캠핑존 B형');
    expect(screen.getByRole('button', { name: /선택한 0건 합치기/ })).toBeDisabled();

    fireEvent.click(screen.getByLabelText('8월 일반캠핑존 B형 선택'));
    fireEvent.click(screen.getByLabelText('8월 일반캠핑존 C형 선택'));

    expect(screen.getByRole('button', { name: /선택한 2건 합치기/ })).not.toBeDisabled();
  });

  it('"다른 장소임"을 누르면 목록에서 빠지고 pending-groups에 ignored로 기록된다', async () => {
    const fetchMock = mockFetchByUrl({
      nearby: { items: [makeCandidate({ id: 'cand-1', name: '엉뚱한장소' })] },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotDedupQuickModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} />);

    await screen.findByText('엉뚱한장소');
    fireEvent.click(screen.getByText('다른 장소임'));

    expect(screen.queryByText('엉뚱한장소')).not.toBeInTheDocument();
    await waitFor(() => {
      const pendingCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/pending-groups'));
      expect(pendingCall).toBeDefined();
      expect(JSON.parse((pendingCall![1] as RequestInit).body as string)).toEqual({
        member_spot_ids: ['spot-1', 'cand-1'],
        status: 'ignored',
      });
    });
  });

  it('여러 건을 체크해 합치면 spot_ids에 현재 스팟 + 선택한 후보 전부가 담겨 저장된다', async () => {
    const fetchMock = mockFetchByUrl({
      nearby: {
        items: [
          makeCandidate({ id: 'cand-1', name: '8월 일반캠핑존 B형' }),
          makeCandidate({ id: 'cand-2', name: '8월 일반캠핑존 C형' }),
        ],
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<SpotDedupQuickModal spot={SPOT} serviceCategories={SERVICE_CATEGORIES} onClose={vi.fn()} />);

    await screen.findByText('8월 일반캠핑존 B형');
    fireEvent.click(screen.getByLabelText('8월 일반캠핑존 B형 선택'));
    fireEvent.click(screen.getByLabelText('8월 일반캠핑존 C형 선택'));
    fireEvent.click(screen.getByRole('button', { name: /선택한 2건 합치기/ }));

    expect(await screen.findByText('중복 의심 그룹 검수 (3건)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /저장 및 일괄 적용/ }));

    await waitFor(() => {
      const applyCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/apply'));
      expect(applyCall).toBeDefined();
      const body = JSON.parse((applyCall![1] as RequestInit).body as string);
      expect(body.spot_ids).toEqual(['spot-1', 'cand-1', 'cand-2']);
    });

    expect(await screen.findByText('✅ 3건을 하나로 합쳤습니다.')).toBeInTheDocument();
    // 합쳐진 후보는 목록에서도 사라진다.
    expect(screen.queryByText('8월 일반캠핑존 B형')).not.toBeInTheDocument();
  });

  // [중분류 선택 초기화 버그 수정](2026-09-09 사용자 지시): "중분류는 이미 중분류
  // 선택한거에 대하여 하는거라 선택안함 상태로 하면 중분류 한게 다시 선택안함으로
  // 변하는거 아니야?" — 이 스팟이 이미 노출 중분류로 매핑돼 있으면 병합 모달의
  // 중분류 select가 그 값으로 미리 채워져야 한다(빈 값으로 저장해 지우지 않도록).
  it('스팟이 이미 노출 중분류로 매핑돼 있으면 병합 모달의 중분류가 그 값으로 미리 채워진다', async () => {
    const fetchMock = mockFetchByUrl({ nearby: { items: [makeCandidate({ id: 'cand-1' })] } });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <SpotDedupQuickModal
        spot={{ ...SPOT, service_category_id: 'svc-1' }}
        serviceCategories={SERVICE_CATEGORIES}
        onClose={vi.fn()}
      />
    );

    const candidateName = '8월 일반캠핑존 B형(4인용, 자갈형) 26년 한강공원 난지캠핑장';
    await screen.findByText(candidateName);
    fireEvent.click(screen.getByLabelText(`${candidateName} 선택`));
    fireEvent.click(screen.getByRole('button', { name: /선택한 1건 합치기/ }));
    await screen.findByText('중복 의심 그룹 검수 (2건)');

    const categorySelect = screen.getByRole('combobox') as HTMLSelectElement;
    expect(categorySelect.value).toBe('svc-1');

    fireEvent.click(screen.getByRole('button', { name: /저장 및 일괄 적용/ }));

    await waitFor(() => {
      const applyCall = fetchMock.mock.calls.find((c) => (c[0] as string).includes('/api/admin/spot-dedup/apply'));
      const body = JSON.parse((applyCall![1] as RequestInit).body as string);
      expect(body.service_category_id).toBe('svc-1');
    });
  });
});
