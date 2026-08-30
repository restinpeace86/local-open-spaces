// [핵심 events 수집 파이프라인 장애 점검](2026-08-30 사용자 지시) 단위 테스트
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatMissingEnvVarsMessage, getMissingEnvVars } from './env-precheck.mjs';

describe('getMissingEnvVars', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.__TEST_KEY_A__;
    delete process.env.__TEST_KEY_B__;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('설정되지 않은 키만 골라 반환한다', () => {
    process.env.__TEST_KEY_A__ = 'value';

    const missing = getMissingEnvVars(['__TEST_KEY_A__', '__TEST_KEY_B__']);

    expect(missing).toEqual(['__TEST_KEY_B__']);
  });

  it('모두 설정돼 있으면 빈 배열을 반환한다', () => {
    process.env.__TEST_KEY_A__ = 'value-a';
    process.env.__TEST_KEY_B__ = 'value-b';

    expect(getMissingEnvVars(['__TEST_KEY_A__', '__TEST_KEY_B__'])).toEqual([]);
  });

  it('빈 문자열도 누락으로 취급한다(설정됐지만 값이 없는 경우 방어)', () => {
    process.env.__TEST_KEY_A__ = '';

    expect(getMissingEnvVars(['__TEST_KEY_A__'])).toEqual(['__TEST_KEY_A__']);
  });
});

describe('formatMissingEnvVarsMessage', () => {
  it('누락된 키 목록과 확인 안내를 포함한 메시지를 만든다', () => {
    const message = formatMissingEnvVarsMessage(['FOO', 'BAR']);

    expect(message).toContain('FOO, BAR');
    expect(message).toContain('GitHub Actions Secrets');
    expect(message).toContain('.env.local');
  });
});
