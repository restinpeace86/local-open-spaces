import { describe, expect, it } from 'vitest';
import { buildNoSnippetsResult, buildQueryVariants, buildVerificationPrompt, parseLlmVerificationResponse } from './llm-blog-verification';

describe('buildQueryVariants', () => {
  it('요청 원문의 3개 조합(아기의자/아기식기/테라스 마당)을 그대로 생성한다', () => {
    expect(buildQueryVariants('맘스터치 정자점')).toEqual([
      '맘스터치 정자점 아기의자',
      '맘스터치 정자점 아기식기',
      '맘스터치 정자점 테라스 마당',
    ]);
  });
});

describe('buildVerificationPrompt', () => {
  it('매장명/주소/수집된 스니펫을 프롬프트에 포함한다', () => {
    const prompt = buildVerificationPrompt('행복식당', '경기도 성남시 분당구 정자동', [
      { title: '행복식당 다녀왔어요', description: '아기의자가 있어서 편했어요', bloggername: '맘블로거', postdate: '20260101' },
    ]);
    expect(prompt).toContain('행복식당');
    expect(prompt).toContain('경기도 성남시 분당구 정자동');
    expect(prompt).toContain('아기의자가 있어서 편했어요');
    expect(prompt).toContain('순수 JSON만 반환');
  });

  it('수집된 스니펫이 없으면 그 사실을 명시한다', () => {
    const prompt = buildVerificationPrompt('행복식당', null, []);
    expect(prompt).toContain('수집된 블로그 스니펫 없음');
    expect(prompt).toContain('주소 정보 없음');
  });
});

// [수집 0건 시 LLM 호출 생략](2026-09-16 사용자 지시: "0건이면 LLM 으로 안던지고
// 그냥 0건이다라고 나와야하는거 아니야?"): 분석할 데이터가 없으면 결정적으로
// "불일치"가 되므로 LLM 호출 없이 즉시 이 결과를 반환해야 한다.
describe('buildNoSnippetsResult', () => {
  it('LLM을 거치지 않고 결정적인 불일치/데이터 없음 결과를 만든다', () => {
    expect(buildNoSnippetsResult('행복식당')).toEqual({
      store_name: '행복식당',
      is_valid_match: false,
      has_high_chair: false,
      has_baby_tableware: false,
      space_type: 'indoor',
      confidence: 'low',
      evidence_summary: '수집된 블로그 스니펫이 없어(0건) 분석하지 않았습니다.',
    });
  });
});

describe('parseLlmVerificationResponse', () => {
  const validJson = JSON.stringify({
    store_name: '행복식당',
    is_valid_match: true,
    has_high_chair: true,
    has_baby_tableware: false,
    space_type: 'mixed',
    confidence: 'high',
    evidence_summary: '아기의자 언급 다수 확인',
  });

  it('유효한 JSON을 그대로 파싱한다', () => {
    const result = parseLlmVerificationResponse(validJson, '행복식당');
    expect(result).toEqual({
      store_name: '행복식당',
      is_valid_match: true,
      has_high_chair: true,
      has_baby_tableware: false,
      space_type: 'mixed',
      confidence: 'high',
      evidence_summary: '아기의자 언급 다수 확인',
    });
  });

  it('마크다운 코드 블록으로 감싸져 와도 벗겨내고 파싱한다', () => {
    const wrapped = `\`\`\`json\n${validJson}\n\`\`\``;
    expect(parseLlmVerificationResponse(wrapped, '행복식당')).not.toBeNull();
  });

  it('JSON 파싱 자체가 실패하면 null이다', () => {
    expect(parseLlmVerificationResponse('이건 JSON이 아닙니다', '행복식당')).toBeNull();
  });

  it('필수 boolean 필드가 없으면 null이다(추측으로 기본값을 채우지 않음)', () => {
    const invalid = JSON.stringify({ is_valid_match: true, space_type: 'indoor', confidence: 'low' });
    expect(parseLlmVerificationResponse(invalid, '행복식당')).toBeNull();
  });

  it('space_type이 허용되지 않는 값이면 null이다', () => {
    const invalid = JSON.stringify({
      is_valid_match: true,
      has_high_chair: false,
      has_baby_tableware: false,
      space_type: 'rooftop',
      confidence: 'low',
    });
    expect(parseLlmVerificationResponse(invalid, '행복식당')).toBeNull();
  });

  it('store_name이 응답에 없으면 호출부가 넘긴 상호명을 쓴다', () => {
    const noName = JSON.stringify({
      is_valid_match: true,
      has_high_chair: false,
      has_baby_tableware: false,
      space_type: 'indoor',
      confidence: 'low',
      evidence_summary: '',
    });
    expect(parseLlmVerificationResponse(noName, '행복식당')?.store_name).toBe('행복식당');
  });

  // [실측 버그 재현] 수집된 스니펫이 0건일 때 LLM이 store_name에 프롬프트에 없던
  // 엉뚱한 매장명을 채워 넣는 사례를 실제 호출로 확인했다 — store_name 필드는
  // 항상 호출부가 요청한 값으로 강제해야 한다(LLM 응답을 신뢰하지 않음).
  it('LLM이 store_name에 엉뚱한 값을 반환해도 항상 호출부가 넘긴 상호명으로 강제한다', () => {
    const wrongName = JSON.stringify({
      store_name: '전혀 다른 매장',
      is_valid_match: false,
      has_high_chair: false,
      has_baby_tableware: false,
      space_type: 'indoor',
      confidence: 'low',
      evidence_summary: '수집된 스니펫 없음',
    });
    expect(parseLlmVerificationResponse(wrongName, '행복식당')?.store_name).toBe('행복식당');
  });
});
