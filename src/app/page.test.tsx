import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Home from './page';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: () => Promise.resolve({ data: [], error: null }),
  }),
}));

vi.mock('@/lib/kakao/load-kakao-sdk', () => ({
  // 지도 렌더링은 브라우저 전용 SDK에 의존하므로 테스트에서는 초기화가 진행되지 않도록 pending 상태로 둔다.
  loadKakaoMapSdk: () => new Promise(() => {}),
}));

describe('Home', () => {
  it('renders the map explorer controls', async () => {
    render(<Home />);
    expect((await screen.findAllByText('5km')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('상시 시설 보기').length).toBeGreaterThan(0);
  });
});
