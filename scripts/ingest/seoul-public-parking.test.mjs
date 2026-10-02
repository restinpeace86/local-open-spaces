// [스팟/이벤트 상세 "주변 주차장" 아코디언](2026-10-02 사용자 지시) — transform() 단위 테스트.
// 실측 표본 그대로(2026-10-02 GetParkInfo 1/5/ 직접 호출, 응답 그대로 복사).
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./adapters/lib/vworld-geocoder.mjs', () => ({
  geocode: vi.fn(),
}));

const { transform, dedupeByPkltCdPreferringCoords, backfillMissingCoordsByAddress } = await import(
  './seoul-public-parking.mjs'
);
const { geocode } = await import('./adapters/lib/vworld-geocoder.mjs');

const ITEM_WITH_COORDS = {
  PKLT_NM: '구로디지털단지역 공영주차장(시)',
  ADDR: '구로구 구로동 810-3',
  PKLT_CD: '1037932',
  PKLT_KND: 'NW',
  PKLT_KND_NM: '노외 주차장',
  OPER_SE: '1',
  OPER_SE_NM: '시간제 주차장',
  TELNO: '02-2290-6034',
  PRK_NOW_INFO_PVSN_YN: '1',
  PRK_NOW_INFO_PVSN_YN_NM: '현재~20분이내 연계데이터 존재(현재 주차대수 표현)',
  TPKCT: 91,
  CHGD_FREE_SE: 'Y',
  CHGD_FREE_NM: '유료',
  WD_OPER_BGNG_TM: '0000',
  WD_OPER_END_TM: '2400',
  WE_OPER_BGNG_TM: '0000',
  WE_OPER_END_TM: '2400',
  LAST_DATA_SYNC_TM: '2026-04-06 17:19:57',
  PRK_CRG: 320,
  PRK_HM: 5,
  ADD_CRG: 320,
  ADD_UNIT_TM_MNT: 5,
  LAT: 37.48543179,
  LOT: 126.90124331,
};

const ITEM_WITHOUT_COORDS = {
  PKLT_NM: '마장동(건물) 공영주차장(구)',
  ADDR: '성동구 마장동 463-2',
  PKLT_CD: '1013181',
  PKLT_KND_NM: '노외 주차장',
  OPER_SE_NM: '시간제 주차장',
  TELNO: '02-2204-7970',
  PRK_NOW_INFO_PVSN_YN: '2',
  PRK_NOW_INFO_PVSN_YN_NM: '20~120분이내 연계데이터 존재(정보수집중)',
  TPKCT: 52.0,
  CHGD_FREE_SE: 'Y',
  LAST_DATA_SYNC_TM: '2023-06-28 13:25:08',
  LAT: 0.0,
  LOT: 0.0,
};

describe('seoul-public-parking transform', () => {
  it('좌표가 있으면 WKT POINT로 변환한다', () => {
    const row = transform(ITEM_WITH_COORDS);
    expect(row.location).toBe('SRID=4326;POINT(126.90124331 37.48543179)');
  });

  it('좌표가 0.0/0.0이면 location을 null로 둔다(임의 좌표 생성 금지)', () => {
    const row = transform(ITEM_WITHOUT_COORDS);
    expect(row.location).toBeNull();
  });

  it('PKLT_CD/PKLT_NM이 없으면 null(드롭)을 반환한다', () => {
    expect(transform({ ...ITEM_WITH_COORDS, PKLT_CD: '' })).toBeNull();
    expect(transform({ ...ITEM_WITH_COORDS, PKLT_NM: '' })).toBeNull();
  });

  it('CHGD_FREE_SE=Y는 is_paid=true, N은 false로 변환한다', () => {
    expect(transform(ITEM_WITH_COORDS).is_paid).toBe(true);
    expect(transform({ ...ITEM_WITH_COORDS, CHGD_FREE_SE: 'N' }).is_paid).toBe(false);
  });

  it('기본 필드를 그대로 매핑한다', () => {
    const row = transform(ITEM_WITH_COORDS);
    expect(row).toMatchObject({
      pklt_cd: '1037932',
      name: '구로디지털단지역 공영주차장(시)',
      address: '구로구 구로동 810-3',
      kind_name: '노외 주차장',
      operation_type_name: '시간제 주차장',
      tel: '02-2290-6034',
      total_capacity: 91,
      base_fee: 320,
      base_minutes: 5,
      add_fee: 320,
      add_minutes: 5,
      weekday_open_time: '0000',
      weekday_close_time: '2400',
      realtime_info_status: '1',
      realtime_info_status_name: '현재~20분이내 연계데이터 존재(현재 주차대수 표현)',
    });
  });

  it('LAST_DATA_SYNC_TM을 ISO 타임스탬프로 변환한다', () => {
    const row = transform(ITEM_WITH_COORDS);
    expect(row.last_data_sync_at).toBe(new Date('2026-04-06T17:19:57').toISOString());
  });

  it('LAST_DATA_SYNC_TM이 없으면 null이다', () => {
    const row = transform({ ...ITEM_WITH_COORDS, LAST_DATA_SYNC_TM: '' });
    expect(row.last_data_sync_at).toBeNull();
  });
});

