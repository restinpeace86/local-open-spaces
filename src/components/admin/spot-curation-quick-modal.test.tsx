import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpotCurationQuickModal } from './spot-curation-quick-modal';

// [실사용 버그 제보](2026-09-20 사용자 지시, "편백회관 장곡점" 사례): "스팟큐레이션에서
// 노출이름 수정되었는데.. 창닫고 다시열어도 그 상세페이지의 노출이름 수동수정쪽은
// 그대로 있던데" — open_spaces 상세(RawDataModal)에서 이 모달을 열어 노출 이름을
// 바꾸면, 그 최신 값이 onDisplayNameUpdated를 통해 부모(open_spaces 그리드 상태)에
// 전달되는지 검증한다. onServiceCategoryUpdated(BlogCurationModal)와 동일한 관례다.
describe('SpotCurationQuickModal — 노출 이름 변경 알림(2026-09-20)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch() {
    return vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/spot-curations/naver-crawl')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
      }
      if (url.includes('/api/admin/data-grid/display-name')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ row: {} }) } as Response);
      }
      if (url.includes('/api/admin/spot-curations') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              item: {
                id: 'curation-1',
                spot_id: 'spot-1',
                is_active: true,
                menu_items: [],
                curation_badges: [],
                created_at: '2026-09-20T00:00:00.000Z',
                updated_at: '2026-09-20T00:00:00.000Z',
                // 실제 버그 상황처럼, 저장 응답은 아직 새 display_name을 모르는 채로 온다.
                open_spaces: { name: '장우랑 & 양주회센터', display_name: null, address: null, category: 'INDOOR_PLAYGROUND' },
              },
            }),
        } as Response);
      }
      if (url.includes('/api/admin/spot-curations')) {
        // 마운트 시 spot_id 단건 조회 — 아직 큐레이션 없음(신규 등록 모드).
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ item: null }) } as Response);
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  }

  it('노출 이름을 바꾸고 저장하면 onDisplayNameUpdated가 최신 값으로 호출된다', async () => {
    vi.stubGlobal('fetch', mockFetch());
    const onDisplayNameUpdated = vi.fn();
    render(
      <SpotCurationQuickModal
        spotId="spot-1"
        spotName="장우랑 & 양주회센터"
        spotDisplayName={null}
        spotNaverPlaceId={null}
        spotAddress={null}
        spotCategoryMin={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onDisplayNameUpdated={onDisplayNameUpdated}
      />
    );

    await screen.findByText('+ 스팟 큐레이션 등록');
    fireEvent.change(screen.getByLabelText(/노출 이름/), { target: { value: '장우랑 놀이방' } });
    fireEvent.click(screen.getByText('등록하기'));

    await waitFor(() => expect(onDisplayNameUpdated).toHaveBeenCalledWith('spot-1', '장우랑 놀이방'));
  });
});
