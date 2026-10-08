import { describe, expect, it } from 'vitest';
import {
  AKPLAZA_MAIN_LABELS,
  buildThumbnailUrl,
  getLectureListTotalCount,
  normalizeAkplazaStatus,
  parseLecture,
  parseLectureListResponse,
  parseTimeRange,
  yyyymmddToDash,
} from './akplaza-culture-club-parser.mjs';

// [수강대상 라벨 — getMain 엔드포인트가 직접 내려줌](2026-10-09 실측 확인:
// POST culture.akplaza.com/getMain → {"mainlist":[{SUB_CODE:"2",
// LONG_NAME:"엄마랑 아가랑", SHORT_NAME:"Baby"}, ...]}).
describe('AKPLAZA_MAIN_LABELS', () => {
  it('2=엄마랑 아가랑/3=유아,어린이/4=가족 이벤트로 확정된 라벨을 갖는다', () => {
    expect(AKPLAZA_MAIN_LABELS[2]).toBe('엄마랑 아가랑');
    expect(AKPLAZA_MAIN_LABELS[3]).toBe('유아, 어린이');
    expect(AKPLAZA_MAIN_LABELS[4]).toBe('가족 이벤트');
  });
});

describe('parseTimeRange', () => {
  it('"HH:MM~HH:MM"을 HHmm 포맷으로 바꾼다', () => {
    expect(parseTimeRange('14:50~16:10')).toEqual({ startTime: '1450', endTime: '1610' });
  });

  it('빈 값이면 둘 다 null', () => {
    expect(parseTimeRange(null)).toEqual({ startTime: null, endTime: null });
  });
});

describe('yyyymmddToDash', () => {
  it('YYYYMMDD를 YYYY-MM-DD로 바꾼다', () => {
    expect(yyyymmddToDash('20261017')).toBe('2026-10-17');
  });

  it('8자리 숫자가 아니면 null', () => {
    expect(yyyymmddToDash(null)).toBeNull();
    expect(yyyymmddToDash('2026')).toBeNull();
  });
});

describe('normalizeAkplazaStatus — 실측 확인된 STATUS_TXT 3종', () => {
  it('접수가능은 OPEN', () => {
    expect(normalizeAkplazaStatus('접수가능')).toBe('OPEN');
  });
  it('마감임박도 아직 접수 가능하므로 OPEN', () => {
    expect(normalizeAkplazaStatus('마감임박')).toBe('OPEN');
  });
  it('마감은 CLOSED', () => {
    expect(normalizeAkplazaStatus('마감')).toBe('CLOSED');
  });
  it('매핑에 없는 값은 안전하게 CLOSED로 취급한다', () => {
    expect(normalizeAkplazaStatus('알수없음')).toBe('CLOSED');
  });
});

describe('buildThumbnailUrl', () => {
  it('image_dir과 THUMBNAIL_IMG를 /wlect/ 경로로 조합한다(실측 확인된 경로)', () => {
    expect(buildThumbnailUrl('http://img-culture.akplaza.com/upload', '20261006916315851.jpg')).toBe(
      'http://img-culture.akplaza.com/upload/wlect/20261006916315851.jpg'
    );
  });

  it('둘 중 하나라도 없으면 null', () => {
    expect(buildThumbnailUrl(null, 'a.jpg')).toBeNull();
    expect(buildThumbnailUrl('http://img-culture.akplaza.com/upload', null)).toBeNull();
  });
});

// 실측 샘플(2026-10-09, store=02 getPeltList_New 실제 응답 1건).
const REAL_SAMPLE_ROW = {
  SECT_NM: '키즈 플레이&에듀',
  RECO_CNT: 0,
  CLASSROOM: ' / 층-호',
  REGIS_FEE: 70000,
  LECTURER_NM: '박영미',
  SUBJECT_FG_NM: '단기',
  SECT_CD: '02',
  STATUS_TXT: '접수가능',
  FOOD_YN: 'R',
  SUBJECT_NM: '(중도) [10/17개강] 주산식 암산 점프셈 수학교실 (7세-초등, 중급)',
  SUBJECT_CD: '835467',
  LECT_HOUR: '09:50~10:30',
  FOOD_AMT: 0,
  MAIN_NM: 'Kids',
  RNUM: 1,
  START_YMD: '20261017',
  LECT_CNT: 7,
  MAIN_CD: '3',
  STORE: '02',
  DAY: '토',
  END_YMD: '20261128',
};

