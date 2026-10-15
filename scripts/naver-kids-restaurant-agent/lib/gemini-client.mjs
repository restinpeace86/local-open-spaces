// [LLM 호출 공용 헬퍼](scripts/ingest/lib/ai-tagging.mjs의 classifyEventTypeWithAI와 동일
// 패턴 재사용 — 제5장 제4조 기존 구조 우선): 이 프로젝트에 설정된 LLM 키는 GEMINI_API_KEY
// 뿐이다(.env.local 실측 확인, OPENAI_API_KEY 없음) — todo.md 개선사항4가 "LLM으로"라고만
// 쓰고 특정 provider를 지정하지 않았으므로 기존에 이미 쓰고 있는 Gemini를 그대로 쓴다.
const GEMINI_MODEL = 'gemini-flash-lite-latest';

// responseSchema: Gemini structured output 스키마(JSON Schema 서브셋). 호출부가 매번
// 원하는 모양을 넘긴다 — 검색어 제안(문자열 1개)과 키즈친화 속성 추출(객체)이 서로 다른
// 모양이라 이 헬퍼는 스키마를 하드코딩하지 않는다(제5장 제6조).
export async function callGeminiStructured({ apiKey, prompt, responseSchema }) {
  if (!apiKey) return { ok: false, reason: 'NO_API_KEY' };

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
    });

    if (!res.ok) return { ok: false, reason: `HTTP_${res.status}` };

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, reason: 'EMPTY_RESPONSE' };

    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      return { ok: false, reason: 'INVALID_JSON' };
    }
  } catch (e) {
    return { ok: false, reason: `EXCEPTION_${e.message}` };
  }
}
