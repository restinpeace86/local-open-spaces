import { describe, expect, it } from 'vitest';
import { cleanupMessyText, looksLikeMessyText } from './cleanup-messy-text';

// [원문 JSON 필드 정돈해서 보기](2026-09-12 사용자 지시)
describe('looksLikeMessyText', () => {
  it('실제 개행(\\r\\n)이 있으면 messy로 판단한다', () => {
    expect(looksLikeMessyText('첫줄\r\n둘째줄')).toBe(true);
  });

  it('HTML 엔티티가 있으면 messy로 판단한다', () => {
    expect(looksLikeMessyText('4회차&nbsp;(60명)')).toBe(true);
  });

  it('개행/엔티티가 전혀 없는 평범한 한 줄 문자열은 messy가 아니다', () => {
    expect(looksLikeMessyText('평범한 설명 텍스트입니다')).toBe(false);
  });

  it('문자열이 아니면 false를 반환한다', () => {
    expect(looksLikeMessyText(123)).toBe(false);
    expect(looksLikeMessyText(null)).toBe(false);
  });
});

describe('cleanupMessyText', () => {
  it('\\r\\n을 실제 줄바꿈으로 바꾼다', () => {
    expect(cleanupMessyText('첫줄\r\n둘째줄')).toBe('첫줄\n둘째줄');
  });

  it('&nbsp; 등 HTML 엔티티를 디코딩한다', () => {
    expect(cleanupMessyText('4회차&nbsp;&nbsp;(60명)')).toBe('4회차 (60명)');
  });

  it('사용자 제시 예시(회차 안내문)를 줄바꿈이 살아 있는 정돈된 텍스트로 바꾼다', () => {
    const input =
      '\r\n&nbsp;&nbsp; - 4회차 - 14:30~15:50    &nbsp;(60명)     \r\n&nbsp;&nbsp; - 5회차 - 16:00~17:40    &nbsp;(60명)     \r\n&nbsp; \r\n&nbsp;* 사전예약 : 개인 및 단체 예약 가능(보호자 동반 필수)';
    const result = cleanupMessyText(input);

    expect(result).toContain('- 4회차 - 14:30~15:50 (60명)');
    expect(result).toContain('- 5회차 - 16:00~17:40 (60명)');
    expect(result).toContain('* 사전예약 : 개인 및 단체 예약 가능(보호자 동반 필수)');
    // 원문에 남아있던 backslash 문자 그대로가 아니라 실제 개행으로 분리돼야 한다.
    expect(result.split('\n').length).toBeGreaterThan(1);
    expect(result).not.toContain('&nbsp;');
    expect(result).not.toContain('\r');
  });

  it('3개 이상 연속 개행은 빈 줄 하나로 줄인다', () => {
    expect(cleanupMessyText('가\n\n\n\n나')).toBe('가\n\n나');
  });

  it('앞뒤 공백/개행은 제거한다', () => {
    expect(cleanupMessyText('  \r\n  본문  \r\n  ')).toBe('본문');
  });
});
