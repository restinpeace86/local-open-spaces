import { describe, expect, it } from 'vitest';
import { toUnifiedEmartRow, toUnifiedLottemartRow, toUnifiedHyundaiRow, toUnifiedShinsegaeRow } from './culture-club-unified-row.mjs';

describe('toUnifiedEmartRow', () => {
  it('이마트 행을 통합 테이블 행으로 변환한다', () => {
    const row = {
      class_id: 'E1',
      class_title: '테스트 강좌',
      store_code: '964',
      store_name: '제천',
      class_fee: 2000,
      filter_status: '접수중',
      normalized_status: 'OPEN',
      register_start_at: '2026-08-10T10:00:00+09:00',
      is_excluded: false,
      channel_online: true,
      semester_year: '2026',
    };
    const result = toUnifiedEmartRow(row);

    expect(result.brand).toBe('emart');
    expect(result.source_class_id).toBe('E1');
    expect(result.raw_status).toBe('접수중');
    expect(result.normalized_status).toBe('OPEN');
    expect(result.register_start_at).toBe('2026-08-10T10:00:00+09:00');
    expect(result.raw_extra.channel_online).toBe(true);
    expect(result.raw_extra.semester_year).toBe('2026');
  });

  it('collected_at 등 타임스탬프가 원본에 없으면 결과 객체에 키 자체가 존재하지 않는다(대량 upsert에서 명시적 null로 보내져 NOT NULL을 위반하는 걸 막음 — 실측으로 발견)', () => {
    const result = toUnifiedEmartRow({ class_id: 'E1', class_title: 'T', filter_status: '접수중', normalized_status: 'OPEN' });
    expect('collected_at' in result).toBe(false);
    expect('created_at' in result).toBe(false);
    expect('updated_at' in result).toBe(false);
    expect('detail_fetched_at' in result).toBe(false);
  });
});

describe('toUnifiedLottemartRow', () => {
  it('롯데마트 행을 통합 테이블 행으로 변환하고 register_start_at은 항상 null이다', () => {
    const row = {
      class_id: 'L1',
      class_title: '테스트 강좌',
      store_code: '455',
      store_name: '고양점',
      registration_status: '바로신청',
      normalized_status: 'OPEN',
      is_excluded: false,
      target_code: '4',
      semester_code: '202603',
    };
    const result = toUnifiedLottemartRow(row);

    expect(result.brand).toBe('lottemart');
    expect(result.source_class_id).toBe('L1');
    expect(result.raw_status).toBe('바로신청');
    expect(result.register_start_at).toBeNull();
    expect(result.raw_extra.target_code).toBe('4');
    expect(result.raw_extra.semester_code).toBe('202603');
  });

  it('main_image_url(상세수집으로 채워진 썸네일)을 raw_extra에 담는다(2026-10-07 — 사진 있는데 왜 안보이는지 사용자 지적)', () => {
    const row = {
      class_id: 'L1',
      class_title: '테스트 강좌',
      registration_status: '바로신청',
      normalized_status: 'OPEN',
      main_image_url: 'https://culture.lottemart.com/files/culture/LMC/Storage/attach/Lecture/2026/01/x_IMG.jpg',
    };
    const result = toUnifiedLottemartRow(row);

    expect(result.raw_extra.main_image_url).toBe('https://culture.lottemart.com/files/culture/LMC/Storage/attach/Lecture/2026/01/x_IMG.jpg');
  });
});

describe('toUnifiedHyundaiRow', () => {
  it('현대백화점 행을 통합 테이블 행으로 변환한다(별도 상세수집 단계 없이 목록 데이터 그대로)', () => {
    const row = {
      class_id: '40950',
      class_title: '10.17) 오감발달 우리쌀 키즈베이킹 : 꼬마버스 자동차 쿠키_3세 이상 / 보호자 1인 동반',
      store_code: '220',
      store_name: '무역센터점',
      sub_category_name: '엄마랑 아가랑',
      min_age_months: 36,
      max_age_months: null,
      class_day: ['토'],
      schedule_days_code: ['SAT'],
      start_time: '1530',
      end_time: '1630',
      class_fee: 30000,
      instructor_name: '주연진',
      schedule_start_date: '2026-10-17',
      schedule_end_date: '2026-10-17',
      total_sessions: 1,
      raw_status: '신청가능',
      normalized_status: 'OPEN',
      main_image_url: 'https://imgprism.ehyundai.com/x.jpg',
      category_keyword: '025',
      sq_cd: '168',
      crs_cd: '37932',
      pro_cust_no: 'P02666039',
    };
    const result = toUnifiedHyundaiRow(row);

    expect(result.brand).toBe('hyundai');
    expect(result.source_class_id).toBe('40950');
    expect(result.class_title).toBe(row.class_title);
    expect(result.raw_status).toBe('신청가능');
    expect(result.register_start_at).toBeNull();
    expect(result.raw_extra.main_image_url).toBe('https://imgprism.ehyundai.com/x.jpg');
    expect(result.raw_extra.sq_cd).toBe('168');
    expect(result.raw_extra.crs_cd).toBe('37932');
    expect(result.raw_extra.pro_cust_no).toBe('P02666039');
  });
});

describe('toUnifiedShinsegaeRow', () => {
  it('신세계 아카데미 행을 통합 테이블 행으로 변환한다(별도 상세수집 단계 없이 목록 데이터 그대로)', () => {
    const row = {
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
      min_age_months: 48,
      max_age_months: null,
      schedule_start_date: '2026-11-28',
      schedule_end_date: '2026-11-28',
      total_sessions: 1,
      raw_status: 'RT',
      normalized_status: 'OPEN',
      target_code: 'C1',
      semester_code: 'S3',
      register_start_date: '2026-07-22',
      register_end_date: '2026-11-27',
    };
    const result = toUnifiedShinsegaeRow(row);

    expect(result.brand).toBe('shinsegae');
    expect(result.source_class_id).toBe('T2694782');
    expect(result.class_title).toBe(row.class_title);
    expect(result.raw_status).toBe('RT');
    expect(result.normalized_status).toBe('OPEN');
    expect(result.register_start_at).toBeNull();
    expect(result.raw_extra.target_code).toBe('C1');
    expect(result.raw_extra.semester_code).toBe('S3');
    expect(result.raw_extra.register_start_date).toBe('2026-07-22');
    expect(result.raw_extra.register_end_date).toBe('2026-11-27');
  });
});
