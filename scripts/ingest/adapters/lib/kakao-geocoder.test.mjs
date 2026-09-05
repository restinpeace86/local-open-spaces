// Task 9-6-5: kakao-geocoder.mjs 단위 테스트
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasKakaoApiKey, geocodeKeyword, geocodeAddress } = await import('./kakao-geocoder.mjs');

describe('hasKakaoApiKey', () => {
  it('KAKAO_REST_API_KEY가 있으면 true, 없으면 false를 반환한다', () => {
    process.env.KAKAO_REST_API_KEY = 'test-key';
    expect(hasKakaoApiKey()).toBe(true);
    delete process.env.KAKAO_REST_API_KEY;
    expect(hasKakaoApiKey()).toBe(false);
  });
});

describe('geocodeKeyword', () => {
  beforeEach(() => {
    process.env.KAKAO_REST_API_KEY = 'test-key';
  });

  it('검색 결과가 있으면 첫 번째 문서의 좌표/장소명을 반환한다', async () => {
    const fetchMock = vi.fn((url, options) =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          documents: [
            { place_name: '고양아람누리', x: '126.768', y: '37.652' },
            { place_name: '다른 곳', x: '127.0', y: '37.5' },
          ],
        }),
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await geocodeKeyword('고양아람누리 아람마슬');

    expect(result).toEqual({ lng: 126.768, lat: 37.652, placeName: '고양아람누리' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('dapi.kakao.com/v2/local/search/keyword.json');
    expect(new URL(url).searchParams.get('query')).toBe('고양아람누리 아람마슬');
    expect(options.headers.Authorization).toBe('KakaoAK test-key');
  });

  it('검색 결과가 없으면 null을 반환한다(추측하지 않음)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ documents: [] }) })));

    const result = await geocodeKeyword('존재하지 않는 장소');
    expect(result).toBeNull();
  });

  it('HTTP 에러 응답이면 예외를 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 401, text: async () => 'KA Header is required' }))
    );

    await expect(geocodeKeyword('아무 장소')).rejects.toThrow('Kakao 키워드 검색 실패');
  });
});

// [지오코딩 안전장치 — 대체 API Fallback](2026-09-05 사용자 지시): V-World 실패 시 자동
// 전환 대상인 카카오 "주소 검색"(POI 키워드 검색과 다른 엔드포인트) 단위 테스트.
describe('geocodeAddress', () => {
  beforeEach(() => {
    process.env.KAKAO_REST_API_KEY = 'test-key';
  });

  it('주소 검색 결과가 있으면 첫 번째 문서의 좌표를 반환한다', async () => {
    const fetchMock = vi.fn((url) =>
      Promise.resolve({ ok: true, json: async () => ({ documents: [{ x: '127.1', y: '37.3' }] }) })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await geocodeAddress('경기도 성남시 분당구 판교역로 1');

    expect(result).toEqual({ lng: 127.1, lat: 37.3 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('dapi.kakao.com/v2/local/search/address.json');
  });

  it('검색 결과가 없으면 null을 반환한다(추측하지 않음)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ documents: [] }) })));

    expect(await geocodeAddress('존재하지 않는 주소')).toBeNull();
  });

  it('HTTP 에러 응답이면 예외를 던진다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500, text: async () => 'error' })));

    await expect(geocodeAddress('아무 주소')).rejects.toThrow('Kakao 주소 검색 실패');
  });
});
