// Decision 017(2026-08-25): buildOpenSpaceRow/buildEventRow에 locationPrecision(위치 미상
// null-safe 적재)/source/rawData 지원을 추가했다. 이 파일은 기존에 없었으나(간접적으로만
// 각 어댑터 테스트에서 검증되고 있었음) 두 빌더가 ~25개 어댑터가 공유하는 핵심 로직이라
// 새로 추가된 UNKNOWN 분기와 기존 EXACT 기본 동작(하위 호환)을 직접 검증한다.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildEventRow, normalizeFacilityType } from './schema-mapper.mjs';

// [2026-09-19 사용자 지시] "default를 복합으로 한 게 잘못된거야.. unknown 혹은 null로
// 놔야돼 실내인지 야외인지 혹은 복합인지 판단이 안되면" — 이전엔 실내/야외가 아닌
// 모든 값(판별 불가 포함)을 '복합'으로 강제했는데, 그러면 "실제로 확인된 복합"과
// "애초에 판별을 시도한 적 없음"을 구분할 수 없었다(실측: 28,948건 중 22,118건이 이
// 결함으로 미판별 방치 상태였음). 이제 '실내'/'야외'/'복합' 셋 중 정확히 일치하는
// 값만 그대로 인정하고, 그 외(판별 불가 포함)는 null로 남긴다(spec/data/ai-rule.md
// 5.2-4 개정).
describe('normalizeFacilityType', () => {
  it('실내/야외/복합은 그대로 인정한다', () => {
    expect(normalizeFacilityType('실내')).toBe('실내');
    expect(normalizeFacilityType('야외')).toBe('야외');
    expect(normalizeFacilityType('복합')).toBe('복합');
  });

  it('판별 불가(그 외 값/빈 값/undefined)는 더 이상 복합으로 단정하지 않고 null이다', () => {
    expect(normalizeFacilityType(undefined)).toBeNull();
    expect(normalizeFacilityType(null)).toBeNull();
    expect(normalizeFacilityType('')).toBeNull();
    expect(normalizeFacilityType('알수없음')).toBeNull();
  });
});

describe('buildOpenSpaceRow', () => {
  const BASE = { externalId: 'A', sourceType: 'TEST', name: '테스트 공간' };

  it('locationPrecision을 지정하지 않으면 기본값 EXACT로 lng/lat이 필수다(기존 동작 유지)', () => {
    expect(buildOpenSpaceRow({ ...BASE })).toBeNull();
    expect(buildOpenSpaceRow({ ...BASE, lng: 127, lat: 37 })).not.toBeNull();
  });

  it('locationPrecision: UNKNOWN이면 lng/lat 없이도 드롭하지 않고 location=null로 적재한다', () => {
    const row = buildOpenSpaceRow({ ...BASE, locationPrecision: 'UNKNOWN' });
    expect(row).not.toBeNull();
    expect(row.location).toBeNull();
    expect(row.location_precision).toBe('UNKNOWN');
  });

  it('locationPrecision: UNKNOWN인데 lng/lat이 있으면 정합성 위반이라 드롭한다', () => {
    expect(buildOpenSpaceRow({ ...BASE, locationPrecision: 'UNKNOWN', lng: 127, lat: 37 })).toBeNull();
  });

  it('externalId/sourceType/name 중 하나라도 없으면 좌표 유무와 무관하게 드롭한다(식별자 필수)', () => {
    expect(buildOpenSpaceRow({ sourceType: 'TEST', name: '이름', locationPrecision: 'UNKNOWN' })).toBeNull();
  });

  it('facilityType을 넘기지 않으면 기본값이 null이다(2026-09-19 개정 — 이전엔 복합이었음)', () => {
    const row = buildOpenSpaceRow({ ...BASE, locationPrecision: 'UNKNOWN' });
    expect(row.facility_type).toBeNull();
  });

  it('source/rawData를 그대로 컬럼에 담는다', () => {
    const row = buildOpenSpaceRow({ ...BASE, lng: 127, lat: 37, source: 'seoul_public_reservation', rawData: { MAXCLASSNM: '체육시설' } });
    expect(row.source).toBe('seoul_public_reservation');
    expect(row.raw_data).toEqual({ MAXCLASSNM: '체육시설' });
  });
});

describe('buildEventRow', () => {
  const BASE = { externalId: 'A', title: '테스트 행사', startDate: '2026-08-25', endDate: '2026-08-30' };

  it('locationPrecision: UNKNOWN이면 lng/lat 없이도 드롭하지 않고 location=null로 적재한다(Decision 009 기존 동작 유지 확인)', () => {
    const row = buildEventRow({ ...BASE, locationPrecision: 'UNKNOWN' });
    expect(row).not.toBeNull();
    expect(row.location).toBeNull();
  });

  it('facilityType을 넘기지 않으면 기본값이 null이다(2026-09-19 개정 — 이전엔 복합이었음)', () => {
    const row = buildEventRow({ ...BASE, locationPrecision: 'UNKNOWN' });
    expect(row.facility_type).toBeNull();
  });

  it('source/rawData를 그대로 컬럼에 담는다', () => {
    const row = buildEventRow({
      ...BASE,
      lng: 127,
      lat: 37,
      source: 'seoul_public_reservation',
      rawData: { MAXCLASSNM: '문화체험' },
    });
    expect(row.source).toBe('seoul_public_reservation');
    expect(row.raw_data).toEqual({ MAXCLASSNM: '문화체험' });
  });

  it('startDate/endDate가 없으면 여전히 드롭한다(events.start_date/end_date는 DB NOT NULL 제약)', () => {
    expect(buildEventRow({ externalId: 'A', title: '제목', locationPrecision: 'UNKNOWN' })).toBeNull();
  });

  it('targetAudience/targetAudienceSource를 넘기면 target_audience/target_audience_source 컬럼에 그대로 담는다', () => {
    const row = buildEventRow({
      ...BASE,
      locationPrecision: 'UNKNOWN',
      targetAudience: 'ADULT',
      targetAudienceSource: 'RAW_FIELD',
    });
    expect(row.target_audience).toBe('ADULT');
    expect(row.target_audience_source).toBe('RAW_FIELD');
  });

  it('targetAudience를 넘기지 않으면 target_audience/target_audience_source는 null이다(기존 동작 유지)', () => {
    const row = buildEventRow({ ...BASE, locationPrecision: 'UNKNOWN' });
    expect(row.target_audience).toBeNull();
    expect(row.target_audience_source).toBeNull();
  });
});
