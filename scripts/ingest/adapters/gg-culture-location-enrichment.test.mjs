// Task 9-6-3: gg-culture-location-enrichment.mjs 단위 테스트
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./lib/vworld-geocoder.mjs', () => ({
  hasVworldApiKey: vi.fn(() => true),
  geocode: vi.fn(),
}));

// Task 9-6-5: 카카오 키워드 장소 검색(VWorld 실패 시 2차 폴백) 모킹.
vi.mock('./lib/kakao-geocoder.mjs', () => ({
  hasKakaoApiKey: vi.fn(() => false),
  geocodeKeyword: vi.fn(),
}));

const {
  extractVenueFromHtml,
  buildUrlLookup,
  geocodeVenueOrNull,
  stripRoomFloorDescriptor,
  truncateAtAndKeyword,
  normalizeVenueText,
  enrichGgCultureEventLocations,
  API1_EXTERNAL_ID_PREFIX,
} = await import('./gg-culture-location-enrichment.mjs');
const { geocode } = await import('./lib/vworld-geocoder.mjs');
const { hasKakaoApiKey, geocodeKeyword } = await import('./lib/kakao-geocoder.mjs');

// 실측 확인(2026-08-23)한 ggc.ggcf.kr 상세 페이지의 실제 마크업 구조를 그대로 재현한 표본.
// "주소" 필드는 실제로는 <!-- 주석 처리된 --> 템플릿 잔재(모든 페이지에 동일 예시값)라
// 절대 스크래핑 대상으로 쓰면 안 된다는 점을 테스트로도 명시한다.
const SAMPLE_HTML = `
<html><body>
<!--<div class="map_box"><dl class="address"><dt>주소:</dt><dd>경기도 수원시 팔달구 효원로 307번길 경기아트센터</dd></dl></div>-->
<dl><dt>분 류</dt><dd>상설전</dd></dl>
<dl><dt>기 간</dt><dd>2023.11.24 ~ 2027.01.10</dd></dl>
<dl><dt>장 소</dt><dd>경기도자미술관 상설전시실 2,3층</dd></dl>
<dl><dt>시 간</dt><dd>오전 10시 ~ 오후 6시</dd></dl>
</body></html>
`;

const GEOCODE_RESULT = { lng: 127.11, lat: 37.29 };

describe('extractVenueFromHtml', () => {
  it('실제 마크업 구조에서 "장 소" 필드값을 추출한다', () => {
    expect(extractVenueFromHtml(SAMPLE_HTML)).toBe('경기도자미술관 상설전시실 2,3층');
  });

  it('주석 처리된 "주소" 필드는 절대 추출하지 않는다(템플릿 잔재 함정 회피)', () => {
    const venue = extractVenueFromHtml(SAMPLE_HTML);
    expect(venue).not.toContain('효원로');
  });

  it('"장 소" 필드가 없으면 null을 반환한다(추측하지 않음)', () => {
    expect(extractVenueFromHtml('<html><body>내용 없음</body></html>')).toBeNull();
  });
});

describe('buildUrlLookup', () => {
  const buildExternalId = (prefix, key) => `${prefix}_${key.length}`;

  it('item.URL이 있는 항목만 재계산한 external_id로 매핑한다', () => {
    const items = [
      { TITLE: '행사A', BEGIN_DE: '20260101', URL: 'https://a' },
      { TITLE: '행사B', BEGIN_DE: '20260102', URL: null },
    ];
    const lookup = buildUrlLookup(items, buildExternalId);
    const idA = buildExternalId('GG_CULTURE_EVENT', 'https://a');
    expect(lookup.get(idA)).toBe('https://a');
    expect(lookup.size).toBe(1);
  });
});

