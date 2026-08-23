// Task 8-4 정밀 검증에서 seoul-yeyak-adapter.mjs에 기존 테스트가 없었음을 확인해 신설.
// - tvYeyakCOllect 페이지네이션/에러 처리
// - DIV → UI 카테고리 매핑, PAYATNM 기준 is_free, SVCSTATNM 기준 is_active
// - deriveParentalTags 연동(is_kids_friendly/has_parking/stroller_accessible/facility_type/target_age_group) —
//   Task 8-4에서 이 필드들이 전혀 채워지지 않고 있었음을 발견해 새로 연결한 부분
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { SeoulYeyakAdapter, buildSigunguName } = await import('./seoul-yeyak-adapter.mjs');

function jsonResponse(body) {
  return { ok: true, text: async () => JSON.stringify(body) };
}

function tvYeyakBody({ code = 'INFO-000', message = '정상 처리되었습니다', rows = [], totalCount = rows.length } = {}) {
  return {
    tvYeyakCOllect: { list_total_count: totalCount, RESULT: { CODE: code, MESSAGE: message }, row: rows },
  };
}

// 실측 표본(서울역사박물관 백인제가옥 온라인교육): USETGTINFO에 "가족" 키워드 포함.
const BASE_ITEM = {
  GUBUN: '자체',
  SVCID: 'S260722093915914461',
  MAXCLASSNM: '문화체험',
  MINCLASSNM: '교육체험',
  SVCSTATNM: '접수중',
  SVCNM: "[백인제가옥] 2026년 온라인교육 '백인제가옥의 숨겨진 비밀을 찾아라!'(8월)",
  PAYATNM: '무료',
  PLACENM: '서울역사박물관',
  USETGTINFO: ' 가족(학부모 1인, 자녀 1인)',
  SVCURL: 'https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=S260722093915914461',
  X: '126.97037430869801',
  Y: '37.570500279648634',
  SVCOPNBGNDT: '2026-08-08 00:00:00.0',
  SVCOPNENDDT: '2026-08-22 00:00:00.0',
  RCPTBGNDT: '2026-07-22 10:00:00.0',
  RCPTENDDT: '2026-07-31 18:00:00.0',
  AREANM: '종로구',
  IMGURL: 'https://yeyak.seoul.go.kr/web/common/file/FileDown.do?file_id=1',
  DTLCONT: '실내 교육 프로그램입니다. 주차장 있음. 유모차 접근 가능.',
  DIV: '문화행사',
};

