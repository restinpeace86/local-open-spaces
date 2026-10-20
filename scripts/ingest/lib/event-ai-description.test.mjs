import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDescriptionRewritePrompt, generateDescription } from './event-ai-description.mjs';

describe('buildDescriptionRewritePrompt', () => {
  it('제목과 원본 설명을 프롬프트에 그대로 포함한다', () => {
    const prompt = buildDescriptionRewritePrompt('가을 숲 체험', '10월 20일 진행하는 숲 체험 프로그램입니다.');
    expect(prompt).toContain('가을 숲 체험');
    expect(prompt).toContain('10월 20일 진행하는 숲 체험 프로그램입니다.');
    expect(prompt).toContain('추측 금지');
  });
});

describe('generateDescription', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('OpenAI가 성공하면 그 결과를 그대로 반환하고 Gemini는 호출하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ choices: [{ message: { content: '감성적으로 재작성된 설명' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateDescription('가을 숲 체험', '원본 설명', {
      openaiApiKey: 'openai-key',
      geminiApiKey: 'gemini-key',
    });

    expect(result).toBe('감성적으로 재작성된 설명');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('api.openai.com');
  });

  it('OpenAI가 429(쿼터 소진)면 Gemini로 전환한다', async () => {
    const fetchMock = vi.fn((url) => {
      if (url.includes('api.openai.com')) {
        return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Gemini가 재작성한 설명' }] } }] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateDescription('가을 숲 체험', '원본 설명', {
      openaiApiKey: 'openai-key',
      geminiApiKey: 'gemini-key',
    });

    expect(result).toBe('Gemini가 재작성한 설명');
    const calledUrls = fetchMock.mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u) => u.includes('api.openai.com'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('generativelanguage.googleapis.com'))).toBe(true);
  });

  it('OPENAI_API_KEY가 없으면 바로 Gemini를 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Gemini 단독 결과' }] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateDescription('가을 숲 체험', '원본 설명', { geminiApiKey: 'gemini-key' });

    expect(result).toBe('Gemini 단독 결과');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
  });

  it('OpenAI 쿼터 소진인데 GEMINI_API_KEY도 없으면 에러를 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({}) })
    );

    await expect(
      generateDescription('가을 숲 체험', '원본 설명', { openaiApiKey: 'openai-key' })
    ).rejects.toThrow(/재작성을 생성할 수 없습니다/);
  });
});
