// [설명글 감성 톤 재작성](2026-10-21 todo.md 개선사항2 사용자 지시): "글 쓰는것도
// 기본 글과 설명있으면 이를 가지고 AI가 글쓰는것도 좋을 것 같아" + "전체적으로
// 감성적이고 부드러운 톤으로". 사용자 확인 결과 "신규/인기 스팟부터 단계적으로"로
// 범위를 좁혔고, LLM은 "OpenAI(gpt-5-mini) 먼저 쓰고, 무료 비용 끝나면(=쿼터 소진)
// Gemini로"라고 명시적으로 지시했다 — OpenAI를 주 공급자로, Gemini를 폴백으로 둔다
// (facility-classification.mjs의 Gemini 단일 공급자 패턴과 달리 이번엔 2개 공급자를
// 이어붙인다).
//
// [검토 게이트 없음](2026-10-21 사용자 확인): "생성되면 바로 공개" — spot_curations의
// is_active 같은 관리자 승인 단계를 두지 않는다. 생성 즉시 events.ai_description에
// 저장되고 바로 공개 화면에 노출된다(detail-modal.tsx).
import { withRetry, isRetryableError } from './retry.mjs';

export const OPENAI_MODEL = 'gpt-5-mini';
export const GEMINI_MODEL = 'gemini-flash-lite-latest';
const OPENAI_TIMEOUT_MS = 20000;
const GEMINI_TIMEOUT_MS = 20000;

export function buildDescriptionRewritePrompt(title, description) {
  return `당신은 아이와 함께 갈 만한 나들이/체험 장소를 소개하는 다정한 에디터입니다.
아래 "원본 설명"의 사실 정보(날짜, 장소, 대상, 비용, 신청 방법 등)는 하나도
바꾸거나 빼지 말고, 문장의 톤만 감성적이고 부드럽게 다시 써 주세요.

규칙:
1. 원본에 없는 내용을 새로 지어내지 마세요(추측 금지).
2. 원본의 핵심 정보(날짜·시간·장소·대상·비용·신청 방법 등)는 전부 그대로 남겨야 합니다.
3. 해요체의 따뜻하고 부드러운 톤으로 써 주세요.
4. 과도한 이모지나 감탄사는 쓰지 마세요.
5. 출력은 재작성된 설명 본문만 반환하세요(제목, 따옴표, 설명 같은 접두사 없이).

[제목]
${title}

[원본 설명]
${description}`;
}

async function callOpenAiOnce(prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let res;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 600,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const err = new Error('OpenAI 요청 실패 (HTTP 429 — 쿼터/레이트리밋)');
    err.isQuotaExceeded = true;
    throw err;
  }
  if (!res.ok) throw new Error(`OpenAI 요청 실패 (HTTP ${res.status})`);
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('OpenAI 응답에서 재작성된 텍스트를 찾지 못했습니다.');
  }
  return text.trim();
}

async function callGeminiOnce(prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 600 },
        }),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const err = new Error('Gemini 요청 실패 (HTTP 429 — 쿼터/레이트리밋)');
    err.isQuotaExceeded = true;
    throw err;
  }
  if (!res.ok) throw new Error(`Gemini 요청 실패 (HTTP ${res.status})`);
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Gemini 응답에서 재작성된 텍스트를 찾지 못했습니다.');
  }
  return text.trim();
}

// [공급자 전환](2026-10-21 사용자 지시 "한쪽 사용하고 나서 무료 비용끝나면 다른
// 한쪽 사용"): OpenAI를 우선 시도하고, 쿼터 소진(429)이거나 OPENAI_API_KEY 자체가
// 없으면 Gemini로 넘어간다. 그 외 일시적 오류(타임아웃/네트워크)는 각 공급자
// 안에서 기존 withRetry로 먼저 흡수한 뒤에만 다음 공급자로 넘어간다 — 멀쩡한
// 공급자를 일시적 오류 한 번에 바로 포기하지 않기 위함이다.
export async function generateDescription(title, description, { openaiApiKey, geminiApiKey } = {}) {
  const prompt = buildDescriptionRewritePrompt(title, description);

  if (openaiApiKey) {
    try {
      return await withRetry(() => callOpenAiOnce(prompt, openaiApiKey), {
        retries: 2,
        baseDelayMs: 3000,
        label: `openai:${title.slice(0, 20)}`,
        isRetryable: (err) => !err.isQuotaExceeded && isRetryableError(err),
      });
    } catch (err) {
      if (!err.isQuotaExceeded) throw err;
      console.warn(`⚠️  OpenAI 쿼터 소진으로 보임 — Gemini로 전환: ${err.message}`);
    }
  }

  if (!geminiApiKey) {
    throw new Error('OpenAI 쿼터 소진(또는 미설정)이고 GEMINI_API_KEY도 없어 재작성을 생성할 수 없습니다.');
  }
  return withRetry(() => callGeminiOnce(prompt, geminiApiKey), {
    retries: 2,
    baseDelayMs: 3000,
    label: `gemini:${title.slice(0, 20)}`,
    isRetryable: (err) => !err.isQuotaExceeded && isRetryableError(err),
  });
}
