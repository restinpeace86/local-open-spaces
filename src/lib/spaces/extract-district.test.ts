import { describe, expect, it } from 'vitest';
import { extractSigunguName } from './extract-district';

// Task 9-1-12(2026-08-22): "동구"/"북구"/"중구" 등은 서울·부산·대구·인천·광주·대전·울산에
// 전부 존재해 단독 표기만으로는 어느 도시인지 알 수 없다(사용자 지적, 실측 확인) — 특별시/
// 광역시는 항상 축약 시 이름을 앞에 붙여야 한다.
describe('extractSigunguName (Task 9-1-12: 행정구역 풀네임)', () => {
  it('광역시 소속 구는 "OO시 구" 형태로 축약 시 이름을 붙인다', () => {
    expect(extractSigunguName('울산광역시 동구 동해안로 46')).toBe('울산시 동구');
    expect(extractSigunguName('광주광역시 북구 양산제로 95')).toBe('광주시 북구');
    expect(extractSigunguName('부산광역시 중구 광복로 55')).toBe('부산시 중구');
  });

  it('서울특별시도 동일하게 "서울시 구" 형태로 축약한다', () => {
    expect(extractSigunguName('서울특별시 강남구 테헤란로 1')).toBe('서울시 강남구');
    expect(extractSigunguName('서울특별시 중구 세종대로 110')).toBe('서울시 중구');
  });

  it('경기도처럼 시 아래 구가 또 있는 2단 구조는 기존과 동일하게 두 토큰을 합친다', () => {
    expect(extractSigunguName('경기도 성남시 분당구 중앙공원로 35')).toBe('성남시 분당구');
    expect(extractSigunguName('경기도 고양시 일산서구 대화동')).toBe('고양시 일산서구');
  });

  it('구 단위가 없는 시/군은 그대로 하나만 반환한다', () => {
    expect(extractSigunguName('경기도 이천시 호법면 중부대로798번길 125')).toBe('이천시');
    expect(extractSigunguName('강원특별자치도 춘천시 남면 충효로 1503')).toBe('춘천시');
  });

  it('"장소명 (주소)" 형태에서는 괄호 안 주소를 우선 파싱한다', () => {
    expect(extractSigunguName('우리집 (울산광역시 동구 방어동)')).toBe('울산시 동구');
  });

  it('판별 불가하면 임의로 만들어내지 않고 null을 반환한다', () => {
    expect(extractSigunguName(null)).toBeNull();
    expect(extractSigunguName('')).toBeNull();
  });
});
