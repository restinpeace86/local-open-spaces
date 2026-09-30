// [표준중분류 미지정 데이터 LLM 분류 파이프라인](2026-09-30 사용자 지시):
// "미지정.csv 파일내에 약 1900건의 표준중분류 미지정된 데이터들이 있어..
// [표준중분류 리스트] 중에서 가장 적합한 항목 '하나'를 골라 정확히 매칭해
// 줘.. 어디에도 적합하지 않은건 미지정으로.. 한번에 20개씩 요청해서 C열에..
// 작성해줘" — scripts/ingest/lib/facility-classification.mjs와 동일한
// 재시도/분당·일일 한도 대응 패턴을 재사용한다(제5장 제4조 기존 구조 우선).
// 다른 점은 단일 건이 아니라 20건을 한 번에 배치로 묻고 JSON 배열로 받는다는
// 것(1,920건을 건별로 호출하면 무료 티어 일일 500회 한도를 훌쩍 넘기지만,
// 20건씩 묶으면 약 96회로 한도 안에 들어온다).
import { withRetry, isRetryableError } from '../ingest/lib/retry.mjs';

export const GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_TIMEOUT_MS = 30000;
export const REQUEST_INTERVAL_MS = 4000;
const RATE_LIMIT_BACKOFF_MS = 65000;
export const BATCH_SIZE = 20;

// [분류 대상 표준중분류 목록](open_spaces): src/lib/admin/category-min-groups.ts의
// OPEN_SPACES_GROUPS_STATIC과 동일하게 유지해야 한다(scripts/는 TS를 직접
// import하지 않는 기존 관례 — category-min-groups.mjs와 동일 패턴). '기타'/
// '민원 등 기타'는 "미지정과 사실상 같은 의미"라 후보에서 제외한다(둘 중 하나를
// 고르느니 미지정으로 남기는 것과 정보량이 같음 — 사용자 지시의 "어디에도
// 적합하지 않은건 미지정으로"와 일치).
export const ALLOWED_CATEGORY_MINS = [
  // 체육시설
  '테니스장', '골프장', '풋살장', '축구장', '농구장', '족구장', '체육관', '야구장',
  '다목적경기장', '배드민턴장', '탁구장', '배구장', '수영장', '운동장', '피클볼장',
  // 문화시설
  '공연장', '전시실', '도서관', '어린이도서관', '문화원', '문화의집', '미술관', '역사박물관',
  '어린이박물관', '종합/기타박물관', '과학관', '어린이과학관', '시민교육센터',
  // 자연/공원
  '공원', '생태공원', '수목원', '자연휴양림', '캠핑장', '광장', '역사유적지', '관광명소',
  // 농장/체험
  '체험휴양마을', '교육농장',
  // 키즈/놀이시설
  '어린이놀이터', '어린이놀이시설(야외)', '어린이놀이시설(실내)', '키즈카페', '놀이방식당',
  '바닥분수/물놀이시설', '체험학습장', '놀이방찜질방/스파',
  // 공공청사 대관
  '강당', '강의실', '다목적실', '회의실', '주민공유공간', '청년공간', '교육시설', '녹화장소',
  // 기타(필터성 값 2개 제외 — 위 주석 참고)
  '육아종합지원센터', '유아교육진흥원',
];

const UNASSIGNED_SENTINEL = 'UNASSIGNED';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildCategoryMinClassificationPrompt(rows, allowedCategories = ALLOWED_CATEGORY_MINS) {
  const facilityLines = rows
    .map((row, i) => `${i + 1}. 시설명: ${row.name || '(없음)'} | 주소: ${row.address || '(없음)'}`)
    .join('\n');

  return `당신은 공간 데이터 분류 전문가입니다. 아래 각 시설의 시설명과 주소만
근거로, 우리 서비스의 [표준중분류 리스트] 중 가장 적합한 항목 정확히 하나를
골라주세요. 시설명/주소의 내용을 추측으로 바꾸거나 보완하지 말고 주어진
그대로만 근거로 판단하세요. 리스트의 어느 항목에도 명확히 해당하지 않으면
억지로 끼워 맞추지 말고 "${UNASSIGNED_SENTINEL}"을 선택하세요.

[표준중분류 리스트]
${allowedCategories.join(', ')}

[분류 대상 ${rows.length}건]
${facilityLines}

출력은 반드시 아래 형식의 JSON 배열이어야 합니다. 배열 길이는 정확히 ${rows.length}개이며,
index는 위 번호(1부터 ${rows.length}까지)와 정확히 일치해야 합니다. category_min은
[표준중분류 리스트]에 있는 문자열을 정확히 그대로 쓰거나 "${UNASSIGNED_SENTINEL}"만
사용하세요. 리스트에 없는 새로운 이름을 만들어내지 마세요.

[
  { "index": 1, "category_min": "..." },
  ...
]`;
}

export function parseCategoryMinClassificationResponse(rawText, expectedCount, allowedCategories = ALLOWED_CATEGORY_MINS) {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const results = new Array(expectedCount).fill(null);
  for (const item of parsed) {
    if (!item || typeof item.index !== 'number') continue;
    const i = item.index - 1;
    if (i < 0 || i >= expectedCount) continue;
    if (typeof item.category_min !== 'string') continue;
    if (item.category_min === UNASSIGNED_SENTINEL) continue; // 이미 null로 초기화됨
    if (!allowedCategories.includes(item.category_min)) continue; // 목록에 없는 값은 추측 방지 위해 무시(미지정 유지)
    results[i] = item.category_min;
  }
  return results;
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
          generationConfig: { maxOutputTokens: 4096, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      }
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) {
    const err = new Error('LLM 분류 요청 실패 (HTTP 429)');
    err.isRateLimit = true;
    throw err;
  }
  if (!res.ok) throw new Error(`LLM 분류 요청 실패 (HTTP ${res.status})`);
  const json = await res.json();
  const answerText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof answerText !== 'string') throw new Error('LLM 응답에서 분류 결과를 찾지 못했습니다.');
  return answerText;
}

// batchRows: [{name, address}, ...] (최대 BATCH_SIZE개). 반환: batchRows와 같은 길이의
// 배열, 각 원소는 category_min 문자열 또는 null(미지정 유지).
export async function classifyBatch(batchRows, apiKey, allowedCategories = ALLOWED_CATEGORY_MINS) {
  const prompt = buildCategoryMinClassificationPrompt(batchRows, allowedCategories);
  const RATE_LIMIT_MAX_ATTEMPTS = 4;
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const answerText = await withRetry(() => callGeminiOnce(prompt, apiKey), {
        retries: 2,
        baseDelayMs: 3000,
        label: `batch(${batchRows.length}건)`,
        isRetryable: (err) => !err.isRateLimit && isRetryableError(err),
      });
      const parsed = parseCategoryMinClassificationResponse(answerText, batchRows.length, allowedCategories);
      if (!parsed) throw new Error('LLM 응답을 해석하지 못했습니다(형식 오류).');
      return parsed;
    } catch (err) {
      if (!err.isRateLimit || attempt === RATE_LIMIT_MAX_ATTEMPTS) throw err;
      console.warn(`⏳ 분당 한도 초과 — ${RATE_LIMIT_BACKOFF_MS / 1000}초 대기 후 재시도 (${attempt + 1}/${RATE_LIMIT_MAX_ATTEMPTS})`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(RATE_LIMIT_BACKOFF_MS);
    }
  }
  throw new Error('분당 한도 초과로 재시도 한도를 넘었습니다.');
}
