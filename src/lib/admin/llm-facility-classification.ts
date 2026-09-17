// [실내/야외 분류 LLM 파이프라인](2026-09-17 사용자 지시): "공공데이터 및 외부
// 제휴 API에서 수집된 아이와 함께 가기 좋은 나들이/체험 상품 데이터(타이틀 및
// 상세 설명)를 분석하여, 해당 장소의 환경 속성을 자동으로 분류" — 순수 프롬프트
// 구성/응답 파싱 로직만 여기 두고(단위 테스트 용이성), 실제 Gemini 네트워크 호출은
// API 라우트가 담당한다(llm-blog-verification.ts와 동일한 관례, 제5장 제4조).
export type FacilityClassification = 'INDOOR' | 'OUTDOOR' | 'BOTH' | 'UNKNOWN';
export type FacilityClassificationConfidence = 'high' | 'medium' | 'low';

export type FacilityClassificationResult = {
  classification: FacilityClassification;
  confidence: FacilityClassificationConfidence;
  reason: string;
};

const CLASSIFICATION_VALUES: FacilityClassification[] = ['INDOOR', 'OUTDOOR', 'BOTH', 'UNKNOWN'];
const CONFIDENCE_VALUES: FacilityClassificationConfidence[] = ['high', 'medium', 'low'];

// 요청 원문의 4가지 분류 정의를 그대로 프롬프트에 반영한다(임의로 기준을 바꾸지
// 않음, 제3장 제5조 추측 금지).
export function buildFacilityClassificationPrompt(title: string, description: string | null): string {
  return `당신은 아이와 함께 가기 좋은 나들이/체험 장소 데이터를 검수하는 전문 AI
어시스턴트입니다. 주어진 상품(장소)의 제목과 상세 설명만 보고, 그 장소의 환경
속성(실내/야외)을 아래 4가지 분류 기준에 따라 정확하게 판단하여 엄격한 JSON
형식으로 반환하는 것이 당신의 역할입니다.

### 분류 카테고리 정의 (4가지)
- INDOOR (실내 전용): 키즈카페, 블럭방, 실내 박물관, 미술관, 실내 공방, 쿠킹클래스 등 100% 실내
- OUTDOOR (야외 전용): 동물원, 목장, 캠핑장, 야외 수영장, 숲 체험, 생태공원 등 100% 야외
- BOTH (실내/야외 복합): 대형 테마파크(실내외 어트랙션 공존), 식물원(온실+야외정원) 등 복합 시설
- UNKNOWN (판단 불가): 텍스트만으로는 유추하기 어려운 경우

### 판단 규칙
1. classification (string): 위 4가지 중 하나 — 제목/설명에 근거가 부족하면
   추측으로 단정하지 말고 UNKNOWN을 선택하세요.
2. confidence (string): "high"/"medium"/"low" 중 텍스트의 명확성에 따라 선택.
3. reason (string): 판단한 이유를 간결한 한글로 작성.

출력은 반드시 유효한 JSON 객체여야 합니다. 불필요한 마크다운 코드 블록이나
잡다한 텍스트는 포함하지 말고 순수 JSON만 반환하세요.

[분석 대상]
- 제목: ${title}
- 상세 설명: ${description?.trim() || '(상세 설명 없음)'}

아래 JSON 스키마 형식에 맞춰 정확한 데이터를 반환해 주세요:

{
  "classification": "INDOOR",
  "confidence": "low",
  "reason": ""
}`;
}

// Gemini에 responseMimeType: 'application/json'을 요청해도 방어적으로 마크다운
// 코드 블록(```json ... ```)이 섞여 오는 경우를 대비해 벗겨낸다. 필수 필드가
// 없거나 타입/열거값이 안 맞으면 null을 반환한다(추측으로 기본값을 채우지 않음
// — 호출부가 "분석 실패"로 정직하게 안내해야 한다, llm-blog-verification.ts와
// 동일한 방어적 파싱 관례).
export function parseFacilityClassificationResponse(rawText: string): FacilityClassificationResult | null {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (!CLASSIFICATION_VALUES.includes(obj.classification as FacilityClassification)) return null;
  if (!CONFIDENCE_VALUES.includes(obj.confidence as FacilityClassificationConfidence)) return null;

  return {
    classification: obj.classification as FacilityClassification,
    confidence: obj.confidence as FacilityClassificationConfidence,
    reason: typeof obj.reason === 'string' ? obj.reason : '',
  };
}
