import { describe, expect, it } from 'vitest';
import {
  hasProvincePrefix,
  normalizeSigunguProvince,
  SIGUN_TO_PROVINCE,
  ORPHANED_SUBDISTRICT_FULL_PATH,
} from './korea-region-lookup';

// Task 9-6-8(2026-08-23): scripts/ingest/adapters/lib/korea-region-lookup.mjs와 동일한 표를
// 쓰는 TS 미러 — 핵심 동작만 대표로 검증한다(전체 케이스는 .mjs 쪽 테스트가 이미 커버).
describe('normalizeSigunguProvince', () => {
  it('지시서 예시 그대로 변환한다', () => {
    expect(normalizeSigunguProvince('과천시')).toBe('경기도 과천시');
    expect(normalizeSigunguProvince('성남시 분당구')).toBe('경기도 성남시 분당구');
  });

  it('상위 "시" 토큰 없이 하위 구만 단독 저장된 경우 시/도를 모두 복원한다', () => {
    expect(normalizeSigunguProvince('영통구')).toBe('경기도 수원시 영통구');
  });

  it('이미 광역 지자체 접두가 있으면 그대로 둔다', () => {
    expect(normalizeSigunguProvince('서울시 강남구')).toBe('서울시 강남구');
  });

  it('판별 불가능한 값은 원본을 그대로 반환한다', () => {
    expect(normalizeSigunguProvince('강서구')).toBe('강서구');
    expect(normalizeSigunguProvince('고성군')).toBe('고성군');
  });

  it('null/undefined는 그대로 반환한다', () => {
    expect(normalizeSigunguProvince(null)).toBeNull();
    expect(normalizeSigunguProvince(undefined)).toBeUndefined();
  });
});

describe('hasProvincePrefix', () => {
  it('전체 명칭과 기존 축약형 모두 접두로 인식한다', () => {
    expect(hasProvincePrefix('경기도 성남시')).toBe(true);
    expect(hasProvincePrefix('서울시 강남구')).toBe(true);
    expect(hasProvincePrefix('강남구')).toBe(false);
  });
});

describe('데이터 무결성', () => {
  it('두 표에 중복 키가 없다', () => {
    const overlap = Object.keys(SIGUN_TO_PROVINCE).filter((k) => k in ORPHANED_SUBDISTRICT_FULL_PATH);
    expect(overlap).toEqual([]);
  });
});
