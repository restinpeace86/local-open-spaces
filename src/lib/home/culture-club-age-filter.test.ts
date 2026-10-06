import { describe, expect, it } from 'vitest';
import { buildAgeOverlapFilter } from './culture-club-age-filter';

describe('buildAgeOverlapFilter', () => {
  it('양끝이 모두 있는 경우와 열린 범위(이상/이하) 세 가지를 OR로 묶은 PostgREST 필터 문자열을 만든다', () => {
    expect(buildAgeOverlapFilter(24)).toBe(
      'and(min_age_months.lte.24,max_age_months.gte.24),and(min_age_months.lte.24,max_age_months.is.null),and(min_age_months.is.null,max_age_months.gte.24)'
    );
  });

  it('양끝이 모두 null인 행(연령 정보 없음)은 세 조건 중 어디에도 해당하지 않는다(문자열 구조 자체로 보장)', () => {
    const filter = buildAgeOverlapFilter(24);
    expect(filter).not.toContain('and(min_age_months.is.null,max_age_months.is.null)');
  });
});
