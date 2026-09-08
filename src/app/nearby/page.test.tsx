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
    // ("상시 시설 보기")이 제거됐다.
    // [스팟픽 나들이 전용 핵심 중분류 1단 필터 개편](2026-08-29): 대분류 탭 없이 핵심
    // 중분류 칩(+AI 추천)이 처음부터 1단으로 노출된다.
    expect((await screen.findAllByText(/AI 추천/)).length).toBeGreaterThan(0);
    // [프론트엔드 UI/UX 개선](2026-08-26, docs/spec.md 개정판): 지도 상단의 탐색
    // 반경(1km/5km/10km) Floating 선택 버튼은 전면 삭제됐다(FIXED_RADIUS_METERS로
    // 고정) — 지금 화면에 있는 "5km/10km/20km" 버튼은 그것과는 다른, 하단 상시
    // 바텀시트 전용 GPS 거리순 정렬 반경 선택이다(2026-09-08 사용자 지시, 별도
    // 개념 — map-explorer.test.tsx에서 그 동작을 검증한다).
    expect((await screen.findAllByRole('button', { name: '5km' })).length).toBeGreaterThan(0);
  });
});
