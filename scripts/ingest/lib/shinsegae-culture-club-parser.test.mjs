import { describe, expect, it } from 'vitest';
import {
  getLectureListTotalCount,
  normalizeShinsegaeStatus,
  parseFee,
  parseLecture,
  parseLectureListResponse,
  parsePeriod,
  parseTimeRange,
  SHINSEGAE_TARGET_LABELS,
} from './shinsegae-culture-club-parser.mjs';

// [수강대상 라벨 — getCommCode.do(headCode=0025)로 확정](2026-10-08
// 사용자 제보로 발견한 공용 코드 조회 엔드포인트 실측).
describe('SHINSEGAE_TARGET_LABELS', () => {
  it('B1=위드맘(대디)/B2=키즈/C1=패밀리로 확정된 라벨을 갖는다', () => {
    expect(SHINSEGAE_TARGET_LABELS).toEqual({ B1: '위드맘(대디)', B2: '키즈', C1: '패밀리' });
  });
});

describe('parsePeriod', () => {
  it('시작~종료가 같은 단발성 기간을 파싱한다', () => {
    expect(parsePeriod('2026.11.28~2026.11.28')).toEqual({ startDate: '2026-11-28', endDate: '2026-11-28' });
  });

  it('시작~종료가 다른 범위 기간을 파싱한다(접수 기간 등)', () => {
    expect(parsePeriod('2026.07.22~2026.11.27')).toEqual({ startDate: '2026-07-22', endDate: '2026-11-27' });
  });

  it('빈 값이면 둘 다 null', () => {
    expect(parsePeriod(null)).toEqual({ startDate: null, endDate: null });
    expect(parsePeriod('')).toEqual({ startDate: null, endDate: null });
  });
});

describe('parseTimeRange', () => {
  it('"HH:MM~HH:MM"을 HHmm 포맷으로 바꾼다(다른 브랜드와 동일 포맷)', () => {
    expect(parseTimeRange('11:00~11:40')).toEqual({ startTime: '1100', endTime: '1140' });
  });

  it('빈 값이면 둘 다 null', () => {
    expect(parseTimeRange(null)).toEqual({ startTime: null, endTime: null });
  });
});

describe('parseFee', () => {
  it('숫자 문자열을 숫자로 변환한다', () => {
    expect(parseFee('5000')).toBe(5000);
  });

  it('빈 값/숫자 아님이면 null', () => {
    expect(parseFee(null)).toBeNull();
    expect(parseFee('')).toBeNull();
  });
});

describe('normalizeShinsegaeStatus — 실측 확인된 라벨(HP0010P0.do 라디오 버튼)', () => {
  it('RT(접수중)는 OPEN', () => {
    expect(normalizeShinsegaeStatus('RT')).toBe('OPEN');
  });
  it('ST(대기등록)는 WAITING', () => {
    expect(normalizeShinsegaeStatus('ST')).toBe('WAITING');
  });
  it('RC(접수마감)는 CLOSED', () => {
    expect(normalizeShinsegaeStatus('RC')).toBe('CLOSED');
  });
  it('PR(접수전 — 아직 신청 불가)도 안전하게 CLOSED로 취급한다', () => {
    expect(normalizeShinsegaeStatus('PR')).toBe('CLOSED');
  });
});

// 실측 샘플(2026-10-08, storeCode=03 + targetCode=C1 실제 응답 1건, 사용자
// 캡처 reference/sinsegae.png와 동일한 조합으로 재현 확인).
const REAL_SAMPLE_ROW = {
  lectAmtCurr: '5,000',
  smstCodeName: '가을',
  tchName: '극단 이레',
  lectMoveYn: 'Y',
  minRecvCnt: '2',
  smstCode: 'S3',
  lectPeriod: '2026.11.28~2026.11.28',
  lectPeriodCode: '1',
  lectFreeTgtYn: 'Y',
  evlScore: '0',
  lectStat: 'RT',
  waitLectCnt: '3',
  dayCode: '7',
  tlectTargetMemCode: '01',
  storeName: '타임스퀘어 & ON',
  onlineClassYn: 'N',
  recomd: '0',
  lectCnt: '1',
  inetLectPeriod: '2026.07.22~2026.11.27',
  yearCode: '2026',
  lectHm: '11:00~11:40',
  waitMemCnt: '5',
  lectName: '[11/28]어린이 뮤지컬, 방귀공주와 다니엘(22년생이상, 성인)',
  tlectTargetMemCodeName: '대중',
  lectAmt: '5000',
  dayCodeName: '토',
  seq: '1',
  lectOnlyYn: 'Y',
  storeCode: '03',
  lectCode: 'T2694782',
};

describe('parseLecture — 실측 샘플(storeCode=03 + targetCode=C1)', () => {
  it('실제 응답 1건을 정확히 파싱한다', () => {
    expect(parseLecture(REAL_SAMPLE_ROW, 'C1')).toEqual({
      class_id: 'T2694782',
      class_title: '[11/28]어린이 뮤지컬, 방귀공주와 다니엘(22년생이상, 성인)',
      store_code: '03',
      store_name: '타임스퀘어 & ON',
      class_day: ['토'],
      schedule_days_code: ['SAT'],
      start_time: '1100',
      end_time: '1140',
      class_fee: 5000,
      instructor_name: '극단 이레',
      min_age_months: expect.any(Number),
      max_age_months: null,
      schedule_start_date: '2026-11-28',
      schedule_end_date: '2026-11-28',
      total_sessions: 1,
      raw_status: 'RT',
      normalized_status: 'OPEN',
      target_code: 'C1',
      target_name: '패밀리',
      semester_code: 'S3',
      year_code: '2026',
      register_start_date: '2026-07-22',
      register_end_date: '2026-11-27',
    });
  });

  it('lectCode/lectName이 없으면 null을 반환한다', () => {
    expect(parseLecture({ ...REAL_SAMPLE_ROW, lectCode: '' }, 'C1')).toBeNull();
    expect(parseLecture({ ...REAL_SAMPLE_ROW, lectName: '' }, 'C1')).toBeNull();
  });
});

describe('parseLectureListResponse / getLectureListTotalCount', () => {
  it('lectList 배열을 파싱하고 totalCount를 함께 읽는다', () => {
    const json = { param: { totalCount: '2' }, lectList: [REAL_SAMPLE_ROW, { ...REAL_SAMPLE_ROW, lectCode: 'T2' }] };
    expect(parseLectureListResponse(json, 'C1')).toHaveLength(2);
    expect(getLectureListTotalCount(json)).toBe(2);
  });

  it('lectList가 없으면 빈 배열, totalCount가 숫자가 아니면 0', () => {
    expect(parseLectureListResponse({}, 'C1')).toEqual([]);
    expect(getLectureListTotalCount({})).toBe(0);
  });
});