describe('SeoulYeyakAdapter', () => {
  beforeEach(() => {
    process.env.SEOUL_OPEN_DATA_KEY = 'test-seoul-key';
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('SEOUL_OPEN_DATA_KEY가 없으면 에러를 던진다', () => {
      delete process.env.SEOUL_OPEN_DATA_KEY;
      expect(() => new SeoulYeyakAdapter()).toThrow('SEOUL_OPEN_DATA_KEY');
    });
  });

  describe('fetch (페이지네이션)', () => {
    it('list_total_count에 도달할 때까지 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        const startIdx = Number(url.split('/').at(-3));
        if (startIdx === 1) return Promise.resolve(jsonResponse(tvYeyakBody({ rows: [BASE_ITEM], totalCount: 101 })));
        if (startIdx === 101) return Promise.resolve(jsonResponse(tvYeyakBody({ rows: [{ ...BASE_ITEM, SVCID: 'S2' }], totalCount: 101 })));
        throw new Error(`unexpected startIdx ${startIdx}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const adapter = new SeoulYeyakAdapter();
      const items = await adapter.fetch();
      expect(items).toHaveLength(2);
    });

    it('RESULT.CODE가 INFO-000이 아니면 에러를 던진다', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(jsonResponse(tvYeyakBody({ code: 'ERROR-500', message: '서버 오류' })))));
      const adapter = new SeoulYeyakAdapter();
      await expect(adapter.fetch()).rejects.toThrow('tvYeyakCOllect 오류');
    });
  });

  describe('transform', () => {
    it('정상 항목을 events 표준 스키마 행으로 변환한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const rows = adapter.transform([BASE_ITEM]);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        external_id: 'SEOUL_YEYAK_S260722093915914461',
        title: BASE_ITEM.SVCNM,
        event_type: 'PERFORMANCE_FESTIVAL',
        is_reservation_required: true,
        is_free: true,
        is_active: true,
        venue_name: '서울역사박물관', // Task 9-1-1: PLACENM 매핑
      });
      expect(rows[0].reservation_url).toContain('rsv_svc_id=S260722093915914461');
    });

    // Task 9-6-7(2026-08-23) 버그 수정: AREANM이 실제 서울 자치구일 때만 "서울시 " 접두를 붙여야
    // 한다. 이전에는 무조건 접두를 붙여 "서울시 과천시"처럼 존재하지 않는 행정구역이 만들어졌다
    // (실측 확인: 서울대공원/서울동물원처럼 서울시가 운영하지만 실제로는 경기도 과천시에 있는
    // 시설, "상주서울농장"처럼 경상북도에 있는 시설도 이 API가 함께 내려줌).
    it('AREANM이 실제 서울 자치구면 "서울시 " 접두를 붙인다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transform([{ ...BASE_ITEM, AREANM: '종로구' }]);
      expect(row.sigungu_name).toBe('서울시 종로구');
    });

    it('AREANM이 서울 자치구가 아니면(예: 과천시) 접두를 붙이지 않고 그대로 쓴다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transform([
        { ...BASE_ITEM, SVCID: 'S-gwacheon', SVCNM: '서울대공원 테마가든', AREANM: '과천시' },
      ]);
      expect(row.sigungu_name).toBe('과천시');
    });

    it('DIV별로 UI 카테고리를 매핑한다(시설대관/진료는 ETC)', () => {
      const adapter = new SeoulYeyakAdapter();
      const [sports] = adapter.transform([{ ...BASE_ITEM, DIV: '체육시설' }]);
      const [edu] = adapter.transform([{ ...BASE_ITEM, DIV: '교육' }]);
      const [rental] = adapter.transform([{ ...BASE_ITEM, DIV: '시설대관' }]);
      const [medical] = adapter.transform([{ ...BASE_ITEM, DIV: '진료' }]);

      expect(sports.event_type).toBe('KIDS_ACTIVITY');
      expect(edu.event_type).toBe('EXPERIENCE_CLASS');
      expect(rental.event_type).toBe('ETC');
      expect(medical.event_type).toBe('ETC');
    });

    it('PAYATNM이 무료가 아니면 is_free를 false로 판별한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transform([{ ...BASE_ITEM, PAYATNM: '유료' }]);
      expect(row.is_free).toBe(false);
    });

    it('SVCSTATNM에 종료/마감이 포함되면 is_active를 false로 판별한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [ended] = adapter.transform([{ ...BASE_ITEM, SVCSTATNM: '접수종료' }]);
      const [closed] = adapter.transform([{ ...BASE_ITEM, SVCSTATNM: '모집마감' }]);
      expect(ended.is_active).toBe(false);
      expect(closed.is_active).toBe(false);
    });

    it('경도/위도/필수 필드 중 하나라도 없으면 해당 항목을 건너뛴다', () => {
      const adapter = new SeoulYeyakAdapter();
      const rows = adapter.transform([
        { ...BASE_ITEM, X: '', Y: '' },
        { ...BASE_ITEM, SVCID: '' },
        { ...BASE_ITEM, SVCNM: '' },
      ]);
      expect(rows).toEqual([null, null, null]);
    });

    describe('deriveParentalTags 연동 (Task 8-4에서 신규 연결)', () => {
      it('USETGTINFO/DTLCONT의 실제 텍스트를 근거로 is_kids_friendly/has_parking/stroller_accessible을 판별한다', () => {
        const adapter = new SeoulYeyakAdapter();
        const [row] = adapter.transform([BASE_ITEM]);

        expect(row.is_kids_friendly).toBe(true); // USETGTINFO: "가족(학부모 1인, 자녀 1인)"
        expect(row.has_parking).toBe(true); // DTLCONT: "주차장 있음"
        expect(row.stroller_accessible).toBe(true); // DTLCONT: "유모차 접근 가능"
      });

      it('실내/실외 키워드가 DTLCONT에 있으면 facility_type을 매핑한다', () => {
        const adapter = new SeoulYeyakAdapter();
        const [row] = adapter.transform([BASE_ITEM]);
        expect(row.facility_type).toBe('실내'); // DTLCONT: "실내 교육 프로그램입니다"
      });

      it('키워드 근거가 전혀 없으면 기본값(false/복합)을 유지한다', () => {
        const adapter = new SeoulYeyakAdapter();
        const [row] = adapter.transform([
          { ...BASE_ITEM, USETGTINFO: '성인', DTLCONT: '유의사항을 확인하세요.', PLACENM: '테스트장소' },
        ]);
        expect(row.is_kids_friendly).toBe(false);
        expect(row.has_parking).toBe(false);
        expect(row.stroller_accessible).toBe(false);
        expect(row.facility_type).toBe('복합');
      });
    });
  });
});

describe('buildSigunguName', () => {
  it('서울 25개 자치구 중 하나면 "서울시 " 접두를 붙인다', () => {
    expect(buildSigunguName('강남구')).toBe('서울시 강남구');
    expect(buildSigunguName('종로구')).toBe('서울시 종로구');
  });

  it('서울 자치구가 아니면(다른 시/도 소속 시/군) 원본 그대로 반환한다(상위 시/도를 추측하지 않음)', () => {
    expect(buildSigunguName('과천시')).toBe('과천시');
    expect(buildSigunguName('상주시')).toBe('상주시');
    expect(buildSigunguName('남양주시')).toBe('남양주시');
  });

  it('AREANM이 없으면 null을 반환한다', () => {
    expect(buildSigunguName(null)).toBeNull();
    expect(buildSigunguName('')).toBeNull();
  });
});
