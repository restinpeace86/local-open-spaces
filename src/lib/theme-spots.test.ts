import { describe, expect, it } from 'vitest';
import {
  buildThemeKeywordFilter,
  classifyThemeSpot,
  confidentSourceTypesFor,
  isThemeSpotKey,
  THEME_SPOT_OPTIONS,
} from './theme-spots';

describe('THEME_SPOT_OPTIONS / isThemeSpotKey', () => {
  // Task 9-6-4(2026-08-23): 홈 화면 "🎪 행사·축제" 대분류의 "체험·자연" 칩을 위해
  // EXPERIENCE_NATURE가 7번째 테마로 추가됐다(events 전용 — source_type 매핑 없음).
  it('7대 목적별 테마를 정확히 노출한다', () => {
    expect(THEME_SPOT_OPTIONS).toHaveLength(7);
    expect(THEME_SPOT_OPTIONS.map((o) => o.key)).toEqual([
      'SWIMMING',
      'PLAYGROUND_KIDS',
      'PARK_WALK',
      'FOREST_RECREATION',
      'AMUSEMENT_ACTIVITY',
      'CULTURE_SPORTS',
      'EXPERIENCE_NATURE',
    ]);
  });

  it('isThemeSpotKey는 7대 테마 키만 참으로 판별한다', () => {
    expect(isThemeSpotKey('SWIMMING')).toBe(true);
    expect(isThemeSpotKey('EXPERIENCE_NATURE')).toBe(true);
    expect(isThemeSpotKey('KIDS_ACTIVITY')).toBe(false);
  });
});

describe('classifyThemeSpot (Task 9-5-1: source_type + 키워드 파싱)', () => {
  it('source_type이 확정적인 소스는 키워드 없이도 해당 테마로 분류한다', () => {
    expect(classifyThemeSpot({ name: '분당구 실내수영장', source_type: 'SWIMMING_POOL' })).toBe('SWIMMING');
    expect(classifyThemeSpot({ name: '율동공원 어린이놀이터', source_type: 'LOCALDATA_PLAYGROUND' })).toBe(
      'PLAYGROUND_KIDS'
    );
    expect(classifyThemeSpot({ name: '분당수변공원', source_type: 'PARK_API' })).toBe('PARK_WALK');
    expect(classifyThemeSpot({ name: '유명산 오토캠핑장', source_type: 'GO_CAMPING' })).toBe('FOREST_RECREATION');
    expect(classifyThemeSpot({ name: '설악산 생태관광', source_type: 'NATIONAL_PARK_ECOTOUR' })).toBe(
      'FOREST_RECREATION'
    );
    expect(classifyThemeSpot({ name: '한 놀이시설', source_type: 'LOCALDATA_AMUSEMENT' })).toBe(
      'AMUSEMENT_ACTIVITY'
    );
    expect(classifyThemeSpot({ name: '시립미술관', source_type: 'CULTURE_FACILITY' })).toBe('CULTURE_SPORTS');
  });

  // Task 9-5-1: 여러 목적이 섞인 대형 소스(KOR_TOUR_API_V4 등)는 키워드로 세분화한다.
  it('source_type이 확정적이지 않은 대형 소스는 이름 키워드로 분류한다', () => {
    expect(classifyThemeSpot({ name: '탄천 여름 물놀이장', source_type: 'GG_EVENTS' })).toBe('SWIMMING');
    expect(classifyThemeSpot({ name: '오대산 자연휴양림', source_type: 'KOR_TOUR_API_V4' })).toBe(
      'FOREST_RECREATION'
    );
    expect(classifyThemeSpot({ name: '서울랜드 놀이공원', source_type: 'KOR_TOUR_API_V4' })).toBe(
      'AMUSEMENT_ACTIVITY'
    );
    expect(classifyThemeSpot({ name: '국립중앙박물관', source_type: 'KOR_TOUR_API_V4' })).toBe('CULTURE_SPORTS');
  });

  // "국립공원"은 "공원"을 포함하지만 산림/생태 테마(FOREST_RECREATION)가 우선이어야 한다.
  it('"국립공원"처럼 "공원"을 포함해도 숲·휴양림 규칙이 공원·산책 규칙보다 우선한다', () => {
    expect(classifyThemeSpot({ name: '지리산국립공원 탐방', source_type: 'KOR_TOUR_API_V4' })).toBe(
      'FOREST_RECREATION'
    );
  });

  it('일반 도시공원은 공원·산책으로 분류한다', () => {
    expect(classifyThemeSpot({ name: '분당중앙공원', source_type: null })).toBe('PARK_WALK');
  });

  it('어느 규칙에도 해당하지 않으면 null을 반환한다(임의 배정 안 함)', () => {
    expect(classifyThemeSpot({ name: '이름 모를 시설', source_type: 'ETC_UNKNOWN' })).toBeNull();
    expect(classifyThemeSpot({ name: '분류 불가 항목' })).toBeNull();
  });
});

describe('confidentSourceTypesFor / buildThemeKeywordFilter (Task 9-5-1: 쿼리 빌더)', () => {
  it('confidentSourceTypesFor는 해당 테마로 확정된 source_type 목록만 반환한다', () => {
    expect(confidentSourceTypesFor('SWIMMING')).toEqual(['SWIMMING_POOL']);
    expect(confidentSourceTypesFor('FOREST_RECREATION')).toEqual(
      expect.arrayContaining(['NATIONAL_PARK_ECOTOUR', 'GO_CAMPING'])
    );
  });

  it('buildThemeKeywordFilter는 키워드 ILIKE 조건만 만든다(source_type 조건 없음)', () => {
    const filter = buildThemeKeywordFilter('SWIMMING', 'venue_name');
    expect(filter).not.toContain('source_type');
    expect(filter).toContain('venue_name.ilike.%물놀이%');
    expect(filter).toContain('venue_name.ilike.%수영장%');
  });
});