describe('geocodeVenueOrNull', () => {
  beforeEach(() => {
    geocode.mockReset();
    hasKakaoApiKey.mockReset();
    hasKakaoApiKey.mockReturnValue(false);
    geocodeKeyword.mockReset();
  });

  it('콤마로 나열된 경우 첫 번째 장소만 지오코딩한다', async () => {
    geocode.mockResolvedValueOnce(GEOCODE_RESULT);
    const result = await geocodeVenueOrNull('경기아트센터, 경기 예술인의 집');
    expect(geocode).toHaveBeenCalledWith('경기아트센터');
    expect(result).toEqual({ primary: '경기아트센터', coords: GEOCODE_RESULT, provider: 'vworld' });
  });

  it('경기도 범위를 벗어나고 카카오 키가 없으면 null을 반환한다', async () => {
    geocode.mockResolvedValueOnce({ lng: 129.5, lat: 35.8 });
    const result = await geocodeVenueOrNull('알 수 없는 장소');
    expect(result).toBeNull();
    expect(geocodeKeyword).not.toHaveBeenCalled();
  });

  it('지오코딩 결과가 없고 카카오 키가 없으면 null을 반환한다', async () => {
    geocode.mockResolvedValueOnce(null);
    const result = await geocodeVenueOrNull('알 수 없는 장소');
    expect(result).toBeNull();
    expect(geocodeKeyword).not.toHaveBeenCalled();
  });

  // Task 9-6-5: VWorld 실패 시 카카오 키워드 장소 검색으로 2차 폴백.
  it('VWorld가 실패하고 카카오 키가 있으면 카카오 키워드 검색으로 재시도한다', async () => {
    geocode.mockResolvedValueOnce(null);
    hasKakaoApiKey.mockReturnValue(true);
    geocodeKeyword.mockResolvedValueOnce({ lng: 126.77, lat: 37.66, placeName: '고양아람누리' });

    const result = await geocodeVenueOrNull('고양아람누리 아람마슬');

    expect(geocodeKeyword).toHaveBeenCalledWith('고양아람누리 아람마슬');
    expect(result).toEqual({
      primary: '고양아람누리 아람마슬',
      coords: { lng: 126.77, lat: 37.66, placeName: '고양아람누리' },
      provider: 'kakao',
    });
  });

  it('카카오도 경기도 범위를 벗어나면 null을 반환한다(오매칭 방지)', async () => {
    geocode.mockResolvedValueOnce(null);
    hasKakaoApiKey.mockReturnValue(true);
    geocodeKeyword.mockResolvedValueOnce({ lng: 129.5, lat: 35.8, placeName: '무관한 장소' });

    const result = await geocodeVenueOrNull('알 수 없는 장소');
    expect(result).toBeNull();
  });

  it('카카오도 결과가 없으면 null을 반환한다', async () => {
    geocode.mockResolvedValueOnce(null);
    hasKakaoApiKey.mockReturnValue(true);
    geocodeKeyword.mockResolvedValueOnce(null);

    const result = await geocodeVenueOrNull('존재하지 않는 장소');
    expect(result).toBeNull();
  });

  it('VWorld가 성공하면 카카오는 아예 호출하지 않는다(1차 우선)', async () => {
    geocode.mockResolvedValueOnce(GEOCODE_RESULT);
    hasKakaoApiKey.mockReturnValue(true);

    await geocodeVenueOrNull('정상 주소');

    expect(geocodeKeyword).not.toHaveBeenCalled();
  });

  // Task 9-6-6(2026-08-23): 사용자 지시 — 건물 내부 특정 실/층 단위가 있으면 그걸 제외한
  // 건물명으로 재시도한다. VWorld/카카오 둘 다 원문으로는 실패해야 이 3차 시도가 트리거된다.
  it('직접 시도가 모두 실패하면 실/층 단위를 제거한 건물명으로 3차 재시도한다', async () => {
    geocode.mockResolvedValueOnce(null); // 원문("백남준아트센터 제2전시실") 직접 시도 실패
    geocode.mockResolvedValueOnce(GEOCODE_RESULT); // 제거 후("백남준아트센터") 재시도 성공

    const result = await geocodeVenueOrNull('백남준아트센터 제2전시실');

    expect(geocode).toHaveBeenNthCalledWith(1, '백남준아트센터 제2전시실');
    expect(geocode).toHaveBeenNthCalledWith(2, '백남준아트센터');
    expect(result).toEqual({ primary: '백남준아트센터', coords: GEOCODE_RESULT, provider: 'vworld' });
  });

  it('제거할 실/층 단위 토큰이 없으면 3차 재시도 자체를 하지 않는다', async () => {
    geocode.mockResolvedValueOnce(null);

    await geocodeVenueOrNull('안양 평촌중앙공원');

    expect(geocode).toHaveBeenCalledTimes(1); // "공원"은 제거 대상이 아님 — 재시도 없음
  });

  it('건물명만 남겨도 실패하면 최종적으로 null을 반환한다', async () => {
    geocode.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await geocodeVenueOrNull('전곡선사박물관 2층 교육실');

    expect(result).toBeNull();
    expect(geocode).toHaveBeenCalledTimes(2);
  });

  // Task 9-6-6(2026-08-23) Part 2: "A 및 B" 형태로 나열된 텍스트는 원문 직접 시도가 실패하면
  // '및' 이하를 절단한 대표 장소로 4단계 재시도한다.
  it('직접 시도가 실패하면 "및" 이하를 절단한 대표 장소로 4단계 재시도한다', async () => {
    geocode.mockResolvedValueOnce(null); // 원문("과천시민광장 및 과천시민회관 일대") 직접 시도 실패
    geocode.mockResolvedValueOnce(GEOCODE_RESULT); // 절단 후("과천시민광장") 재시도 성공

    const result = await geocodeVenueOrNull('과천시민광장 및 과천시민회관 일대');

    expect(geocode).toHaveBeenNthCalledWith(1, '과천시민광장 및 과천시민회관 일대');
    expect(geocode).toHaveBeenNthCalledWith(2, '과천시민광장');
    expect(result).toEqual({ primary: '과천시민광장', coords: GEOCODE_RESULT, provider: 'vworld' });
  });
});

