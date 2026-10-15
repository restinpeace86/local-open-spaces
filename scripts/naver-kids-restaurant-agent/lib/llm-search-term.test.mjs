import { describe, it, expect, vi, beforeEach } from 'vitest';

const callGeminiStructuredMock = vi.fn();
vi.mock('./gemini-client.mjs', () => ({ callGeminiStructured: callGeminiStructuredMock }));

const { suggestSearchTerm } = await import('./llm-search-term.mjs');

describe('suggestSearchTerm', () => {
  beforeEach(() => {
    callGeminiStructuredMock.mockReset();
  });

  it('Gemini가 제안한 검색어를 반환한다', async () => {
    callGeminiStructuredMock.mockResolvedValue({ ok: true, value: { suggestedSearchTerm: '원조남원추어탕 시흥점' } });

    const term = await suggestSearchTerm({ name: '원조남원추어탕', address: '경기도 시흥시', apiKey: 'key' });

    expect(term).toBe('원조남원추어탕 시흥점');
  });

  it('호출이 실패하면 null을 반환한다', async () => {
    callGeminiStructuredMock.mockResolvedValue({ ok: false, reason: 'HTTP_500' });

    const term = await suggestSearchTerm({ name: '식당', address: '주소', apiKey: 'key' });

    expect(term).toBeNull();
  });

  it('응답에 빈 문자열이 오면 null을 반환한다', async () => {
    callGeminiStructuredMock.mockResolvedValue({ ok: true, value: { suggestedSearchTerm: '   ' } });

    const term = await suggestSearchTerm({ name: '식당', address: '주소', apiKey: 'key' });

    expect(term).toBeNull();
  });
});
