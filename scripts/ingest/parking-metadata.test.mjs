// [전국 주차장 표준데이터 수집](implementation/todo.md 개선사항1) — transform()/
// backfillMissingCoordsByAddress() 단위 테스트. 실측 CSV 샘플 컬럼 그대로.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./adapters/lib/vworld-geocoder.mjs', () => ({
  geocode: vi.fn(),
  hasVworldApiKey: vi.fn(() => true),
}));

const { transform, backfillMissingCoordsByAddress } = await import('./parking-metadata.mjs');
const { geocode } = await import('./adapters/lib/vworld-geocoder.mjs');

const ROW_NOEOI_WITH_COORDS = {
  주차장관리번호: '165-2-000036',
  주차장명: '남동근린공원',
  주차장구분: '공영',
  주차장유형: '노외',
  소재지도로명주소: '인천광역시 남동구 남동대로 263',
  소재지지번주소: '인천광역시 남동구 논현동 445',
  주차구획수: '379',
  요금정보: '유료',
  주차기본시간: '30',
  주차기본요금: '400',
  추가단위시간: '15',
  추가단위요금: '200',
  '1일주차권요금적용시간': '5',
  '1일주차권요금': '4000',
  월정기권요금: '',
  결제방법: '신용카드',
  특기사항: '장애인차량 50프로 할인',
  관리기관명: '인천시설공단',
  전화번호: '032-579-2701',
  장애인전용주차구역보유여부: 'Y',
  데이터기준일자: '2026-09-01',
  제공기관코드: 'B553906',
  제공기관명: '인천시설공단',
  위도: '37.4082300647',
  경도: '126.6983007858',
};

const ROW_NOSANG = { ...ROW_NOEOI_WITH_COORDS, 주차장유형: '노상' };
const ROW_BUSEOL_NO_COORDS = {
  ...ROW_NOEOI_WITH_COORDS,
  주차장유형: '부설',
  위도: '0',
  경도: '0',
};

describe('transform', () => {
  it('노상 타입은 null(제외 대상)을 반환한다', () => {
    expect(transform(ROW_NOSANG)).toBeNull();
  });

  it('노외 타입은 주요 필드를 올바르게 매핑하고 location WKT를 만든다', () => {
    const result = transform(ROW_NOEOI_WITH_COORDS);
    expect(result).toMatchObject({
      management_no: '165-2-000036',
      name: '남동근린공원',
      category_name: '공영',
      type_name: '노외',
      capacity: 379,
      base_fee: 400,
      has_disabled_parking: true,
      data_reference_date: '2026-09-01',
      location: 'SRID=4326;POINT(126.6983007858 37.4082300647)',
    });
  });

  it('좌표가 0,0이면 location을 null로 두고 지오코딩 대상으로 표시한다', () => {
    const result = transform(ROW_BUSEOL_NO_COORDS);
    expect(result.type_name).toBe('부설');
    expect(result.location).toBeNull();
    expect(result._geocodeAddress).toBeTruthy();
  });

  it('주차장명이 없으면 null을 반환한다', () => {
    expect(transform({ ...ROW_NOEOI_WITH_COORDS, 주차장명: '' })).toBeNull();
  });
});

describe('backfillMissingCoordsByAddress', () => {
  afterEach(() => vi.clearAllMocks());

  it('location이 없는 행만 지오코딩을 시도하고 성공 시 location을 채운다', async () => {
    geocode.mockResolvedValueOnce({ lng: 127.1, lat: 37.5 });
    const rows = [
      { location: null, _geocodeAddress: '서울특별시 강남구 테스트로 1' },
      { location: 'SRID=4326;POINT(1 1)', _geocodeAddress: '이미 좌표 있음' },
    ];
    const successCount = await backfillMissingCoordsByAddress(rows);
    expect(successCount).toBe(1);
    expect(rows[0].location).toBe('SRID=4326;POINT(127.1 37.5)');
    expect(rows[1].location).toBe('SRID=4326;POINT(1 1)');
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  it('지오코딩 실패(null 반환) 시 location을 null로 유지한다(추측 좌표 생성 금지)', async () => {
    geocode.mockResolvedValueOnce(null);
    const rows = [{ location: null, _geocodeAddress: '존재하지 않는 주소' }];
    const successCount = await backfillMissingCoordsByAddress(rows);
    expect(successCount).toBe(0);
    expect(rows[0].location).toBeNull();
  });

  it('_geocodeAddress가 없으면 geocode를 호출하지 않는다', async () => {
    const rows = [{ location: null, _geocodeAddress: null }];
    await backfillMissingCoordsByAddress(rows);
    expect(geocode).not.toHaveBeenCalled();
  });
});
