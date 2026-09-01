import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFinalSummary, buildTemplateSummary, SummaryContext } from './summary';

function ctx(overrides: Partial<SummaryContext> = {}): SummaryContext {
  return { vibeLabel: '힐링 자연', whenLabel: '오늘', resultCount: 8, usedFallback: false, hasKids: true, ...overrides };
}

describe('buildTemplateSummary', () => {
  it('조건을 반영한 자연스러운 한국어 문장을 만든다', () => {
    const text = buildTemplateSummary(ctx());
    expect(text).toContain('오늘');
    expect(text).toContain('힐링 자연');
    expect(text).toContain('8곳');
  });

  it('완화 검색을 썼으면 그 사실을 언급한다', () => {
    expect(buildTemplateSummary(ctx({ usedFallback: true }))).toContain('넓혀');
  });

  // [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 5: 반경 정보가 있으면
  // 구체적으로("몇 km에서 몇 km로") 안내해야 한다 — 뭉뚱그린 안내보다 투명함.
  it('원래/최종 반경이 있으면 구체적인 km 단위로 안내한다', () => {
    const text = buildTemplateSummary(ctx({ usedFallback: true, originalRadiusMeters: 1000, finalRadiusMeters: 5000 }));
    expect(text).toContain('1km');
    expect(text).toContain('5km');
  });
});

describe('buildFinalSummary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('API 키가 없으면 LLM을 호출하지 않고 템플릿으로 폴백한다', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const text = await buildFinalSummary(ctx(), undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(text).toBe(buildTemplateSummary(ctx()));
  });

  it('LLM 호출이 성공하면 그 응답 텍스트를 그대로 쓴다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: '오늘 딱 맞는 8곳을 찾았어요! 😊' }] } }] }),
        })
      )
    );
    const text = await buildFinalSummary(ctx(), 'test-key');
    expect(text).toBe('오늘 딱 맞는 8곳을 찾았어요! 😊');
  });

  it('LLM 호출이 실패해도 서비스가 끊기지 않고 템플릿으로 폴백한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network error')))
    );
    const text = await buildFinalSummary(ctx(), 'test-key');
    expect(text).toBe(buildTemplateSummary(ctx()));
  });

  it('LLM이 HTTP 에러를 반환해도 템플릿으로 폴백한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false }))
    );
    const text = await buildFinalSummary(ctx(), 'test-key');
    expect(text).toBe(buildTemplateSummary(ctx()));
  });

  // [코드 점검 및 성능 안정화](2026-09-01 사용자 지시) 항목 3: "엄격한 타임아웃(3~4초)"
  // 요구사항 — Gemini가 응답 없이 멈춰도(hang) 5초 안에는 반드시 템플릿으로 폴백해야
  // 챗봇 바텀시트가 무한정 로딩 상태로 남지 않는다. 실제 fetch가 영원히 응답하지 않는
  // 상황을 fake timer로 재현해 검증한다.
  it('LLM 응답이 멈춰도(hang) 5초 이내에 템플릿으로 폴백한다(엄격한 타임아웃)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, options?: RequestInit) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          })
      )
    );

    const promise = buildFinalSummary(ctx(), 'test-key');
    await vi.advanceTimersByTimeAsync(5000);
    const text = await promise;

    expect(text).toBe(buildTemplateSummary(ctx()));
    vi.useRealTimers();
  });
});
