// spec/data/ai-rule.md 2. AI 파이프라인 역할 및 처리 범위 구현
// - 비정형 텍스트 정제 (2.1): HTML 태그/특수문자/중복 공백 제거 — 결정적 규칙이라 AI 호출 없이 처리
// - 표준 카테고리 자동 태깅 (2.2): 규칙 기반 매핑표(category-map.mjs)에 없는 애매한 값만 Gemini로 보조 분류
//
// Decision 005 / ai-rule.md 4.1 준수: AI가 불확실하면 임의 생성하지 않고 기본값(ETC)으로 떨어뜨리고 경고 로그를 남긴다.

const GEMINI_MODEL = 'gemini-flash-lite-latest';

export function cleanText(raw) {
  if (!raw) return '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// spec/data/ai-rule.md 3.2 표준 이벤트 유형 중 하나로만 응답하도록 강제한다.
const EVENT_TYPES = ['FESTIVAL', 'EXHIBITION', 'PERFORMANCE', 'POPUP', 'ETC'];

export async function classifyEventTypeWithAI({ title, rawLabel, apiKey }) {
  if (!apiKey) {
    console.warn(`⚠️ GEMINI_API_KEY 없음 → "${rawLabel}"(${title}) ETC로 분류`);
    return 'ETC';
  }

  const prompt = `당신은 지역 행사 정보를 표준 카테고리로 분류하는 데이터 정제 도구입니다.
아래 행사의 원본 분류명과 제목을 보고, 반드시 다음 5개 값 중 하나만 선택하세요: ${EVENT_TYPES.join(', ')}.
- FESTIVAL: 지역 축제, 문화 제전
- EXHIBITION: 미술 전시, 박람회, 역사 전시
- PERFORMANCE: 야외 공연, 음악회, 연극
- POPUP: 단기 팝업스토어, 체험 행사
- ETC: 위 4개 중 명확히 판단할 수 없는 경우

원본 분류명: ${rawLabel || '(없음)'}
제목: ${title || '(없음)'}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'text/x.enum',
            responseSchema: { type: 'STRING', enum: EVENT_TYPES },
          },
        }),
      }
    );

    if (!res.ok) {
      console.warn(`⚠️ Gemini 분류 실패 (HTTP ${res.status}) → "${rawLabel}"(${title}) ETC로 분류`);
      return 'ETC';
    }

    const data = await res.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!EVENT_TYPES.includes(answer)) {
      console.warn(`⚠️ Gemini 응답이 허용된 카테고리가 아님("${answer}") → "${rawLabel}"(${title}) ETC로 분류`);
      return 'ETC';
    }

    if (answer !== 'ETC') {
      console.log(`  🤖 AI 분류: "${rawLabel}"(${title}) → ${answer}`);
    }
    return answer;
  } catch (e) {
    console.warn(`⚠️ Gemini 호출 오류(${e.message}) → "${rawLabel}"(${title}) ETC로 분류`);
    return 'ETC';
  }
}