describe('parseLecture — 실측 샘플(store=02)', () => {
  it('실제 응답 1건을 정확히 파싱한다', () => {
    expect(parseLecture(REAL_SAMPLE_ROW)).toEqual({
      class_id: '835467',
      class_title: '(중도) [10/17개강] 주산식 암산 점프셈 수학교실 (7세-초등, 중급)',
      store_code: '02',
      main_category_name: '유아, 어린이',
      sub_category_name: '키즈 플레이&에듀',
      class_day: ['토'],
      start_time: '0950',
      end_time: '1030',
      class_fee: 70000,
      // FOOD_YN이 'R'(재료비 별도, 금액 미확정)이라 FOOD_AMT=0을 그대로 쓰지 않고 null.
      class_material_fee: null,
      instructor_name: '박영미',
      // 제목의 "7세-초등"에서 "초등"은 숫자가 아니라 범위 매칭이 안 되고
      // "7세"만 단일값으로 매칭된다(parseAgeRangeToMonths 공유 유틸의
      // 기존 동작 — 다른 브랜드와 동일한 한계, 지어내지 않음).
      min_age_months: 84,
      max_age_months: 84,
      schedule_start_date: '2026-10-17',
      schedule_end_date: '2026-11-28',
      total_sessions: 7,
      raw_status: '접수가능',
      normalized_status: 'OPEN',
      main_cd: '3',
      sect_cd: '02',
      subject_fg_name: '단기',
      reco_cnt: 0,
      main_image_url: null,
    });
  });

  it('FOOD_YN이 Y면 FOOD_AMT를 그대로 재료비로 쓴다(실측 샘플: 쿠킹 특강 15,000원)', () => {
    const row = { ...REAL_SAMPLE_ROW, FOOD_YN: 'Y', FOOD_AMT: 15000 };
    expect(parseLecture(row).class_material_fee).toBe(15000);
  });

  it('THUMBNAIL_IMG가 있으면 image_dir과 조합해 main_image_url을 채운다(__imageDir는 parseLectureListResponse가 주입)', () => {
    const row = { ...REAL_SAMPLE_ROW, THUMBNAIL_IMG: '20261006916315851.jpg', __imageDir: 'http://img-culture.akplaza.com/upload' };
    expect(parseLecture(row).main_image_url).toBe('http://img-culture.akplaza.com/upload/wlect/20261006916315851.jpg');
  });

  it('SUBJECT_CD/SUBJECT_NM이 없으면 null을 반환한다', () => {
    expect(parseLecture({ ...REAL_SAMPLE_ROW, SUBJECT_CD: '' })).toBeNull();
    expect(parseLecture({ ...REAL_SAMPLE_ROW, SUBJECT_NM: '' })).toBeNull();
  });
});

describe('parseLectureListResponse / getLectureListTotalCount', () => {
  it('list 배열을 파싱하고 listCnt를 함께 읽으며, image_dir을 각 행에 주입해 main_image_url을 만든다', () => {
    const json = {
      listCnt: 2,
      image_dir: 'http://img-culture.akplaza.com/upload',
      list: [REAL_SAMPLE_ROW, { ...REAL_SAMPLE_ROW, SUBJECT_CD: '835999', THUMBNAIL_IMG: 'x.jpg' }],
    };
    const parsed = parseLectureListResponse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[1].main_image_url).toBe('http://img-culture.akplaza.com/upload/wlect/x.jpg');
    expect(getLectureListTotalCount(json)).toBe(2);
  });

  it('list가 없으면 빈 배열, listCnt가 숫자가 아니면 0', () => {
    expect(parseLectureListResponse({})).toEqual([]);
    expect(getLectureListTotalCount({})).toBe(0);
  });
});
