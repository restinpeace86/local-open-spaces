// [지오코딩 안전장치 — 서킷 브레이커](2026-09-05 사용자 지시) 단위 테스트 — 모듈 상태
// 자체(연속 실패 카운트/열림·닫힘 전환)만 순수하게 검증한다(실제 fetch 연동 시나리오는
// vworld-geocoder.test.mjs 참고).
import { beforeEach, describe, expect, it } from 'vitest';
import {
  isVworldCircuitOpen,
  recordVworldFailure,
  recordVworldSuccess,
  resetVworldCircuitBreakerForTest,
} from './vworld-circuit-breaker.mjs';

describe('vworld-circuit-breaker', () => {
  beforeEach(() => {
    resetVworldCircuitBreakerForTest();
  });

  it('초기 상태는 닫혀 있다', () => {
    expect(isVworldCircuitOpen()).toBe(false);
  });

  it('연속 2회 실패까지는 열리지 않는다', () => {
    recordVworldFailure();
    recordVworldFailure();
    expect(isVworldCircuitOpen()).toBe(false);
  });

  it('연속 3회 실패하면 열린다', () => {
    recordVworldFailure();
    recordVworldFailure();
    recordVworldFailure();
    expect(isVworldCircuitOpen()).toBe(true);
  });

  it('중간에 성공하면 연속 실패 카운트가 리셋된다', () => {
    recordVworldFailure();
    recordVworldFailure();
    recordVworldSuccess();
    recordVworldFailure();
    recordVworldFailure();
    expect(isVworldCircuitOpen()).toBe(false); // 성공 이후 다시 2회뿐 — 아직 안 열림
  });

  it('열린 뒤에도 성공하면 다시 닫힌다(복구 반영)', () => {
    recordVworldFailure();
    recordVworldFailure();
    recordVworldFailure();
    expect(isVworldCircuitOpen()).toBe(true);

    recordVworldSuccess();
    expect(isVworldCircuitOpen()).toBe(false);
  });
});
