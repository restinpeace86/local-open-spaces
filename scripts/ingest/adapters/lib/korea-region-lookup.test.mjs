// Task 9-6-8(2026-08-23): korea-region-lookup.mjs 단위 테스트.
import { describe, expect, it } from 'vitest';
import {
  hasProvincePrefix,
  normalizeSigunguProvince,
  SIGUN_TO_PROVINCE,
  ORPHANED_SUBDISTRICT_FULL_PATH,
} from './korea-region-lookup.mjs';

describe('normalizeSigunguProvince', () => {
  it('지시서 예시 그대로 변환한다', () => {
    expect(normalizeSigunguProvince('과천시')).toBe('경기도 과천시');
    expect(normalizeSigunguProvince('성남시 분당구')).toBe('경기도 성남시 분당구');
  });

  it('도 산하 시/군 단독 표기에 광역명을 붙인다', () => {
    expect(normalizeSigunguProvince('수원시')).toBe('경기도 수원시');
    expect(normalizeSigunguProvince('청주시')).toBe('충청북도 청주시');
    expect(normalizeSigunguProvince('전주시 덕진구')).toBe('전북특별자치도 전주시 덕진구');
  });

  it('광역시 산하 고유 자치구/군은 중간 "시" 없이 광역시명만 붙인다', () => {
    expect(normalizeSigunguProvince('해운대구')).toBe('부산광역시 해운대구');
    expect(normalizeSigunguProvince('기장군')).toBe('부산광역시 기장군');
    expect(normalizeSigunguProvince('울주군')).toBe('울산광역시 울주군');
  });

  it('2023/2026년 최신 행정구역 개편을 반영한다(군위군→대구, 화성시 4구 신설, 인천 신설구)', () => {
    expect(normalizeSigunguProvince('군위군')).toBe('대구광역시 군위군');
    expect(normalizeSigunguProvince('동탄구')).toBe('경기도 화성시 동탄구');
    expect(normalizeSigunguProvince('검단구')).toBe('인천광역시 검단구');
    expect(normalizeSigunguProvince('제물포구')).toBe('인천광역시 제물포구');
  });

  it('상위 "시" 토큰 없이 하위 구만 단독 저장된 경우 시/도를 모두 복원한다', () => {
    expect(normalizeSigunguProvince('영통구')).toBe('경기도 수원시 영통구');
    expect(normalizeSigunguProvince('일산동구')).toBe('경기도 고양시 일산동구');
    expect(normalizeSigunguProvince('동안구')).toBe('경기도 안양시 동안구');
  });

  it('이미 광역 지자체 접두(전체 명칭 또는 기존 축약형)가 있으면 그대로 둔다(이중 접두 방지)', () => {
    expect(normalizeSigunguProvince('서울시 강남구')).toBe('서울시 강남구');
    expect(normalizeSigunguProvince('인천광역시 동구')).toBe('인천광역시 동구');
    expect(normalizeSigunguProvince('경기도 성남시 분당구')).toBe('경기도 성남시 분당구');
  });

  it('여러 광역 지자체에 동일 이름이 존재해 판별 불가능하면 원본을 그대로 반환한다(추측하지 않음)', () => {
    expect(normalizeSigunguProvince('강서구')).toBe('강서구'); // 서울 vs 부산
    expect(normalizeSigunguProvince('고성군')).toBe('고성군'); // 강원 vs 경남
    expect(normalizeSigunguProvince('중구')).toBe('중구'); // 여러 광역시 공통
    expect(normalizeSigunguProvince('광주시')).toBe('광주시'); // 경기도 광주시 vs 광주광역시 축약형
  });

  it('실제 원인 불명의 오염/파싱 오류 값도 추측해서 고치지 않고 원본을 그대로 반환한다', () => {
    expect(normalizeSigunguProvince('공공주택지구')).toBe('공공주택지구');
    expect(normalizeSigunguProvince('택시')).toBe('택시');
    expect(normalizeSigunguProvince('해운대구광역시')).toBe('해운대구광역시');
  });

  it('null/빈 문자열은 그대로 반환한다', () => {
    expect(normalizeSigunguProvince(null)).toBeNull();
    expect(normalizeSigunguProvince('')).toBe('');
  });
});

describe('hasProvincePrefix', () => {
  it('전체 명칭과 기존 축약형(서울시/부산시 등) 모두 접두로 인식한다', () => {
    expect(hasProvincePrefix('경기도 성남시')).toBe(true);
    expect(hasProvincePrefix('서울특별시 강남구')).toBe(true);
    expect(hasProvincePrefix('서울시 강남구')).toBe(true);
    expect(hasProvincePrefix('강남구')).toBe(false);
  });
});

describe('데이터 무결성', () => {
  it('SIGUN_TO_PROVINCE와 ORPHANED_SUBDISTRICT_FULL_PATH에 중복 키가 없다', () => {
    const overlap = Object.keys(SIGUN_TO_PROVINCE).filter((k) => k in ORPHANED_SUBDISTRICT_FULL_PATH);
    expect(overlap).toEqual([]);
  });

  it('SIGUN_TO_PROVINCE의 모든 값은 null이거나 실제 17개 광역 지자체 중 하나다', () => {
    const VALID_PROVINCES = new Set([
      '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
      '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도',
      '경상북도', '경상남도', '제주특별자치도',
    ]);
    for (const value of Object.values(SIGUN_TO_PROVINCE)) {
      if (value !== null) expect(VALID_PROVINCES.has(value)).toBe(true);
    }
  });
});
