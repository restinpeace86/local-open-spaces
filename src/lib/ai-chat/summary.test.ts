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
});
