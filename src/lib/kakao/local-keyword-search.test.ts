import { describe, expect, it } from 'vitest';
import { parseKakaoLocalDocuments } from './local-keyword-search';

// [사용자 글쓰기 스팟 검색 — 외부 API Fallback](2026-09-10 사용자 지시, todo.md 개선사항5)
describe('parseKakaoLocalDocuments', () => {
  it('카카오 응답에서 상호명/주소/좌표를 뽑고 external_id를 KAKAO_LOCAL_ 접두어로 만든다', () => {
    const json = {
      documents: [
        {
          id: '12345',
          place_name: '숲속 놀이터',
          road_address_name: '경기 성남시 분당구 판교로 100',
          address_name: '경기 성남시 분당구 백현동 1',
          x: '127.111',
          y: '37.388',
        },
      ],
    };
    expect(parseKakaoLocalDocuments(json)).toEqual([
      {
        externalId: 'KAKAO_LOCAL_12345',
        name: '숲속 놀이터',
        address: '경기 성남시 분당구 판교로 100',
        lat: 37.388,
        lng: 127.111,
      },
    ]);
  });

  it('도로명 주소가 없으면 지번 주소를 쓴다', () => {
    const json = { documents: [{ id: '1', place_name: 'A', address_name: '서울 종로구 1', x: '126.98', y: '37.57' }] };
    expect(parseKakaoLocalDocuments(json)[0].address).toBe('서울 종로구 1');
  });

  it('상호명/주소/좌표가 없거나 한국 밖 좌표면 버린다', () => {
    const json = {
      documents: [
        { id: '1', place_name: '', road_address_name: '서울 어딘가', x: '127', y: '37' },
        { id: '2', place_name: '주소없음', x: '127', y: '37' },
        { id: '3', place_name: '해외', road_address_name: '도쿄', x: '139.7', y: '35.6' },
      ],
    };
    expect(parseKakaoLocalDocuments(json)).toEqual([]);
  });

  it('documents가 없으면 빈 배열', () => {
    expect(parseKakaoLocalDocuments({})).toEqual([]);
    expect(parseKakaoLocalDocuments(null)).toEqual([]);
  });
});
