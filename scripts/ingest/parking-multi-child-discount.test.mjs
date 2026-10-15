// [주차장 다자녀 할인 혜택 연동](implementation/todo.md 개선사항3) —
// parseWktPoint/buildGyeonggiCandidates/buildSeoulCandidates/findBestMatch
// 단위 테스트. 실측 CSV 샘플 그대로.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./adapters/lib/vworld-geocoder.mjs', () => ({
  geocode: vi.fn(),
  hasVworldApiKey: vi.fn(() => true),
}));
vi.mock('./match-parking-to-spots.mjs', async () => {
  const actual = await vi.importActual('./match-parking-to-spots.mjs');
  return actual;
});

const { parseWktPoint, buildGyeonggiCandidates, buildSeoulCandidates, findBestMatch } = await import(
  './parking-multi-child-discount.mjs'
);

describe('parseWktPoint', () => {
  it('"POINT (lng lat)" 문자열을 파싱한다', () => {
    expect(parseWktPoint('POINT (127.0837786 36.9937654)')).toEqual({ lng: 127.0837786, lat: 36.9937654 });
  });

  it('형식이 다르면 null(추측 금지)', () => {
    expect(parseWktPoint('잘못된 형식')).toBeNull();
    expect(parseWktPoint(undefined)).toBeNull();
  });
});

describe('buildGyeonggiCandidates', () => {
  const ROW = {
    사용처구분: '공영주차장',
    대상자명: '다자녀가정',
    혜택명: '평택동공영주차장',
    위경도좌표: 'POINT (127.0837786 36.9937654)',
    할인율: '본인/50%',
    혜택기타사항: '평택시민에 한하여 적용',
  };

  it('공영주차장+다자녀가정만 추출해 좌표/할인정보를 만든다', () => {
    const result = buildGyeonggiCandidates([ROW]);
    expect(result).toEqual([
      { name: '평택동공영주차장', lng: 127.0837786, lat: 36.9937654, discountInfo: '본인/50% · 평택시민에 한하여 적용' },
    ]);
  });

  it('사용처구분이나 대상자명이 다르면 제외한다', () => {
    expect(buildGyeonggiCandidates([{ ...ROW, 사용처구분: '민영주차장' }])).toEqual([]);
    expect(buildGyeonggiCandidates([{ ...ROW, 대상자명: '장애인' }])).toEqual([]);
  });

  it('좌표 파싱이 안 되면 제외한다', () => {
    expect(buildGyeonggiCandidates([{ ...ROW, 위경도좌표: '' }])).toEqual([]);
  });
});

describe('buildSeoulCandidates', () => {
  it('업종이 공영주차장인 것만 추출한다', () => {
    const rows = [
      { 업종: '공영주차장', 업체명: '가락1', 주소: '송파구 송파대로30길16', 지원혜택: '30% 감면' },
      { 업종: '건강/의료', 업체명: '병원', 주소: '어딘가', 지원혜택: '5% 할인' },
    ];
    const result = buildSeoulCandidates(rows);
    expect(result).toEqual([{ name: '가락1', address: '송파구 송파대로30길16', discountInfo: '30% 감면' }]);
  });
});

describe('findBestMatch', () => {
  it('반경 내 후보 중 이름 유사도가 임계값 이상인 가장 유사한 것을 고른다', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({
        data: [
          { id: 'a', name: '전혀 다른 곳', distance_meters: 10 },
          { id: 'b', name: '평택동공영주차장', distance_meters: 5 },
        ],
        error: null,
      })
    );
    const client = { rpc };
    const result = await findBestMatch(client, { name: '평택동공영주차장', lng: 1, lat: 1 });
    expect(result?.id).toBe('b');
  });

  it('임계값 미달이면 null을 반환한다', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: [{ id: 'a', name: '전혀 다른 곳', distance_meters: 10 }], error: null }));
    const result = await findBestMatch({ rpc }, { name: '평택동공영주차장', lng: 1, lat: 1 });
    expect(result).toBeNull();
  });

  it('RPC 에러면 던진다', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: { message: 'db down' } }));
    await expect(findBestMatch({ rpc }, { name: 'X', lng: 1, lat: 1 })).rejects.toThrow('search_parking_metadata_near 호출 실패');
  });
});