describe('stripRoomFloorDescriptor', () => {
  it('건물명 뒤에 붙은 층/실 단위를 제거한다', () => {
    expect(stripRoomFloorDescriptor('백남준아트센터 제2전시실')).toBe('백남준아트센터');
    expect(stripRoomFloorDescriptor('전곡선사박물관 2층 교육실')).toBe('전곡선사박물관');
    expect(stripRoomFloorDescriptor('경기도박물관 1F 기획전시실')).toBe('경기도박물관');
    expect(stripRoomFloorDescriptor('전곡선사박물관 B1 기획전시실')).toBe('전곡선사박물관');
  });

  it('방 이름 전체가 하나의 단어여도(부분 문자열이 아니라) 통째로 제거한다', () => {
    expect(stripRoomFloorDescriptor('광주시문화예술의전당 맹사성홀')).toBe('광주시문화예술의전당');
  });

  it('숫자/범위 단위 뒤에 오는 실 이름도 순서대로 제거한다', () => {
    expect(stripRoomFloorDescriptor('경기도미술관 전시실 1-4')).toBe('경기도미술관');
  });

  it('"내외부"처럼 접미 패턴이 없는 특수 케이스도 제거한다', () => {
    expect(stripRoomFloorDescriptor('백남준아트센터 내외부')).toBe('백남준아트센터');
  });

  it('제거할 실/층 단위가 없으면 null을 반환한다(추측하지 않음)', () => {
    expect(stripRoomFloorDescriptor('경기상상캠퍼스 업사이클플라자')).toBeNull();
    expect(stripRoomFloorDescriptor('안양 평촌중앙공원')).toBeNull();
    expect(stripRoomFloorDescriptor('회차별 상이')).toBeNull();
  });
});

describe('truncateAtAndKeyword', () => {
  it('"및" 이하를 잘라 앞쪽 대표 장소만 남긴다', () => {
    expect(truncateAtAndKeyword('과천시민광장 및 과천시민회관 일대')).toBe('과천시민광장');
    expect(truncateAtAndKeyword('양평군 세미원 및 두물머리')).toBe('양평군 세미원');
  });

  it('"및"이 없으면 null을 반환한다(추측하지 않음)', () => {
    expect(truncateAtAndKeyword('백남준아트센터 제2전시실')).toBeNull();
  });

  it('"및"이 맨 앞 토큰이면(대표로 삼을 앞부분이 없음) null을 반환한다', () => {
    expect(truncateAtAndKeyword('및 두물머리')).toBeNull();
  });
});

describe('normalizeVenueText', () => {
  it('"및" 절단을 먼저 적용한 뒤 남은 실/층 단위를 제거한다', () => {
    expect(normalizeVenueText('과천시민광장 및 과천시민회관 일대')).toBe('과천시민광장');
  });

  it('"및"이 없으면 실/층 단위 제거만 적용한다(기존 stripRoomFloorDescriptor와 동일 결과)', () => {
    expect(normalizeVenueText('백남준아트센터 제2전시실')).toBe('백남준아트센터');
  });

  it('둘 다 적용할 게 없으면 null을 반환한다', () => {
    expect(normalizeVenueText('안양 평촌중앙공원')).toBeNull();
  });
});

function makeFakeClient({ selectData, updateError = null }) {
  const updateCalls = [];
  const client = {
    from: () => ({
      select: () => ({
        gte: () => ({
          in: () => Promise.resolve({ data: selectData, error: null }),
        }),
      }),
      update: (payload) => ({
        eq: (_col, id) => {
          updateCalls.push({ id, payload });
          return Promise.resolve({ error: updateError });
        },
      }),
    }),
  };
  return { client, updateCalls };
}

