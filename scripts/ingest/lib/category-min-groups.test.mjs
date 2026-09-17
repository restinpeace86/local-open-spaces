import { describe, expect, it } from 'vitest';
import { EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS } from './category-min-groups.mjs';

// [실내/야외 LLM 분류 배치 제외 대상](2026-09-18): src/lib/admin/category-min-groups.test.ts와
// 동일한 케이스를 이 .mjs 공용 버전에도 그대로 검증한다.
describe('EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS', () => {
  it('체육시설/배움·교육/공공청사·행정 3개 대분류의 중분류를 포함한다', () => {
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).toContain('테니스장');
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).toContain('골프장');
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).toContain('교양/어학');
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).toContain('녹화장소');
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).toContain('회의실');
  });

  it('사용자가 지정하지 않은 대분류(문화/축제·자연/체험·키즈/육아·기타)의 중분류는 포함하지 않는다', () => {
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).not.toContain('캠핑장');
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).not.toContain('공공키즈카페');
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).not.toContain('지역축제/페스티벌');
    expect(EVENTS_EXCLUDED_FACILITY_CLASSIFICATION_MINS).not.toContain('기타');
  });
});
