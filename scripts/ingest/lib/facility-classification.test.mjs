import { describe, expect, it } from 'vitest';
import { buildFacilityClassificationPrompt, parseFacilityClassificationResponse } from './facility-classification.mjs';

// [실내/야외 분류 LLM 파이프라인 공용 로직](2026-09-17): src/lib/admin/
// llm-facility-classification.test.ts와 동일한 케이스를 이 .mjs 공용 버전에도
// 그대로 검증한다(historical/daily 두 스크립트가 이 모듈을 함께 쓴다).
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

  it('category_min/venue_name이 있으면 추가 컨텍스트로 함께 포함한다', () => {
    const prompt = buildFacilityClassificationPrompt('서울숲 방문 프로그램', null, {
      categoryMin: '공원탐방',
      venueName: '서울숲 방문자센터',
    });
    expect(prompt).toContain('표준 분류(중분류): 공원탐방');
    expect(prompt).toContain('장소명: 서울숲 방문자센터');
  });
});

describe('parseFacilityClassificationResponse', () => {
  it('유효한 JSON을 그대로 파싱한다', () => {
    const json = JSON.stringify({ classification: 'INDOOR', confidence: 'high', reason: '실내 놀이시설로 명시됨' });
    expect(parseFacilityClassificationResponse(json)).toEqual({
      classification: 'INDOOR',
      confidence: 'high',
      reason: '실내 놀이시설로 명시됨',
    });
  });

  it('마크다운 코드 블록으로 감싸져 와도 벗겨내고 파싱한다', () => {
    const json = JSON.stringify({ classification: 'OUTDOOR', confidence: 'medium', reason: '' });
    expect(parseFacilityClassificationResponse(`\`\`\`json\n${json}\n\`\`\``)).not.toBeNull();
  });

  it('JSON 파싱 자체가 실패하면 null이다', () => {
    expect(parseFacilityClassificationResponse('이건 JSON이 아닙니다')).toBeNull();
  });

  it('classification이 4가지 허용값 중 하나가 아니면 null이다', () => {
    const json = JSON.stringify({ classification: 'ROOFTOP', confidence: 'low', reason: '' });
    expect(parseFacilityClassificationResponse(json)).toBeNull();
  });
});
