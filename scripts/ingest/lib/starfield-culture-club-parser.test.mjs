import { describe, expect, it } from 'vitest';
import {
  STARFIELD_TARGET_LABELS,
  getLectureListTotalCount,
  normalizeStarfieldStatus,
  parseDotDate,
  parseHHMM,
  parseLecture,
  parseLectureListResponse,
  parseRegisterAt,
} from './starfield-culture-club-parser.mjs';

describe('STARFIELD_TARGET_LABELS', () => {
  it('2=어린이/3=영유아로 확정된 라벨을 갖는다(1=성인/4=펫은 수집 범위 밖)', () => {
    expect(STARFIELD_TARGET_LABELS[2]).toBe('어린이');
    expect(STARFIELD_TARGET_LABELS[3]).toBe('영유아');
  });
});

describe('parseHHMM', () => {
  it('"HH:MM"을 HHmm 포맷으로 바꾼다', () => {
    expect(parseHHMM('11:30')).toBe('1130');
  });
  it('빈 값이면 null', () => {
    expect(parseHHMM(null)).toBeNull();
  });
});

describe('parseDotDate', () => {
  it('"YYYY.MM.DD"를 "YYYY-MM-DD"로 바꾼다', () => {
    expect(parseDotDate('2026.10.09')).toBe('2026-10-09');
  });
  it('형식이 다르면 null', () => {
    expect(parseDotDate('2026-10-09')).toBeNull();
    expect(parseDotDate(null)).toBeNull();
  });
});

describe('parseRegisterAt', () => {
  it('"YYYY-MM-DD HH:mm:ss"를 +09:00 ISO 타임스탬프로 바꾼다(emart와 동일한 KST 고정 오프셋 관례)', () => {
    expect(parseRegisterAt('2026-09-10 00:00:00')).toBe('2026-09-10T00:00:00+09:00');
  });
  it('형식이 다르면 null', () => {
    expect(parseRegisterAt('2026.09.10')).toBeNull();
    expect(parseRegisterAt(null)).toBeNull();
  });
});

describe('normalizeStarfieldStatus — 실측 확인된 뱃지 렌더링 if/else 분기', () => {
  it('I(접수중)는 OPEN', () => {
    expect(normalizeStarfieldStatus('I')).toBe('OPEN');
  });
  it('AA(추가접수중)도 OPEN', () => {
    expect(normalizeStarfieldStatus('AA')).toBe('OPEN');
  });
  it('P(매진임박)도 아직 신청 가능하므로 OPEN', () => {
    expect(normalizeStarfieldStatus('P')).toBe('OPEN');
  });
  it('WD(대기불가)는 CLOSED', () => {
    expect(normalizeStarfieldStatus('WD')).toBe('CLOSED');
  });
  it('매핑에 없는 값(실측된 예: S)은 else 분기와 동일하게 WAITING(대기가능)으로 취급한다', () => {
    expect(normalizeStarfieldStatus('S')).toBe('WAITING');
  });
});

// 실측 샘플(2026-10-09, storeCd=02/lctrTrgCtgryCd=3 실제 응답 1건).
const REAL_SAMPLE_ROW = {
  lctrNo: 'L260910153',
  storeCd: '01',
  storeNm: '고양점',
  pfmcoNo: 'P0002',
  pfmcoNm: '트니트니',
  lctrNm: '[10월9일/원데이]트니트니 (25~35개월)',
  lctrBeginDt: '2026.10.09',
  lctrTrmntDt: '2026.10.09',
  lctrBeginHrmnt: '11:30',
  lctrTrmntHrmnt: '12:10',
  indcnDywkNm: '금',
  totalTmcnt: '1',
  dcBfrSmtnAmt: '30000',
  dcAfterSmtnAmt: '30000',
  thumbnailImgPath: 'https://image.classkok.com/lect/20260910/1e5ce92f-9829-4616-942e-a59ba6b0e437.jpg',
  acptStCd: 'P',
  acptBeginDtm: '2026-09-10 00:00:00',
  acptTrmntDtm: '2026-10-09 11:29:59',
  fdtrYn: 'N',
  lctrType: '1회',
  lctrTotCnt: 85,
};

describe('parseLecture — 실측 샘플(storeCd=01, lctrTrgCtgryCd=3 호출 컨텍스트)', () => {
  it('실제 응답 1건을 정확히 파싱한다', () => {
    expect(parseLecture(REAL_SAMPLE_ROW, '3')).toEqual({
      class_id: 'L260910153',
      class_title: '[10월9일/원데이]트니트니 (25~35개월)',
      store_code: '01',
      store_name: '고양점',
      class_day: ['금'],
      schedule_days_code: ['FRI'],
      start_time: '1130',
      end_time: '1210',
      class_fee: 30000,
      class_original_fee: 30000,
      min_age_months: 25,
      max_age_months: 35,
      schedule_start_date: '2026-10-09',
      schedule_end_date: '2026-10-09',
      total_sessions: 1,
      raw_status: 'P',
      normalized_status: 'OPEN',
      register_start_at: '2026-09-10T00:00:00+09:00',
      target_code: '3',
      target_name: '영유아',
      pfmco_nm: '트니트니',
      fdtr_yn: 'N',
      lctr_type: '1회',
      register_end_at: '2026-10-09T11:29:59+09:00',
      main_image_url: 'https://image.classkok.com/lect/20260910/1e5ce92f-9829-4616-942e-a59ba6b0e437.jpg',
    });
  });

  it('lctrNo/lctrNm이 없으면 null을 반환한다', () => {
    expect(parseLecture({ ...REAL_SAMPLE_ROW, lctrNo: '' }, '3')).toBeNull();
    expect(parseLecture({ ...REAL_SAMPLE_ROW, lctrNm: '' }, '3')).toBeNull();
  });
});

describe('parseLectureListResponse / getLectureListTotalCount', () => {
  it('list 배열을 파싱하고 각 행의 lctrTotCnt(중복 저장됨)에서 총건수를 읽는다', () => {
    const json = { list: [REAL_SAMPLE_ROW, { ...REAL_SAMPLE_ROW, lctrNo: 'L2' }] };
    expect(parseLectureListResponse(json, '3')).toHaveLength(2);
    expect(getLectureListTotalCount(json)).toBe(85);
  });

  it('list가 없으면 빈 배열, lctrTotCnt를 못 읽으면 0', () => {
    expect(parseLectureListResponse({})).toEqual([]);
    expect(getLectureListTotalCount({})).toBe(0);
  });
});
