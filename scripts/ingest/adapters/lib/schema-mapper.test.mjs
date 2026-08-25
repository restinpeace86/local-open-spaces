// Decision 017(2026-08-25): buildOpenSpaceRow/buildEventRow에 locationPrecision(위치 미상
// null-safe 적재)/source/rawData 지원을 추가했다. 이 파일은 기존에 없었으나(간접적으로만
// 각 어댑터 테스트에서 검증되고 있었음) 두 빌더가 ~25개 어댑터가 공유하는 핵심 로직이라
// 새로 추가된 UNKNOWN 분기와 기존 EXACT 기본 동작(하위 호환)을 직접 검증한다.
import { describe, expect, it } from 'vitest';
import { buildOpenSpaceRow, buildEventRow } from './schema-mapper.mjs';

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
});
