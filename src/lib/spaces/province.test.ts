import { describe, expect, it } from 'vitest';
import { getProvinceFromText, getVisibleProvinces, isSpotInProvinces } from './province';

// [스팟픽 지도 — 노출 중분류 선택 시 현재 위치의 도(道) 단위 노출](2026-09-10
// 사용자 지시, project/decision-log.md)
describe('getProvinceFromText', () => {
  it('장/단축형·공백 변형을 모두 정규화한다', () => {
    expect(getProvinceFromText('경기도 성남시 분당구 판교로 68')).toBe('경기');
    expect(getProvinceFromText('경기 가평군 북면')).toBe('경기');
    expect(getProvinceFromText('서울특별시 중구')).toBe('서울');
    expect(getProvinceFromText('강원특별자치도 강릉시')).toBe('강원');
    expect(getProvinceFromText('강원도 원주시')).toBe('강원');
    expect(getProvinceFromText('인천광역시 남동구')).toBe('인천');
    expect(getProvinceFromText('경상남도 창원시')).toBe('경남');
    expect(getProvinceFromText('전북특별자치도 전주시')).toBe('전북');
    expect(getProvinceFromText('제주특별자치도 서귀포시')).toBe('제주');
  });

  it('시군구명(광역 접두어)만 있어도 판별한다', () => {
    expect(getProvinceFromText('성남시 분당구')).toBeNull(); // 광역 표기 없음
    expect(getProvinceFromText('경기도 성남시')).toBe('경기');
  });

  it('실측된 이상 데이터 "전남광주통합특별시"는 광주로 본다', () => {
    expect(getProvinceFromText('전남광주통합특별시 광산구 어딘가')).toBe('광주');
  });

  it('판별 불가면 null', () => {
    expect(getProvinceFromText(null)).toBeNull();
    expect(getProvinceFromText('')).toBeNull();
    expect(getProvinceFromText('알 수 없는 주소')).toBeNull();
  });
});

describe('getVisibleProvinces', () => {
  it('경기 ↔ 서울은 서로 포함한다(판교 사례)', () => {
    expect(getVisibleProvinces('경기')).toEqual(['경기', '서울']);
    expect(getVisibleProvinces('서울')).toEqual(['서울', '경기']);
  });

  it('그 외 도는 자기 자신만', () => {
    expect(getVisibleProvinces('강원')).toEqual(['강원']);
    expect(getVisibleProvinces('부산')).toEqual(['부산']);
    expect(getVisibleProvinces('인천')).toEqual(['인천']);
  });

  it('null이면 필터 없음(null 반환)', () => {
    expect(getVisibleProvinces(null)).toBeNull();
  });
});

describe('isSpotInProvinces', () => {
  it('주소의 광역이 목록에 있으면 true', () => {
    expect(isSpotInProvinces('서울특별시 중구 세종대로', null, ['경기', '서울'])).toBe(true);
    expect(isSpotInProvinces('대구광역시 수성구', null, ['경기', '서울'])).toBe(false);
  });

  it('주소가 없으면 시군구명으로 판정한다', () => {
    expect(isSpotInProvinces(null, '경기도 수원시', ['경기', '서울'])).toBe(true);
  });

  it('주소·시군구명 어디서도 광역을 못 뽑으면 보수적으로 포함한다', () => {
    expect(isSpotInProvinces('상세주소 없음', null, ['강원'])).toBe(true);
  });
});