describe('enrichGgCultureEventLocations', () => {
  beforeEach(() => {
    geocode.mockReset();
    geocode.mockResolvedValue(GEOCODE_RESULT);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(SAMPLE_HTML) }))
    );
  });

  const fakeAdapter = (cultureEventItems) => ({
    fetch: vi.fn(() => Promise.resolve({ cultureEventItems, foundationEventItems: [] })),
    buildExternalId: (prefix, key) => `${prefix}_${key.length}`,
  });

  it('URL 복원 + 스크래핑 + 지오코딩이 모두 성공하면 EXACT로 UPDATE한다', async () => {
    const rawItem = { TITLE: '경기도자미술관 소장품상설전', BEGIN_DE: '20231124', URL: 'https://ggc.ggcf.kr/view/abc' };
    const adapter = fakeAdapter([rawItem]);
    const externalId = adapter.buildExternalId('GG_CULTURE_EVENT', rawItem.URL);
    const { client, updateCalls } = makeFakeClient({
      selectData: [{ id: 'row-1', external_id: externalId, title: rawItem.TITLE }],
    });

    const result = await enrichGgCultureEventLocations({ client, adapter, dryRun: false });

    expect(result).toMatchObject({ total: 1, updated: 1, noUrlRecovered: 0, noVenueField: 0, geocodeFailed: 0 });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({
      id: 'row-1',
      payload: {
        venue_name: '경기도자미술관 상설전시실 2,3층',
        location: `SRID=4326;POINT(${GEOCODE_RESULT.lng} ${GEOCODE_RESULT.lat})`,
        location_precision: 'EXACT',
      },
    });
  });

  it('dry-run이면 UPDATE를 호출하지 않는다', async () => {
    const rawItem = { TITLE: '경기도자미술관 소장품상설전', BEGIN_DE: '20231124', URL: 'https://ggc.ggcf.kr/view/abc' };
    const adapter = fakeAdapter([rawItem]);
    const externalId = adapter.buildExternalId('GG_CULTURE_EVENT', rawItem.URL);
    const { client, updateCalls } = makeFakeClient({
      selectData: [{ id: 'row-1', external_id: externalId, title: rawItem.TITLE }],
    });

    const result = await enrichGgCultureEventLocations({ client, adapter, dryRun: true });

    expect(result.updated).toBe(1);
    expect(updateCalls).toHaveLength(0);
  });

  it('원본 API에서 더 이상 찾을 수 없어 URL을 복원 못 하면 건너뛴다', async () => {
    const adapter = fakeAdapter([]); // 원본에 이제 이 항목이 없음
    const { client, updateCalls } = makeFakeClient({
      selectData: [{ id: 'row-1', external_id: `${API1_EXTERNAL_ID_PREFIX}deadbeef`, title: '사라진 행사' }],
    });

    const result = await enrichGgCultureEventLocations({ client, adapter, dryRun: false });

    expect(result).toMatchObject({ total: 1, updated: 0, noUrlRecovered: 1 });
    expect(updateCalls).toHaveLength(0);
  });

  it('API1이 아닌 소스(예: GG_FOUNDATION_EVENT_)는 건너뛴다', async () => {
    const adapter = fakeAdapter([]);
    const { client, updateCalls } = makeFakeClient({
      selectData: [{ id: 'row-2', external_id: 'GG_FOUNDATION_EVENT_xyz', title: 'API2 항목' }],
    });

    const result = await enrichGgCultureEventLocations({ client, adapter, dryRun: false });

    expect(result.total).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('상세 페이지에 "장소" 필드가 없으면 건너뛴다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') })));
    const rawItem = { TITLE: '행사', BEGIN_DE: '20260101', URL: 'https://ggc.ggcf.kr/view/no-venue' };
    const adapter = fakeAdapter([rawItem]);
    const externalId = adapter.buildExternalId('GG_CULTURE_EVENT', rawItem.URL);
    const { client, updateCalls } = makeFakeClient({
      selectData: [{ id: 'row-3', external_id: externalId, title: rawItem.TITLE }],
    });

    const result = await enrichGgCultureEventLocations({ client, adapter, dryRun: false });

    expect(result).toMatchObject({ total: 1, updated: 0, noVenueField: 1 });
    expect(updateCalls).toHaveLength(0);
  });

  it('지오코딩이 실패하면 건너뛴다', async () => {
    // 이 표본의 venue("경기도자미술관 상설전시실 2,3층")는 Task 9-6-6의 실/층 단위 제거 재시도
    // 대상이라("상설전시실 2" -> "경기도자미술관") geocode가 두 번(직접 시도 + 제거 후 재시도)
    // 호출된다 — 둘 다 실패로 모킹해야 진짜 "완전히 실패" 시나리오가 재현된다.
    geocode.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const rawItem = { TITLE: '경기도자미술관 소장품상설전', BEGIN_DE: '20231124', URL: 'https://ggc.ggcf.kr/view/abc' };
    const adapter = fakeAdapter([rawItem]);
    const externalId = adapter.buildExternalId('GG_CULTURE_EVENT', rawItem.URL);
    const { client, updateCalls } = makeFakeClient({
      selectData: [{ id: 'row-1', external_id: externalId, title: rawItem.TITLE }],
    });

    const result = await enrichGgCultureEventLocations({ client, adapter, dryRun: false });

    expect(result).toMatchObject({ total: 1, updated: 0, geocodeFailed: 1 });
    expect(updateCalls).toHaveLength(0);
  });
});
