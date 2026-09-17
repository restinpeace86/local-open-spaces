// [실내/야외 분류 LLM 파이프라인](2026-09-17 사용자 지시) 공용 로직 — 최초 708건
// 일회성 백필 스크립트(scripts/classify-events-facility-type.mjs)와 매일 신규
// 반영분을 처리하는 배치(scripts/ingest/classify-new-events-facility-type.mjs)가
// 완전히 동일한 프롬프트/파싱/재시도 로직을 공유한다(제5장 제4조 — 세 번째로
// 복제하지 않는다). 프롬프트/파싱 규칙 자체는
// src/lib/admin/llm-facility-classification.ts(관리자 화면 API가 쓰는 TS 버전)와
// 완전히 동일하게 유지한다 — scripts/는 TS를 직접 import하지 않는 기존 관례
// (scripts/ingest/ 전체가 그렇듯 .mjs가 로직을 그대로 복제해 둠)를 따른다.
import { withRetry, isRetryableError } from './retry.mjs';

export const GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_TIMEOUT_MS = 20000;
// [실측 장애 수정](2026-09-17): 708건 일괄 백필 시도에서 동시 5개 병렬은 분당 한도를
// 즉시 소진시켰고, 짧은 재시도 백오프(3~6초)로는 회복되지 않았다. 순차 실행(호출부가
// 동시 1개로 두는 것을 전제) + 요청 간 고정 대기로 한도 안에서만 호출한다.
export const REQUEST_INTERVAL_MS = 4000;
const RATE_LIMIT_BACKOFF_MS = 65000;
export const CLASSIFICATION_TO_FACILITY_TYPE = { INDOOR: '실내', OUTDOOR: '야외', BOTH: '복합' };

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// [프롬프트 보강](2026-09-18 실측): 분류 대상 686건 중 293건(43%)이 description이
// 비어있어 title만으로는 근거가 부족한 경우가 많다. 반면 category_min(표준
// 중분류)은 98.5%, venue_name(장소명)은 95.9% 채워져 있고 실내/야외 판단에
// 실질적으로 도움이 되는 신호를 담고 있다(제3장 제5조 추측 금지 — 이미 DB에
// 있는 필드를 그대로 전달하는 것). src/lib/admin/llm-facility-classification.ts와
// 동일하게 유지한다.
function buildExtraContextLines(extraContext) {
  const lines = [];
  if (extraContext?.categoryMin?.trim()) lines.push(`- 표준 분류(중분류): ${extraContext.categoryMin.trim()}`);
  if (extraContext?.venueName?.trim()) lines.push(`- 장소명: ${extraContext.venueName.trim()}`);
  return lines.length > 0 ? `\n${lines.join('\n')}` : '';
}

export function buildFacilityClassificationPrompt(title, description, extraContext) {
  return `당신은 아이와 함께 가기 좋은 나들이/체험 장소 데이터를 검수하는 전문 AI
어시스턴트입니다. 주어진 상품(장소)의 제목, 상세 설명, (있는 경우) 표준 분류와
장소명을 보고, 그 장소의 환경 속성(실내/야외)을 아래 4가지 분류 기준에 따라
정확하게 판단하여 엄격한 JSON 형식으로 반환하는 것이 당신의 역할입니다.

### 분류 카테고리 정의 (4가지)
- INDOOR (실내 전용): 키즈카페, 블럭방, 실내 박물관, 미술관, 실내 공방, 쿠킹클래스 등 100% 실내
- OUTDOOR (야외 전용): 동물원, 목장, 캠핑장, 야외 수영장, 숲 체험, 생태공원 등 100% 야외
- BOTH (실내/야외 복합): 대형 테마파크(실내외 어트랙션 공존), 식물원(온실+야외정원) 등 복합 시설
- UNKNOWN (판단 불가): 텍스트만으로는 유추하기 어려운 경우

### 판단 규칙
1. classification (string): 위 4가지 중 하나 — 근거가 부족하면 추측으로
   단정하지 말고 UNKNOWN을 선택하세요.
2. confidence (string): "high"/"medium"/"low" 중 텍스트의 명확성에 따라 선택.
3. reason (string): 판단한 이유를 간결한 한글로 작성.

출력은 반드시 유효한 JSON 객체여야 합니다. 불필요한 마크다운 코드 블록이나
잡다한 텍스트는 포함하지 말고 순수 JSON만 반환하세요.

[분석 대상]
- 제목: ${title}
- 상세 설명: ${description?.trim() || '(상세 설명 없음)'}${buildExtraContextLines(extraContext)}

아래 JSON 스키마 형식에 맞춰 정확한 데이터를 반환해 주세요:

{
  "classification": "INDOOR",
  "confidence": "low",
  "reason": ""
}`;
}

const CLASSIFICATION_VALUES = ['INDOOR', 'OUTDOOR', 'BOTH', 'UNKNOWN'];
const CONFIDENCE_VALUES = ['high', 'medium', 'low'];

export function parseFacilityClassificationResponse(rawText) {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (!CLASSIFICATION_VALUES.includes(parsed.classification)) return null;
  if (!CONFIDENCE_VALUES.includes(parsed.confidence)) return null;
  return {
    classification: parsed.classification,
    confidence: parsed.confidence,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
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
          generationConfig: { maxOutputTokens: 300, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const err = new Error('LLM 분석 요청 실패 (HTTP 429)');
    err.isRateLimit = true;
    throw err;
  }
  if (!res.ok) throw new Error(`LLM 분석 요청 실패 (HTTP ${res.status})`);
  const json = await res.json();
  const answerText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof answerText !== 'string') throw new Error('LLM 응답에서 분석 결과를 찾지 못했습니다.');
  const result = parseFacilityClassificationResponse(answerText);
  if (!result) throw new Error('LLM 응답을 해석하지 못했습니다(형식 오류).');
  return result;
}

// [실측 장애 수정](2026-09-17): 429(분당 한도로 보이던 것이 실제로는 무료 티어
// 모델당 일일 500회 한도, "GenerateRequestsPerDayPerProjectPerModel-FreeTier"임을
// 직접 호출로 확인)는 짧은 백오프로 회복되지 않으므로 더 길게(65초) 기다린 뒤
// 재시도하고, 그 외 일시적 오류(타임아웃/네트워크)는 기존 withRetry(짧은 백오프)로
// 처리한다.
export async function classifyOne(title, description, apiKey, extraContext) {
  const prompt = buildFacilityClassificationPrompt(title, description, extraContext);
  const RATE_LIMIT_MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await withRetry(() => callGeminiOnce(prompt, apiKey), {
        retries: 2,
        baseDelayMs: 3000,
        label: title.slice(0, 20),
        isRetryable: (err) => !err.isRateLimit && isRetryableError(err),
      });
    } catch (err) {
      if (!err.isRateLimit || attempt === RATE_LIMIT_MAX_ATTEMPTS) throw err;
      console.warn(`⏳ 분당 한도 초과 — ${RATE_LIMIT_BACKOFF_MS / 1000}초 대기 후 재시도 (${attempt + 1}/${RATE_LIMIT_MAX_ATTEMPTS})`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(RATE_LIMIT_BACKOFF_MS);
    }
  }
  throw new Error('분당 한도 초과로 재시도 한도를 넘었습니다.');
}
