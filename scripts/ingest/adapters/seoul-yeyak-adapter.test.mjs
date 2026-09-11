// Decision 017(2026-08-25) 전면 재작성: 기존에는 DIV 필드 기준으로 events 테이블에만 단일
// 적재했으나, MAXCLASSNM(대분류) 기준으로 체육시설/공간시설 → open_spaces, 문화체험/
// 교육강좌 → events로 분리 적재했었다(진료복지 제외).
// [Decision 024(2026-09-11) 개정]: 사용자가 "체육시설 대관/축구장/농구장 등 시설 대관
// 예약관련 데이터가 open_spaces에 보이는데 events로 이관해달라"고 명시적으로 재지시해,
// 체육시설/공간시설도 이제 events로 분류한다 — 결과적으로 진료복지(수집 제외) 외 전
// MAXCLASSNM이 events로 단일화됐다. Null-safe 원본 적재/항목 단위 무중단 처리/에러
// 원인별 집계를 검증한다.
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
// MAXCLASSNM/MINCLASSNM은 Decision 017이 실제 분류 기준으로 지정한 대분류/중분류 필드.
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

    it("targetTable이 'multi'로 설정된다(open_spaces/events 분리 적재)", () => {
      const adapter = new SeoulYeyakAdapter();
      expect(adapter.targetTable).toBe('multi');
    });
  });

  describe('fetch (페이지네이션, Decision 017 6항: 1000건 단위)', () => {
    it('list_total_count에 도달할 때까지 1000건 단위로 반복 호출한다', async () => {
      const fetchMock = vi.fn((url) => {
        const startIdx = Number(url.split('/').at(-3));
        if (startIdx === 1) return Promise.resolve(jsonResponse(tvYeyakBody({ rows: [BASE_ITEM], totalCount: 1001 })));
        if (startIdx === 1001) return Promise.resolve(jsonResponse(tvYeyakBody({ rows: [{ ...BASE_ITEM, SVCID: 'S2' }], totalCount: 1001 })));
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

  describe('getRawRows (RAW 레이어 opt-in)', () => {
    it('SVCID를 source_id로, 원본 항목 전체를 payload로 하는 쌍을 만든다', () => {
      const adapter = new SeoulYeyakAdapter();
      const rawRows = adapter.getRawRows([BASE_ITEM]);
      expect(rawRows).toEqual([{ sourceId: BASE_ITEM.SVCID, payload: BASE_ITEM }]);
    });

    it('transformSplit이 drop하는 항목(좌표 누락 등)도 SVCID만 있으면 무오염 보존한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const noGeoItem = { ...BASE_ITEM, X: '', Y: '' };
      const rawRows = adapter.getRawRows([noGeoItem]);
      expect(rawRows).toEqual([{ sourceId: BASE_ITEM.SVCID, payload: noGeoItem }]);
    });

    it('SVCID가 없는 항목은 제외한다(복합키 구성 불가)', () => {
      const adapter = new SeoulYeyakAdapter();
      expect(adapter.getRawRows([{ ...BASE_ITEM, SVCID: '' }])).toEqual([]);
    });

    it("Decision 017 1항: MAXCLASSNM이 '진료복지'인 항목은 RAW 레이어에도 남기지 않는다(수집 범위 제외)", () => {
      const adapter = new SeoulYeyakAdapter();
      expect(adapter.getRawRows([{ ...BASE_ITEM, MAXCLASSNM: '진료복지' }])).toEqual([]);
    });
  });

  describe('transformSplit — 테이블 분리 (Decision 017 1항/4항)', () => {
    it('MAXCLASSNM이 문화체험/교육강좌면 events로 분류한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([
        { ...BASE_ITEM, SVCID: 'S1', MAXCLASSNM: '문화체험' },
        { ...BASE_ITEM, SVCID: 'S2', MAXCLASSNM: '교육강좌' },
      ]);
      expect(result.events).toHaveLength(2);
      expect(result.open_spaces).toHaveLength(0);
      expect(result.events.map((r) => r.external_id)).toEqual(['SEOUL_YEYAK_S1', 'SEOUL_YEYAK_S2']);
    });

    // [Decision 024(2026-09-11, 사용자 명시적 재확인)] 개선사항9: "체육시설 대관/축구장/
    // 농구장 등 시설 대관 예약관련 데이터가 open_spaces에 보이는데 events로 이관해달라"
    // — Decision 017 2항을 개정해 체육시설/공간시설도 이제 events로 분류한다.
    it('MAXCLASSNM이 체육시설/공간시설이면 이제 events로 분류한다(Decision 024)', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([
        { ...BASE_ITEM, SVCID: 'S1', MAXCLASSNM: '체육시설' },
        { ...BASE_ITEM, SVCID: 'S2', MAXCLASSNM: '공간시설' },
      ]);
      expect(result.events).toHaveLength(2);
      expect(result.open_spaces).toHaveLength(0);
    });

    it("MAXCLASSNM이 '진료복지'면 어느 테이블에도 넣지 않고 excludedCount로만 집계한다", () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '진료복지' }]);
      expect(result.open_spaces).toHaveLength(0);
      expect(result.events).toHaveLength(0);
      expect(result.excludedCount).toBe(1);
      expect(result.errorCounts).toEqual({});
    });

    it('알 수 없는 MAXCLASSNM은 UNKNOWN_MAXCLASSNM 에러로 집계하고 skip한다(무중단)', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([
        { ...BASE_ITEM, SVCID: 'S1', MAXCLASSNM: '알수없는분류' },
        { ...BASE_ITEM, SVCID: 'S2', MAXCLASSNM: '문화체험' },
      ]);
      expect(result.errorCounts.UNKNOWN_MAXCLASSNM).toBe(1);
      expect(result.events).toHaveLength(1); // 뒤 항목은 정상 처리(무중단)
    });

    // [Decision 024] 체육시설/공간시설이 events로 옮겨간 뒤에도, "체험·클래스"
    // (EXPERIENCE_CLASS, 문화체험/교육강좌 전용 라벨)를 억지로 붙이지 않고 예전
    // open_spaces 시절과 동일하게 ETC로 남긴다 — category_min(MINCLASSNM 원본, 예:
    // "테니스장")이 이미 정확한 화면 배지이므로 event_type 오매핑 영향은 없다.
    it('체육시설/공간시설은 events로 가도 event_type을 억지로 채우지 않고 ETC로 남긴다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [gym] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '체육시설' }]).events;
      const [space] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '공간시설' }]).events;
      expect(gym.event_type).toBe('ETC');
      expect(space.event_type).toBe('ETC');
    });

    it('events(문화체험/교육강좌)는 EXPERIENCE_CLASS로 매핑한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '문화체험' }]).events;
      expect(row.event_type).toBe('EXPERIENCE_CLASS');
    });

    it('source 컬럼에 seoul_public_reservation을 담는다(전 분류 공통)', () => {
      const adapter = new SeoulYeyakAdapter();
      const [cultureRow] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '문화체험' }]).events;
      const [gymRow] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '체육시설' }]).events;
      expect(cultureRow.source).toBe('seoul_public_reservation');
      expect(gymRow.source).toBe('seoul_public_reservation');
    });

    it('원본 메타필드(MAXCLASSNM/MINCLASSNM 등)를 raw_data에 그대로 보존한다(전 분류 공통)', () => {
      const adapter = new SeoulYeyakAdapter();
      const item = { ...BASE_ITEM, MAXCLASSNM: '체육시설' };
      const [row] = adapter.transformSplit([item]).events;
      expect(row.raw_data).toEqual(item);
    });

    // [가격 정보 파싱 고도화](2026-09-11 사용자 지시, todo.md 개선사항7-1): 이 소스는
    // 구조화된 가격 필드가 없어(PAYATNM은 유료/무료뿐) DTLCONT(상세 안내문)에서
    // 라벨+금액 패턴을 찾는다.
    it('DTLCONT에 라벨+금액이 있으면 events.price_text로 추출한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const item = { ...BASE_ITEM, MAXCLASSNM: '문화체험', DTLCONT: '이용료: 15,000원 (성인 기준)' };
      const [row] = adapter.transformSplit([item]).events;
      expect(row.price_text).toBe('이용료 15,000원');
    });

    it('DTLCONT에 금액 정보가 없으면 events.price_text는 null이다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '문화체험' }]).events;
      expect(row.price_text).toBeNull();
    });
  });

  describe('transformSplit — Null-safe 원본 적재 (Decision 017 4항: 드롭 금지)', () => {
    it('좌표가 없어도 드롭하지 않고 location_precision=UNKNOWN으로 적재한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '체육시설', X: '', Y: '' }]).events;
      expect(row).toBeTruthy();
      expect(row.location).toBeNull();
      expect(row.location_precision).toBe('UNKNOWN');
    });

    it('좌표 필드가 있는데 숫자로 파싱되지 않으면 COORDINATE_PARSE_FAIL로 집계하되 여전히 드롭하지 않는다', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '체육시설', X: '잘못된값', Y: '잘못된값' }]);
      expect(result.errorCounts.COORDINATE_PARSE_FAIL).toBe(1);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].location_precision).toBe('UNKNOWN');
    });

    it('요금 정보(PAYATNM)가 없어도 드롭하지 않고 is_free만 false로 남는다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '문화체험', PAYATNM: '' }]).events;
      expect(row).toBeTruthy();
      expect(row.is_free).toBe(false);
    });
  });

  describe('transformSplit — 무중단 예외 처리 및 에러 분류 (Decision 017 7항/8항)', () => {
    it('SVCID가 없는 항목은 MISSING_SVCID로 집계하고 skip하되 나머지는 계속 처리한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([
        { ...BASE_ITEM, SVCID: '', MAXCLASSNM: '문화체험' },
        { ...BASE_ITEM, SVCID: 'S2', MAXCLASSNM: '문화체험' },
      ]);
      expect(result.errorCounts.MISSING_SVCID).toBe(1);
      expect(result.events).toHaveLength(1);
    });

    it('SVCNM(제목/이름)이 없는 항목은 MISSING_NAME으로 집계하고 skip한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([{ ...BASE_ITEM, SVCNM: '', MAXCLASSNM: '체육시설' }]);
      expect(result.errorCounts.MISSING_NAME).toBe(1);
      expect(result.events).toHaveLength(0);
      expect(result.open_spaces).toHaveLength(0);
    });

    it('events는 시작/종료일이 없으면 DATE_PARSE_FAIL로 집계하고 skip한다(events.start_date/end_date DB NOT NULL)', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([
        { ...BASE_ITEM, MAXCLASSNM: '문화체험', SVCOPNBGNDT: '', SVCOPNENDDT: '' },
      ]);
      expect(result.errorCounts.DATE_PARSE_FAIL).toBe(1);
      expect(result.events).toHaveLength(0);
    });

    it('한 항목 처리 중 예상치 못한 예외가 나도 전체가 중단되지 않고 UNEXPECTED_ERROR로 집계 후 계속한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const result = adapter.transformSplit([
        null, // 접근 시 예외를 유발하는 방어적 케이스
        { ...BASE_ITEM, SVCID: 'S2', MAXCLASSNM: '문화체험' },
      ]);
      expect(result.errorCounts.UNEXPECTED_ERROR).toBe(1);
      expect(result.events).toHaveLength(1); // 무중단 확인
    });
  });

  describe('deriveParentalTags/deriveSpaceKidsFriendly 연동 (Decision 017 9항: 키즈 뱃지 오매핑 정화)', () => {
    it('events(문화체험/교육강좌)는 기존과 동일하게 원본 전체 텍스트 기반 태깅을 유지한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '문화체험' }]).events;
      expect(row.is_kids_friendly).toBe(true); // USETGTINFO: "가족(학부모 1인, 자녀 1인)"
      expect(row.has_parking).toBe(true); // DTLCONT: "주차장 있음"
      expect(row.facility_type).toBe('실내'); // DTLCONT: "실내 교육 프로그램입니다"
    });

    // [Decision 024] 체육시설/공간시설이 이제 events 배열에 담기지만, Decision 017 9항이
    // 정한 "좁은 판별(USETGTINFO/MINCLASSNM만)"은 그대로 유지된다(오매핑 재발 방지 확인).
    it('체육/공간시설은 events로 가도 USETGTINFO에 키즈 신호가 없으면 키즈 뱃지를 부여하지 않는다(오매핑 정화 확인)', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter
        .transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '체육시설', USETGTINFO: '성인', MINCLASSNM: '체육관' }])
        .events;
      expect(row.is_kids_friendly).toBe(false);
    });

    it('체육/공간시설은 USETGTINFO에 가족/어린이 등이 명시되면 키즈 뱃지를 부여한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter.transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '체육시설' }]).events; // USETGTINFO: "가족..."
      expect(row.is_kids_friendly).toBe(true);
    });

    it('체육/공간시설은 MINCLASSNM이 키즈/체험 전용 시설이면 USETGTINFO와 무관하게 키즈 뱃지를 부여한다', () => {
      const adapter = new SeoulYeyakAdapter();
      const [row] = adapter
        .transformSplit([{ ...BASE_ITEM, MAXCLASSNM: '공간시설', USETGTINFO: '성인', MINCLASSNM: '서울형키즈카페' }])
        .events;
      expect(row.is_kids_friendly).toBe(true);
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
