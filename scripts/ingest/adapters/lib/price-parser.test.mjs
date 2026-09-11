import { describe, expect, it } from 'vitest';
import { parsePriceFromText } from './price-parser.mjs';

// [가격 정보 파싱 고도화](2026-09-11 사용자 지시, implementation/todo.md 개선사항7-1)
describe('parsePriceFromText', () => {
  it('null/빈 문자열은 null을 반환한다', () => {
    expect(parsePriceFromText(null)).toBeNull();
    expect(parsePriceFromText('')).toBeNull();
  });

  it('명시적 라벨(이용료/요금 등) 근처의 금액을 우선 추출한다', () => {
    expect(parsePriceFromText('이용료: 15,000원 (성인 기준)')).toBe('이용료 15,000원');
    expect(parsePriceFromText('참가비 10000원')).toBe('참가비 10000원');
  });

  it('라벨이 없어도 대상어+금액 조합이 있으면 추출한다(복수 요금 최대 2개)', () => {
    expect(parsePriceFromText('성인 15,000원 어린이 10,000원')).toBe('성인 15,000원 어린이 10,000원');
    expect(parsePriceFromText('전석 10,000원 / 단체10인 이상 할인 20% (전화예매필수)')).toBe('전석 10,000원');
  });

  it('금액 정보가 전혀 없으면 null을 반환한다(추측으로 값을 만들지 않음)', () => {
    expect(parsePriceFromText('무료 (일부 재료비 별도)')).toBeNull();
    expect(parsePriceFromText('사업자등록번호 123-45-67890')).toBeNull();
  });

  it('HTML 태그가 섞여 있어도 태그를 제거한 뒤 파싱한다', () => {
    expect(parsePriceFromText('<p>이용료: <b>20,000원</b></p>')).toBe('이용료 20,000원');
  });
});