// [실측 발견 버그 수정 회귀 테스트](2026-10-02): 같은 pklt_cd 여러 구획 중 좌표 없는
// 행이 마지막일 때 좌표 있는 다른 구획을 버리면 안 된다 — 단순 중복 제거 시 좌표
// 보유율이 66.5%→13.8%로 급락했던 실제 버그.
describe('dedupeByPkltCdPreferringCoords', () => {
  const WITH_COORDS = { pklt_cd: 'A1', location: 'SRID=4326;POINT(127 37)' };
  const WITHOUT_COORDS = { pklt_cd: 'A1', location: null };

  it('좌표 없는 행이 뒤에 와도 먼저 나온 좌표 있는 행을 유지한다', () => {
    const result = dedupeByPkltCdPreferringCoords([WITH_COORDS, WITHOUT_COORDS]);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBe('SRID=4326;POINT(127 37)');
  });

  it('좌표 있는 행이 뒤에 와도 그걸 채택한다', () => {
    const result = dedupeByPkltCdPreferringCoords([WITHOUT_COORDS, WITH_COORDS]);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBe('SRID=4326;POINT(127 37)');
  });

  it('모든 구획에 좌표가 없으면 null인 채로 하나만 남긴다', () => {
    const result = dedupeByPkltCdPreferringCoords([WITHOUT_COORDS, { ...WITHOUT_COORDS }]);
    expect(result).toHaveLength(1);
    expect(result[0].location).toBeNull();
  });

  it('서로 다른 pklt_cd는 모두 유지한다', () => {
    const result = dedupeByPkltCdPreferringCoords([WITH_COORDS, { ...WITH_COORDS, pklt_cd: 'B2' }]);
    expect(result).toHaveLength(2);
  });
});

// [주소 기반 지오코딩 백필](2026-10-02 사용자 지시: "주소 기반 지오코딩 보강 추가해..
// vworld꺼 지오코딩 우리쓰고 있지않아? 기존에 쓰던거 써봐") — 기존 vworld-geocoder.mjs를
// 그대로 재사용하는 로직을 검증한다.
describe('backfillMissingCoordsByAddress', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('좌표 없는 행만 geocode()를 호출해 성공하면 location을 채운다', async () => {
    geocode.mockResolvedValueOnce({ lng: 127.1, lat: 37.5 });
    const rows = [{ pklt_cd: 'A1', address: '서울 강남구 테헤란로 1', location: null }];

    const successCount = await backfillMissingCoordsByAddress(rows);

    expect(successCount).toBe(1);
    expect(rows[0].location).toBe('SRID=4326;POINT(127.1 37.5)');
    expect(geocode).toHaveBeenCalledWith('서울 강남구 테헤란로 1');
  });

  it('이미 좌표가 있는 행은 geocode()를 호출하지 않는다', async () => {
    const rows = [{ pklt_cd: 'A1', address: '주소1', location: 'SRID=4326;POINT(1 1)' }];

    const successCount = await backfillMissingCoordsByAddress(rows);

    expect(successCount).toBe(0);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('주소가 없는 행은 geocode()를 호출하지 않는다', async () => {
    const rows = [{ pklt_cd: 'A1', address: null, location: null }];

    const successCount = await backfillMissingCoordsByAddress(rows);

    expect(successCount).toBe(0);
    expect(geocode).not.toHaveBeenCalled();
  });

  it('geocode()가 null(실패)을 반환하면 location은 null로 유지한다(추측 좌표 생성 금지)', async () => {
    geocode.mockResolvedValueOnce(null);
    const rows = [{ pklt_cd: 'A1', address: '찾을 수 없는 주소', location: null }];

    const successCount = await backfillMissingCoordsByAddress(rows);

    expect(successCount).toBe(0);
    expect(rows[0].location).toBeNull();
  });
});
