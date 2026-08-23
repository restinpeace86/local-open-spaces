import { describe, expect, it } from 'vitest';
import { formatDistance, formatVenueLine } from './format';

describe('formatDistance', () => {
  it('1000m 미만이면 반올림한 m 단위로 표시한다', () => {
    expect(formatDistance(850)).toBe('850m');
  });

  it('1000m 이상이면 소수점 1자리 km 단위로 표시한다', () => {
    expect(formatDistance(3200)).toBe('3.2km');
  });
});

// Task 9-1-3: "[장소명] · [시/군/구]" 형태 통일 표기 검증(거리 계산 제거)
// Task 9-6-8(2026-08-23): sigunguName은 이제 normalizeSigunguProvince를 거쳐 광역 지자체
// 접두가 보완된 채로 표시된다 — 아래 테스트는 이미 인제스트/DB 마이그레이션 단계에서 광역
// 접두가 붙은 정상 값("경기도 성남시 분당구")을 입력으로 쓴다(실제 라이브 데이터 형태와 일치).
describe('formatVenueLine', () => {
  it('장소명과 시/군/구가 모두 있으면 "장소명 · 시/군/구" 형태로 합친다', () => {
    expect(formatVenueLine('율동공원 야외무대', '경기도 성남시 분당구')).toBe(
      '율동공원 야외무대 · 경기도 성남시 분당구'
    );
  });

  it('시/군/구 정보가 없으면 장소명만 표시한다', () => {
    expect(formatVenueLine('율동공원 야외무대', null)).toBe('율동공원 야외무대');
  });

  it('장소명이 없으면 시/군/구만 표시한다', () => {
    expect(formatVenueLine(null, '경기도 성남시 분당구')).toBe('경기도 성남시 분당구');
  });

  it('둘 다 없으면 빈 문자열을 반환한다(플레이스홀더 문구 없음)', () => {
    expect(formatVenueLine(null, null)).toBe('');
  });

  it('시/군/구가 없고 거리(distanceMeters)가 주어지면 거리로 대체한다(지역 도감 페이지 호환)', () => {
    expect(formatVenueLine('율동공원 야외무대', null, 3200)).toBe('율동공원 야외무대 · 3.2km');
  });

  it('시/군/구가 있으면 거리보다 우선한다', () => {
    expect(formatVenueLine('율동공원 야외무대', '경기도 성남시 분당구', 3200)).toBe(
      '율동공원 야외무대 · 경기도 성남시 분당구'
    );
  });

  // Task 9-6-8: 인제스트/마이그레이션에서 놓친 값이 있어도 표시 시점에 방어적으로 보완한다.
  it('광역 지자체 접두가 빠진 sigunguName이 들어와도 표시 시점에 보완한다', () => {
    expect(formatVenueLine('서울대공원 테마가든', '과천시')).toBe('서울대공원 테마가든 · 경기도 과천시');
  });

  it('판별 불가능한(여러 광역에 동일 이름 존재) sigunguName은 원본 그대로 표시한다', () => {
    expect(formatVenueLine('어딘가', '중구')).toBe('어딘가 · 중구');
  });
});
