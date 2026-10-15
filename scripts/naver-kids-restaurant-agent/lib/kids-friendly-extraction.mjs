// [키즈친화 속성 LLM 분석](todo.md 개선사항4 5단계): "정보 및 리뷰(아이와 함께가기좋아요)
// LLM 분석 (키즈친화 속성 추출: 아기 의자, 유아 식기, 키즈 메뉴 등)." 정보 탭의
// conveniences(네이버에 업체가 직접 등록한 편의시설)와 "아이와 가기 좋아요" 태그가
// 달린 리뷰 본문을 함께 LLM에 던져, 3개 속성 각각의 존재 여부와 근거 문장을 추출한다.
// 키워드 사전 단순 매칭이 아니라 LLM을 쓰는 이유: 리뷰 본문은 "아기의자 있어요"처럼
// 명시적이지 않고 "아이 데리고 편하게 먹기 좋아요"처럼 간접적으로 서술되는 경우가
// 많아, 문맥을 이해해야 정확히 추출된다(단순 키워드 매칭은 curation-badges.ts의
// RESTAURANT_KEYWORD_GROUPS가 이미 하고 있으나, 그건 관리자 화면의 블로그 후기
// 자동 하이라이트용이고 이 CSV 결과물은 사람이 다시 검수하기 전 1차 추출이라 더
// 적극적인 추론이 허용된다).
import { callGeminiStructured } from './gemini-client.mjs';

const ATTRIBUTE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    present: { type: 'BOOLEAN' },
    evidence: { type: 'STRING' },
  },
  required: ['present'],
};

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    kidsChair: ATTRIBUTE_SCHEMA,
    kidsTableware: ATTRIBUTE_SCHEMA,
    kidsMenu: ATTRIBUTE_SCHEMA,
  },
  required: ['kidsChair', 'kidsTableware', 'kidsMenu'],
};

function buildPrompt({ name, conveniences, kidGoodReviewBodies }) {
  const convenienceText = conveniences.length > 0 ? conveniences.join(', ') : '(등록된 편의시설 정보 없음)';
  const reviewText =
    kidGoodReviewBodies.length > 0
      ? kidGoodReviewBodies.map((b, i) => `[리뷰 ${i + 1}] ${b}`).join('\n')
      : '("아이와 가기 좋아요" 태그가 달린 리뷰를 찾지 못함)';

  return `아래는 한국 식당 "${name}"의 네이버 플레이스 정보입니다.
이 정보만을 근거로 아래 3개 키즈친화 속성이 실제로 있는지 판단하세요.
근거가 불충분하면 present를 false로 하고, 추측으로 있다고 단정하지 마세요.
present가 true면 evidence에 어느 문장/정보를 근거로 판단했는지 짧게 적으세요.

[편의시설 목록]
${convenienceText}

["아이와 가기 좋아요" 태그 리뷰]
${reviewText}

3개 속성:
1. kidsChair: 아기의자/유아용 의자/하이체어가 있는가
2. kidsTableware: 아기 식기/유아 식기(수저, 그릇 등)를 제공하는가
3. kidsMenu: 아이가 먹기 좋은 별도 키즈 메뉴가 있는가`;
}

export async function extractKidsFriendlyAttributes({ name, conveniences, kidGoodReviewBodies, apiKey }) {
  const prompt = buildPrompt({ name, conveniences, kidGoodReviewBodies });
  const result = await callGeminiStructured({ apiKey, prompt, responseSchema: RESPONSE_SCHEMA });
  if (!result.ok) return null;

  const value = result.value;
  if (!value?.kidsChair || !value?.kidsTableware || !value?.kidsMenu) return null;

  return {
    kidsChair: { present: Boolean(value.kidsChair.present), evidence: value.kidsChair.evidence ?? null },
    kidsTableware: { present: Boolean(value.kidsTableware.present), evidence: value.kidsTableware.evidence ?? null },
    kidsMenu: { present: Boolean(value.kidsMenu.present), evidence: value.kidsMenu.evidence ?? null },
  };
}
