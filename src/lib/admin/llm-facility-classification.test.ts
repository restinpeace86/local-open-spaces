import { describe, expect, it } from 'vitest';
import { buildFacilityClassificationPrompt, parseFacilityClassificationResponse } from './llm-facility-classification';

describe('buildFacilityClassificationPrompt', () => {
  it('제목/설명과 4가지 분류 정의, JSON 출력 강제 문구를 포함한다', () => {
    const prompt = buildFacilityClassificationPrompt('숲속 키즈카페', '아이들이 뛰어놀 수 있는 실내 놀이 공간');
    expect(prompt).toContain('숲속 키즈카페');
    expect(prompt).toContain('아이들이 뛰어놀 수 있는 실내 놀이 공간');
    expect(prompt).toContain('INDOOR');
    expect(prompt).toContain('OUTDOOR');
    expect(prompt).toContain('BOTH');
    expect(prompt).toContain('UNKNOWN');
    expect(prompt).toContain('순수 JSON만 반환');
  });

  it('설명이 없으면 "상세 설명 없음"으로 표시한다', () => {
    const prompt = buildFacilityClassificationPrompt('숲속 키즈카페', null);
    expect(prompt).toContain('(상세 설명 없음)');
  });

  it('설명이 빈 문자열/공백만이어도 "상세 설명 없음"으로 표시한다', () => {
    const prompt = buildFacilityClassificationPrompt('숲속 키즈카페', '   ');
    expect(prompt).toContain('(상세 설명 없음)');
  });
});

describe('parseFacilityClassificationResponse', () => {
  const validJson = JSON.stringify({
    classification: 'INDOOR',
    confidence: 'high',
    reason: '실내 놀이시설로 명시됨',
  });

  it('유효한 JSON을 그대로 파싱한다', () => {
    expect(parseFacilityClassificationResponse(validJson)).toEqual({
      classification: 'INDOOR',
      confidence: 'high',
      reason: '실내 놀이시설로 명시됨',
    });
  });

  it('마크다운 코드 블록으로 감싸져 와도 벗겨내고 파싱한다', () => {
    const wrapped = `\`\`\`json\n${validJson}\n\`\`\``;
    expect(parseFacilityClassificationResponse(wrapped)).not.toBeNull();
  });

  it('JSON 파싱 자체가 실패하면 null이다', () => {
    expect(parseFacilityClassificationResponse('이건 JSON이 아닙니다')).toBeNull();
  });

  it('classification이 4가지 허용값 중 하나가 아니면 null이다(추측으로 기본값을 채우지 않음)', () => {
    const invalid = JSON.stringify({ classification: 'ROOFTOP', confidence: 'low', reason: '' });
    expect(parseFacilityClassificationResponse(invalid)).toBeNull();
  });

  it('confidence가 허용되지 않는 값이면 null이다', () => {
    const invalid = JSON.stringify({ classification: 'INDOOR', confidence: 'very-high', reason: '' });
    expect(parseFacilityClassificationResponse(invalid)).toBeNull();
  });

  it('classification 필드 자체가 없으면 null이다', () => {
    const invalid = JSON.stringify({ confidence: 'low', reason: '' });
    expect(parseFacilityClassificationResponse(invalid)).toBeNull();
  });

  it('reason이 없으면 빈 문자열로 채운다', () => {
    const noReason = JSON.stringify({ classification: 'OUTDOOR', confidence: 'medium' });
    expect(parseFacilityClassificationResponse(noReason)).toEqual({
      classification: 'OUTDOOR',
      confidence: 'medium',
      reason: '',
    });
  });

  it('BOTH/UNKNOWN도 정상적으로 파싱한다', () => {
    expect(parseFacilityClassificationResponse(JSON.stringify({ classification: 'BOTH', confidence: 'medium', reason: '복합 시설' }))?.classification).toBe(
      'BOTH'
    );
    expect(
      parseFacilityClassificationResponse(JSON.stringify({ classification: 'UNKNOWN', confidence: 'low', reason: '판단 근거 부족' }))?.classification
    ).toBe('UNKNOWN');
  });
});
