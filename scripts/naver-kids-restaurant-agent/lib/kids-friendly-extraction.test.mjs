import { describe, it, expect, vi, beforeEach } from 'vitest';

const callGeminiStructuredMock = vi.fn();
vi.mock('./gemini-client.mjs', () => ({ callGeminiStructured: callGeminiStructuredMock }));

const { extractKidsFriendlyAttributes } = await import('./kids-friendly-extraction.mjs');

describe('extractKidsFriendlyAttributes', () => {
  beforeEach(() => {
    callGeminiStructuredMock.mockReset();
  });

  it('Gemini 응답을 3개 속성 객체로 정리해 반환한다', async () => {
    callGeminiStructuredMock.mockResolvedValue({
      ok: true,
      value: {
        kidsChair: { present: true, evidence: '리뷰에 아기의자 언급' },
        kidsTableware: { present: false },
        kidsMenu: { present: true, evidence: '키즈메뉴 있음 확인' },
      },
    });

    const result = await extractKidsFriendlyAttributes({
      name: '식당A',
      conveniences: ['주차', '유아의자'],
      kidGoodReviewBodies: ['아기의자 있어서 좋았어요'],
      apiKey: 'key',
    });

    expect(result).toEqual({
      kidsChair: { present: true, evidence: '리뷰에 아기의자 언급' },
      kidsTableware: { present: false, evidence: null },
      kidsMenu: { present: true, evidence: '키즈메뉴 있음 확인' },
    });
  });

  it('Gemini 호출이 실패하면 null을 반환한다', async () => {
    callGeminiStructuredMock.mockResolvedValue({ ok: false, reason: 'HTTP_500' });

    const result = await extractKidsFriendlyAttributes({
      name: '식당A',
      conveniences: [],
      kidGoodReviewBodies: [],
      apiKey: 'key',
    });

    expect(result).toBeNull();
  });

  it('응답에 필수 속성이 빠져있으면 null을 반환한다', async () => {
    callGeminiStructuredMock.mockResolvedValue({ ok: true, value: { kidsChair: { present: true } } });

    const result = await extractKidsFriendlyAttributes({
      name: '식당A',
      conveniences: [],
      kidGoodReviewBodies: [],
      apiKey: 'key',
    });

    expect(result).toBeNull();
  });

  it('리뷰가 없어도 호출은 되고(프롬프트에 안내 문구가 들어감) 정상 동작한다', async () => {
    callGeminiStructuredMock.mockResolvedValue({
      ok: true,
      value: {
        kidsChair: { present: false },
        kidsTableware: { present: false },
        kidsMenu: { present: false },
      },
    });

    const result = await extractKidsFriendlyAttributes({
      name: '식당A',
      conveniences: [],
      kidGoodReviewBodies: [],
      apiKey: 'key',
    });

    expect(result.kidsChair.present).toBe(false);
    const promptArg = callGeminiStructuredMock.mock.calls[0][0].prompt;
    expect(promptArg).toContain('찾지 못함');
  });
});
