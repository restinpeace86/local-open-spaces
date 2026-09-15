// [LLM 기반 블로그 큐레이션 매장 검증](2026-09-15 사용자 지시, implementation/todo.md
// [개선사항 8]): 관리자가 상호명을 입력하면 3개 키워드 조합(아기의자/아기식기/테라스
// 마당)×2개씩(총 6개) 블로그 스니펫을 모아 Gemini에 던져 매장 동일성/위치를 검증하고
// 영유아 친화 속성을 추출한다. 순수 프롬프트 구성/응답 파싱 로직만 여기 두고(단위
// 테스트 용이성), 실제 네트워크 호출(블로그 검색, Gemini API)은 API 라우트가 담당한다.

export type BlogSnippetInput = {
  title: string;
  description: string;
  bloggername: string;
  postdate: string; // "YYYYMMDD"
};

export type SpaceType = 'indoor' | 'outdoor' | 'mixed';
export type Confidence = 'high' | 'medium' | 'low';

export type LlmVerificationResult = {
  store_name: string;
  is_valid_match: boolean;
  has_high_chair: boolean;
  has_baby_tableware: boolean;
  space_type: SpaceType;
  confidence: Confidence;
  evidence_summary: string;
};

// 요청 원문 "A: 상호명 + 아기의자, B: 상호명 + 아기식기, C: 상호명 + 테라스 마당"을
// 그대로 따른다 — 임의로 다른 키워드를 추가하지 않는다(제3장 제5조 추측 금지).
export function buildQueryVariants(storeName: string): string[] {
  return [`${storeName} 아기의자`, `${storeName} 아기식기`, `${storeName} 테라스 마당`];
}

const SPACE_TYPE_VALUES: SpaceType[] = ['indoor', 'outdoor', 'mixed'];
const CONFIDENCE_VALUES: Confidence[] = ['high', 'medium', 'low'];

// 요청 원문의 JSON 스키마/출력 제약 사항을 그대로 반영한 프롬프트.
export function buildVerificationPrompt(storeName: string, storeAddress: string | null, snippets: BlogSnippetInput[]): string {
  const collectedSnippets = snippets
    .map((s, i) => `[${i + 1}] (${s.postdate}, ${s.bloggername}) ${s.title}\n${s.description}`)
    .join('\n\n');

  return `당신은 영유아 동반 나들이 및 식당 큐레이션 서비스("웰컴키즈존")를 위한 전문 AI 데이터 큐레이션 어시스턴트입니다. 당신의 역할은 특정 매장에 대해 수집된 멀티 쿼리 블로그 검색 스니펫들을 분석하여, 매장의 동일성/위치를 엄격하게 검증하고 영유아 친화 편의 시설 속성을 정확하게 추출하여 엄격한 JSON 형식으로 반환하는 것입니다.

### 1단계: 매장 동일성, 주소 및 지점 검증 (가장 중요)
- 대상 매장의 주소/행정동/도로명과 블로그 스니펫 내용을 철저히 대조하세요.
- 블로그 본문 안에 대상 주소와 일치하는 키워드(동 이름, 도로명, 지점명 등)가 포함되어 있는지 확인하세요.
- 상호명은 같지만 다른 지역/다른 지점(예: 강남점, 부산점 등)을 다루고 있거나 대상 주소와 전혀 무관한 곳이라면 is_valid_match를 false로 처리하세요.

### 2단계: 속성 추출 규칙 (유효한 매장인 경우에만)
1. is_valid_match (boolean): 스니펫이 대상 매장/위치와 신뢰할 수 있게 일치하면 true, 지점이 다르거나 다른 지역이면 false.
2. has_high_chair (boolean): 아기의자(하이체어, 아기 의자) 언급이 명시적이거나 암시적으로 있으면 true, 없으면 false.
3. has_baby_tableware (boolean): 유아식기, 아기식판, 유아용 포크/숟가락, 앞접시 등 제공 언급이 있으면 true, 없으면 false.
4. space_type (string): "indoor"(일반 실내, 기본값) / "outdoor"(전면 야외) / "mixed"(테라스·잔디마당·루프탑 등 실내외 공존).
5. confidence (string): "high"/"medium"/"low" 중 텍스트의 명확성과 빈도에 따라 선택.
6. evidence_summary (string): 한국어로 결정 이유를 간략하게 요약. 잘못되었거나 모호한 스니펫을 필터링했다면 그 내용을 명시할 것.

출력은 반드시 유효한 JSON 객체여야 합니다. 불필요한 마크다운 코드 블록이나 잡다한 텍스트는 포함하지 말고 순수 JSON만 반환하세요.

[대상 매장 정보]
- 매장명: ${storeName}
- 타겟 지역/주소: ${storeAddress ?? '(주소 정보 없음)'}

[수집된 블로그 본문 모음 (최근 1년 이내, 멀티쿼리 6개 통합)]
${collectedSnippets || '(수집된 블로그 스니펫 없음)'}

위 블로그 본문들을 바탕으로 대상 매장과의 일치 여부를 검증하고, 타지역 지점이나 잘못 매칭된 글을 걸러낸 뒤, 아래 JSON 스키마 형식에 맞춰 정확한 데이터를 반환해 주세요:

{
  "store_name": "${storeName}",
  "is_valid_match": true,
  "has_high_chair": false,
  "has_baby_tableware": false,
  "space_type": "indoor",
  "confidence": "low",
  "evidence_summary": ""
}`;
}

// Gemini에 responseMimeType: 'application/json'을 요청해도 방어적으로 마크다운 코드
// 블록(```json ... ```)이 섞여 오는 경우를 대비해 벗겨낸다. 필수 필드가 없거나 타입이
// 안 맞으면 null을 반환한다(추측으로 기본값을 채우지 않음 — 호출부가 "분석 실패"로
// 정직하게 안내해야 한다).
//
// [실측 버그 수정] LLM이 수집된 스니펫이 0건일 때 store_name 필드에 엉뚱한 값(예:
// 프롬프트에 없던 다른 매장명)을 채워 넣는 사례를 실제 호출로 확인했다 — 이 필드는
// LLM이 "판단"할 대상이 아니라 입력값을 그대로 반환(echo)하기만 하면 되는 필드라,
// LLM 응답의 store_name은 아예 신뢰하지 않고 항상 storeName(호출부가 실제로 요청한
// 상호명)을 그대로 쓴다.
export function parseLlmVerificationResponse(rawText: string, storeName: string): LlmVerificationResult | null {
  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.is_valid_match !== 'boolean') return null;
  if (typeof obj.has_high_chair !== 'boolean') return null;
  if (typeof obj.has_baby_tableware !== 'boolean') return null;
  if (!SPACE_TYPE_VALUES.includes(obj.space_type as SpaceType)) return null;
  if (!CONFIDENCE_VALUES.includes(obj.confidence as Confidence)) return null;

  return {
    store_name: storeName,
    is_valid_match: obj.is_valid_match,
    has_high_chair: obj.has_high_chair,
    has_baby_tableware: obj.has_baby_tableware,
    space_type: obj.space_type as SpaceType,
    confidence: obj.confidence as Confidence,
    evidence_summary: typeof obj.evidence_summary === 'string' ? obj.evidence_summary : '',
  };
}
