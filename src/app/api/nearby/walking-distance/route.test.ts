import { afterEach, describe, expect, it, vi } from 'vitest';

// [스팟/이벤트 상세 "주변 주차장/식당" 아코디언 — 도보거리 배치 계산](2026-10-02 사용자
// 지시) 테스트: 캐시 우선 조회, Tmap 키 없을 때 직선거리 추정 폴백, Tmap 성공 시 캐시
// 저장까지 핵심 분기 4가지를 검증한다.
function makeSelectBuilder(cachedRows: Record<string, unknown>[]) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.in = () => Promise.resolve({ data: cachedRows, error: null });
  return builder;
}

function makeSupabaseMock({ cachedRows = [], upsertSpy }: { cachedRows?: Record<string, unknown>[]; upsertSpy?: ReturnType<typeof vi.fn> }) {
  return {
    createAdminClient: () => ({
      from: () => ({
        ...makeSelectBuilder(cachedRows),
        upsert: upsertSpy ?? vi.fn(() => Promise.resolve({ error: null })),
      }),
    }),
  };
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/nearby/walking-distance', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never;
}

const BASE_BODY = {
  originTable: 'open_spaces' as const,
  originId: 'spot-1',
  originLat: 37.5,
  originLng: 127.0,
  targets: [{ targetTable: 'seoul_public_parking_lots' as const, targetId: '1', lat: 37.501, lng: 127.001 }],
};

describe('POST /api/nearby/walking-distance', () => {
  afterEach(() => {
    vi.doUnmock('@/lib/supabase/admin');
    vi.doUnmock('@/lib/nearby/tmap-walking-client');
    vi.resetModules();
  });

  it('캐시에 있으면 Tmap을 호출하지 않고 캐시값을 그대로 반환한다', async () => {
    vi.doMock('@/lib/supabase/admin', () =>
      makeSupabaseMock({ cachedRows: [{ target_id: '1', distance_meters: 300, duration_seconds: 240 }] })
    );
    const fetchTmapWalkingRoute = vi.fn();
    vi.doMock('@/lib/nearby/tmap-walking-client', () => ({ hasTmapApiKey: () => true, fetchTmapWalkingRoute }));

    const { POST } = await import('./route');
    const res = await POST(makeRequest(BASE_BODY));
    const data = await res.json();

    expect(fetchTmapWalkingRoute).not.toHaveBeenCalled();
    expect(data.results).toEqual([{ targetId: '1', distanceMeters: 300, durationSeconds: 240, isEstimate: false }]);
  });

  it('캐시 미스 + Tmap 키 없음이면 직선거리 추정치를 반환하고 캐시에 저장하지 않는다', async () => {
    const upsertSpy = vi.fn(() => Promise.resolve({ error: null }));
    vi.doMock('@/lib/supabase/admin', () => makeSupabaseMock({ cachedRows: [], upsertSpy }));
    vi.doMock('@/lib/nearby/tmap-walking-client', () => ({
      hasTmapApiKey: () => false,
      fetchTmapWalkingRoute: vi.fn(),
    }));

    const { POST } = await import('./route');
    const res = await POST(makeRequest(BASE_BODY));
    const data = await res.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].isEstimate).toBe(true);
    expect(data.results[0].distanceMeters).toBeGreaterThan(0);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it('캐시 미스 + Tmap 성공이면 실측값을 반환하고 캐시에 저장한다', async () => {
    const upsertSpy = vi.fn(() => Promise.resolve({ error: null }));
    vi.doMock('@/lib/supabase/admin', () => makeSupabaseMock({ cachedRows: [], upsertSpy }));
    vi.doMock('@/lib/nearby/tmap-walking-client', () => ({
      hasTmapApiKey: () => true,
      fetchTmapWalkingRoute: vi.fn(() => Promise.resolve({ distanceMeters: 450, durationSeconds: 360 })),
    }));

    const { POST } = await import('./route');
    const res = await POST(makeRequest(BASE_BODY));
    const data = await res.json();

    expect(data.results).toEqual([{ targetId: '1', distanceMeters: 450, durationSeconds: 360, isEstimate: false }]);
    expect(upsertSpy).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          origin_table: 'open_spaces',
          origin_id: 'spot-1',
          target_table: 'seoul_public_parking_lots',
          target_id: '1',
          distance_meters: 450,
          duration_seconds: 360,
        }),
      ],
      { onConflict: 'origin_table,origin_id,target_table,target_id' }
    );
  });

  it('Tmap 호출이 예외를 던지면 직선거리 추정치로 폴백한다(무중단 원칙)', async () => {
    vi.doMock('@/lib/supabase/admin', () => makeSupabaseMock({ cachedRows: [] }));
    vi.doMock('@/lib/nearby/tmap-walking-client', () => ({
      hasTmapApiKey: () => true,
      fetchTmapWalkingRoute: vi.fn(() => Promise.reject(new Error('네트워크 오류'))),
    }));

    const { POST } = await import('./route');
    const res = await POST(makeRequest(BASE_BODY));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results[0].isEstimate).toBe(true);
  });

  it('필수 파라미터가 없으면 400을 반환한다', async () => {
    vi.doMock('@/lib/supabase/admin', () => makeSupabaseMock({ cachedRows: [] }));
    vi.doMock('@/lib/nearby/tmap-walking-client', () => ({ hasTmapApiKey: () => false, fetchTmapWalkingRoute: vi.fn() }));

    const { POST } = await import('./route');
    const res = await POST(makeRequest({ ...BASE_BODY, targets: [] }));

    expect(res.status).toBe(400);
  });
});
