import { describe, expect, it } from 'vitest';
import { getProvinceFromText, isNorthernRegionSpot } from './province-region.mjs';

describe('getProvinceFromText', () => {
  it('공백 없는 전체 표기를 도 단위로 정규화한다', () => {
    expect(getProvinceFromText('서울특별시 강남구')).toBe('서울');
    expect(getProvinceFromText('경기도 군포시')).toBe('경기');
    expect(getProvinceFromText('강원특별자치도 춘천시')).toBe('강원');
    expect(getProvinceFromText('전북특별자치도 전주시 덕진구')).toBe('전북');
  });

  it('null/빈 문자열/판별 불가 텍스트는 null을 반환한다', () => {
    expect(getProvinceFromText(null)).toBeNull();
    expect(getProvinceFromText('')).toBeNull();
    expect(getProvinceFromText('택시')).toBeNull();
    expect(getProvinceFromText('공공주택지구')).toBeNull();
  });

  it('짧은 시/군 단위만 있어도 접두어로 판별 가능하면 매칭한다', () => {
    expect(getProvinceFromText('세종시 나성동')).toBe('세종');
  });
});

describe('isNorthernRegionSpot', () => {
  it('북부 8개 광역(서울/인천/경기/강원/충북/충남/대전/세종)은 포함한다', () => {
    expect(isNorthernRegionSpot('서울시 양천구', null)).toBe(true);
    expect(isNorthernRegionSpot('인천광역시 부평구', null)).toBe(true);
    expect(isNorthernRegionSpot('경기도 수원시', null)).toBe(true);
    expect(isNorthernRegionSpot('강원도 춘천시', null)).toBe(true);
    expect(isNorthernRegionSpot('충청북도 청주시', null)).toBe(true);
    expect(isNorthernRegionSpot('충청남도 천안시', null)).toBe(true);
    expect(isNorthernRegionSpot('대전광역시 유성구', null)).toBe(true);
    expect(isNorthernRegionSpot('세종특별자치시', null)).toBe(true);
  });

  it('남부 지역(전북/전남/광주/경북/경남/대구/부산/울산/제주)은 제외한다', () => {
    expect(isNorthernRegionSpot('전라북도 전주시', null)).toBe(false);
    expect(isNorthernRegionSpot('전라남도 여수시', null)).toBe(false);
    expect(isNorthernRegionSpot('광주광역시 서구', null)).toBe(false);
    expect(isNorthernRegionSpot('경상북도 포항시', null)).toBe(false);
    expect(isNorthernRegionSpot('경상남도 창원시', null)).toBe(false);
    expect(isNorthernRegionSpot('대구광역시 수성구', null)).toBe(false);
    expect(isNorthernRegionSpot('부산광역시 해운대구', null)).toBe(false);
    expect(isNorthernRegionSpot('울산광역시 남구', null)).toBe(false);
    expect(isNorthernRegionSpot('제주특별자치도 제주시', null)).toBe(false);
  });

  it('address가 판별 불가면 sigungu_name으로 폴백한다', () => {
    expect(isNorthernRegionSpot(null, '경기도 군포시')).toBe(true);
    expect(isNorthernRegionSpot('택시', '전남 순천시')).toBe(false);
  });

  it('둘 다 판별 불가하면 안전하게 제외한다(포함이 아니라 제외 — API 호출량 최소화 목적)', () => {
    expect(isNorthernRegionSpot(null, null)).toBe(false);
    expect(isNorthernRegionSpot('택시', '공공주택지구')).toBe(false);
    expect(isNorthernRegionSpot('강서구', '강서구')).toBe(false); // 광역 접두어 없는 구 이름만으로는 판별 불가
  });
});
