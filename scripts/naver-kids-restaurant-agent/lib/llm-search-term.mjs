// [LLM 보조 검색어 제안](todo.md 개선사항4 3단계): "식당명이 정확히 일치하지않을 수 있음..
// LLM으로 던져서.. 좀더 정확한 상호명 찾아서 네이버 플레이스에 입력하는 방식." 1차
// 검색(원본 명칭)에서 주소까지 맞는 확정 후보를 못 찾았을 때만 호출한다 — 매번 LLM을
// 거치면 결정성이 떨어지고(제2장 제5조) 비용도 커지므로, 결정적 매칭이 실패한 경우의
// 보조 수단으로만 쓴다.
import { callGeminiStructured } from './gemini-client.mjs';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestedSearchTerm: { type: 'STRING' },
  },
  required: ['suggestedSearchTerm'],
};

export async function suggestSearchTerm({ name, address, apiKey }) {
  const prompt = `아래는 우리 데이터베이스에 저장된 한국 식당의 상호명과 주소입니다.
이 식당을 네이버 지도에서 검색했을 때 가장 정확히 찾을 수 있을 것으로 예상되는
검색어(실제 네이버 지도/플레이스에 등록돼 있을 법한 공식 상호명, 지점명 포함)를
한 개만 제안하세요. 원본 명칭이 이미 정확하다고 판단되면 그대로 반환해도 됩니다.
과도하게 축약하거나 없는 정보를 지어내지 마세요.

상호명: ${name}
주소: ${address}`;

  const result = await callGeminiStructured({ apiKey, prompt, responseSchema: RESPONSE_SCHEMA });
  if (!result.ok) return null;

  const term = result.value?.suggestedSearchTerm;
  return typeof term === 'string' && term.trim() ? term.trim() : null;
}
