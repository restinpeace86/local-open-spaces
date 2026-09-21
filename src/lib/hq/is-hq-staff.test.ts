import { afterEach, describe, expect, it } from 'vitest';
import { isHqStaffEmail } from './is-hq-staff';

const ORIGINAL_ENV = process.env.HQ_STAFF_EMAILS;

describe('isHqStaffEmail', () => {
  afterEach(() => {
    process.env.HQ_STAFF_EMAILS = ORIGINAL_ENV;
  });

  it('화이트리스트에 있는 이메일(대소문자 무관)은 true를 반환한다', () => {
    process.env.HQ_STAFF_EMAILS = 'staff@example.com, other@example.com';
    expect(isHqStaffEmail('STAFF@example.com')).toBe(true);
    expect(isHqStaffEmail('other@example.com')).toBe(true);
  });

  it('화이트리스트에 없는 이메일은 false를 반환한다', () => {
    process.env.HQ_STAFF_EMAILS = 'staff@example.com';
    expect(isHqStaffEmail('random@example.com')).toBe(false);
  });

  it('email이 null/undefined/빈 문자열이면 false를 반환한다(판별 불가 시 차단)', () => {
    process.env.HQ_STAFF_EMAILS = 'staff@example.com';
    expect(isHqStaffEmail(null)).toBe(false);
    expect(isHqStaffEmail(undefined)).toBe(false);
    expect(isHqStaffEmail('')).toBe(false);
  });

  it('env var가 비어있으면 어떤 이메일도 통과하지 못한다', () => {
    process.env.HQ_STAFF_EMAILS = '';
    expect(isHqStaffEmail('anyone@example.com')).toBe(false);
  });
});
