import { describe, expect, it } from 'vitest';
import { parsePriceFromText } from './parse-price-from-text';

// [이벤트 큐레이션 — 블로그에서 가격 자동 채우기](2026-09-11 사용자 지시)
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
  });

  it('금액 정보가 전혀 없으면 null을 반환한다(추측으로 값을 만들지 않음)', () => {
    expect(parsePriceFromText('무료 (일부 재료비 별도)')).toBeNull();
  });

  // [실측 버그 수정](2026-09-16 사용자 지적, "2026 국립극장 쏙쏙들이페스티벌"):
  // "숫자 가격이 아니라서.. 가격 없는걸로 한거야? 무료는 숫자가 아니어도 유료/무료
  // 판별이기 때문에.. 데이터 없음이 아니고 무료로 나와야 하는거 아니야?" — 가격
  // 라벨 바로 뒤에 "무료"가 오면(숫자가 없어도) 유효한 가격 정보로 인정한다.
  it('가격 라벨 뒤에 숫자 없이 "무료"만 있어도 유효한 가격으로 인정한다', () => {
    expect(parsePriceFromText('요금: 무료 (현장 선착순 입장권 배부)')).toBe('요금 무료');
    expect(parsePriceFromText('다양한 공연예술 프로그램의 관람료는 전액 무료입니다.')).toBe('관람료 무료');
  });

  it('라벨과 "무료" 사이에 이미 실제 금액이 껴 있으면 그 금액을 우선한다', () => {
    expect(parsePriceFromText('관람료는 성인 10,000원, 미취학 아동은 무료')).toBe('성인 10,000원');
  });

  it('HTML 태그가 섞여 있어도 태그를 제거한 뒤 파싱한다', () => {
    expect(parsePriceFromText('<p>이용료: <b>20,000원</b></p>')).toBe('이용료 20,000원');
  });
});
