// [연령 표기 → 개월 수 정규화] todo.md 개선사항 2의 예시 + 실제 수집된
// 이마트/롯데마트 강좌 제목(2026-10-06 실측)을 그대로 테스트 케이스로 쓴다.
import { describe, expect, it } from 'vitest';
import { parseAgeRangeToMonths } from './age-range-parser.mjs';

const REF_YEAR = 2026;

describe('parseAgeRangeToMonths', () => {
  it('"세" 범위를 개월 수로 환산한다(스펙 예시: 6~7세 → 72~84개월)', () => {
    expect(parseAgeRangeToMonths('6~7세', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 72,
      maxAgeMonths: 84,
    });
  });

  it('"세" 단일값을 개월 수로 환산한다(스펙 예시: 6세 → 72개월)', () => {
    expect(parseAgeRangeToMonths('6세', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 72,
      maxAgeMonths: 72,
    });
  });

  it('"년생" 4자리 범위를 개월 수로 환산한다(스펙 예시: 2020~23년생)', () => {
    expect(parseAgeRangeToMonths('2020~23년생', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 36,
      maxAgeMonths: 72,
    });
  });

  it('"년생" 2자리 범위를 개월 수로 환산한다(실측: (21~22년생))', () => {
    expect(parseAgeRangeToMonths('(21~22년생)', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 48,
      maxAgeMonths: 60,
    });
  });

  it('"개월" 범위는 그대로 min/max로 쓴다(스펙 예시: 13~26개월)', () => {
    expect(parseAgeRangeToMonths('13~26개월', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 13,
      maxAgeMonths: 26,
    });
  });

  it('부가 텍스트가 섞여도 개월 범위를 추출한다(실측: (37~55개월/c))', () => {
    expect(parseAgeRangeToMonths('(37~55개월/c)', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 37,
      maxAgeMonths: 55,
    });
  });

  it('혼합 단위(개월~년생)도 각 변을 독립 환산해 처리한다(실측: (40개월~21년생))', () => {
    expect(parseAgeRangeToMonths('(40개월~21년생)', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 40,
      maxAgeMonths: 60,
    });
  });

  it('이마트 실제 제목 전체 문자열에서도 정확히 추출한다', () => {
    const title = '[8주] [일정변경] [특별가] (화) 13:00 대교 트니트니 오감올리 오감놀이 (8~15개월) *10/6개강-11/24종강*';
    expect(parseAgeRangeToMonths(title, { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 8,
      maxAgeMonths: 15,
    });
  });

  it('쉼표/슬래시가 붙은 괄호 안에서도 추출한다(실측: [6~12개월,보호자1인/10:30])', () => {
    const title = '10/7(수) 오감반짝 애기별 -향기가득 바리스타 [6~12개월,보호자1인/10:30]';
    expect(parseAgeRangeToMonths(title, { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 6,
      maxAgeMonths: 12,
    });
  });

  it('"이상"은 하한만 있고 상한은 무제한이다(실측: (36개월 이상))', () => {
    expect(parseAgeRangeToMonths('(36개월 이상)', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: 36,
      maxAgeMonths: null,
    });
  });

  it('"이하"는 상한만 있고 하한은 무제한이다', () => {
    expect(parseAgeRangeToMonths('(48개월 이하)', { referenceYear: REF_YEAR })).toEqual({
      minAgeMonths: null,
      maxAgeMonths: 48,
    });
  });

  it('비어있거나 null이면 둘 다 null을 반환한다', () => {
    expect(parseAgeRangeToMonths('')).toEqual({ minAgeMonths: null, maxAgeMonths: null });
    expect(parseAgeRangeToMonths(null)).toEqual({ minAgeMonths: null, maxAgeMonths: null });
    expect(parseAgeRangeToMonths(undefined)).toEqual({ minAgeMonths: null, maxAgeMonths: null });
  });

  it('연령 표기가 전혀 없으면 둘 다 null을 반환한다', () => {
    expect(parseAgeRangeToMonths('10/3(토)11:50 에너지 팡팡! 키즈 플레이 그라운드')).toEqual({
      minAgeMonths: null,
      maxAgeMonths: null,
    });
  });
});
