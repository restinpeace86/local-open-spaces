import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callGeminiStructured } from './gemini-client.mjs';

describe('callGeminiStructured', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('apiKey가 없으면 호출하지 않고 NO_API_KEY를 반환한다', async () => {
    const result = await callGeminiStructured({ apiKey: null, prompt: 'p', responseSchema: {} });
    expect(result).toEqual({ ok: false, reason: 'NO_API_KEY' });
  });

  it('정상 응답이면 파싱된 JSON을 반환한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"suggestedSearchTerm":"테스트"}' }] } }],
      }),
    });

    const result = await callGeminiStructured({ apiKey: 'key', prompt: 'p', responseSchema: {} });
    expect(result).toEqual({ ok: true, value: { suggestedSearchTerm: '테스트' } });
  });

  it('HTTP 에러면 상태코드를 reason에 담아 실패 반환한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    const result = await callGeminiStructured({ apiKey: 'key', prompt: 'p', responseSchema: {} });
    expect(result).toEqual({ ok: false, reason: 'HTTP_503' });
  });

  it('응답 JSON이 깨져있으면 INVALID_JSON을 반환한다', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
    });

    const result = await callGeminiStructured({ apiKey: 'key', prompt: 'p', responseSchema: {} });
    expect(result).toEqual({ ok: false, reason: 'INVALID_JSON' });
  });

  it('네트워크 예외가 발생하면 EXCEPTION reason으로 반환한다', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await callGeminiStructured({ apiKey: 'key', prompt: 'p', responseSchema: {} });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('network down');
  });
});
