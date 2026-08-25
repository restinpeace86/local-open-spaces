import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NearbyPage from './page';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    rpc: () => Promise.resolve({ data: [], error: null }),
  }),
}));

vi.mock('@/lib/kakao/load-kakao-sdk', () => ({
  // 지도 렌더링은 브라우저 전용 SDK에 의존하므로 테스트에서는 초기화가 진행되지 않도록 pending 상태로 둔다.
  loadKakaoMapSdk: () => new Promise(() => {}),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('NearbyPage', () => {
  it('renders the map explorer controls', async () => {
    render(<NearbyPage />);
    // Task 9-6-10(2026-08-23): /nearby가 상시 공간 전용으로 단일화되면서 on/off 토글
    // ("상시 시설 보기")이 제거됐다 — 대신 상시 공간 목적별 카테고리 칩이 항상 노출된다.
    expect((await screen.findAllByText('공원·광장')).length).toBeGreaterThan(0);
    // [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판): 반경 선택 버튼(1km/5km/10km)이
    // 전면 삭제됐다 — 더 이상 화면에 노출되지 않아야 한다.
    expect(screen.queryByText('5km')).not.toBeInTheDocument();
    expect(screen.queryByText('10km')).not.toBeInTheDocument();
  });
});
