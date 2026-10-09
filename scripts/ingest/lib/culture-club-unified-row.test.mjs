import { describe, expect, it } from 'vitest';
import {
  toUnifiedEmartRow,
  toUnifiedLottemartRow,
  toUnifiedHyundaiRow,
  toUnifiedShinsegaeRow,
  toUnifiedAkplazaRow,
  toUnifiedStarfieldRow,
  toUnifiedLotteDepartmentRow,
} from './culture-club-unified-row.mjs';

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
      target_name: '패밀리',
      semester_code: 'S3',
      year_code: '2026',
      register_start_date: '2026-07-22',
      register_end_date: '2026-11-27',
    };
    const result = toUnifiedShinsegaeRow(row);

    expect(result.brand).toBe('shinsegae');
    expect(result.source_class_id).toBe('T2694782');
    expect(result.class_title).toBe(row.class_title);
    // [수강대상 라벨 — getCommCode.do로 확정](2026-10-08) 다른 브랜드와
    // 동일하게 sub_category_name 자리에 노출한다.
    expect(result.sub_category_name).toBe('패밀리');
    expect(result.raw_extra.target_name).toBe('패밀리');
    // [외부 신청 딥링크 파라미터 — year_code 보존](2026-10-08 사용자 제공
    // URL로 확정, HP0010P1.do?yearCode=...)
    expect(result.raw_extra.year_code).toBe('2026');
    expect(result.raw_status).toBe('RT');
    expect(result.normalized_status).toBe('OPEN');
    expect(result.register_start_at).toBeNull();
    expect(result.raw_extra.target_code).toBe('C1');
    expect(result.raw_extra.semester_code).toBe('S3');
    expect(result.raw_extra.register_start_date).toBe('2026-07-22');
    expect(result.raw_extra.register_end_date).toBe('2026-11-27');
  });

  // [상세정보(이미지/소개) 패스스루 — shinsegae-culture-club-detail.mjs가
  // 채워줌](2026-10-08 사용자 지시: "상세내용도 긁어오는거지? 이미지도?")
  // 메인 배치 자신은 모르는 필드라 row에 값이 들어왔을 때만 raw_extra로
  // 그대로 전달되면 된다(채워져 있지 않으면 undefined → 결과 객체에서
  // 생략되어야 함, omitUndefinedKeys와 동일한 관례).
  it('main_image_url/class_intro이 row에 있으면 raw_extra로 그대로 전달된다', () => {
    const result = toUnifiedShinsegaeRow({
      class_id: 'T2694782',
      class_title: '테스트',
      main_image_url: 'https://sacademy.shinsegae.com/sdotcom/uploads/images/bl/291.png',
      class_intro: '강좌 소개 텍스트',
    });
    expect(result.raw_extra.main_image_url).toBe('https://sacademy.shinsegae.com/sdotcom/uploads/images/bl/291.png');
    expect(result.raw_extra.class_intro).toBe('강좌 소개 텍스트');
  });

  it('main_image_url/class_intro이 아직 없으면(상세수집 전) undefined로 비어있다', () => {
    const result = toUnifiedShinsegaeRow({ class_id: 'T1', class_title: '테스트' });
    expect(result.raw_extra.main_image_url).toBeUndefined();
    expect(result.raw_extra.class_intro).toBeUndefined();
  });
});

describe('toUnifiedAkplazaRow', () => {
  it('AK플라자 행을 통합 테이블 행으로 변환한다(이미지는 목록 단계에서 이미 채워져 있음)', () => {
    const row = {
      class_id: '835467',
      class_title: '(중도) [10/17개강] 주산식 암산 점프셈 수학교실 (7세-초등, 중급)',
      store_code: '02',
      store_name: '수원점',
      main_category_name: '유아, 어린이',
      sub_category_name: '키즈 플레이&에듀',
      class_day: ['토'],
      start_time: '0950',
      end_time: '1030',
      class_fee: 70000,
      class_material_fee: null,
      instructor_name: '박영미',
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
      main_image_url: 'http://img-culture.akplaza.com/upload/wlect/20261006916315851.jpg',
    };
    const result = toUnifiedAkplazaRow(row);

    expect(result.brand).toBe('ak_plaza');
    expect(result.source_class_id).toBe('835467');
    // [분류 2단계 — 이마트와 동일한 구조](실측 확인) main_category_name=
    // 수강대상, sub_category_name=강좌분야.
    expect(result.main_category_name).toBe('유아, 어린이');
    expect(result.sub_category_name).toBe('키즈 플레이&에듀');
    expect(result.classroom).toBeNull(); // 목록의 CLASSROOM은 항상 placeholder라 저장하지 않음
    expect(result.raw_status).toBe('접수가능');
    expect(result.normalized_status).toBe('OPEN');
    expect(result.register_start_at).toBeNull();
    expect(result.raw_extra.main_cd).toBe('3');
    expect(result.raw_extra.sect_cd).toBe('02');
    // [이미지 — 목록 단계에서 이미 완성](실측 확인: 상세 페이지의 이미지
    // 블록은 사이트 자체가 꺼둔 상태라 상세수집이 아니라 목록 배치가 직접
    // 채운다) 별도 상세수집(detail.mjs)이 필요한 건 class_intro뿐이다.
    expect(result.raw_extra.main_image_url).toBe('http://img-culture.akplaza.com/upload/wlect/20261006916315851.jpg');
  });

  // [소개 텍스트 패스스루 — akplaza-culture-club-detail.mjs가 채워줌]
  // 메인 배치 자신은 모르는 필드라 row에 값이 들어왔을 때만 raw_extra로
  // 그대로 전달되면 된다.
  it('class_intro이 row에 있으면 raw_extra로 그대로 전달된다', () => {
    const result = toUnifiedAkplazaRow({ class_id: '835467', class_title: '테스트', class_intro: '강좌 소개 텍스트' });
    expect(result.raw_extra.class_intro).toBe('강좌 소개 텍스트');
  });

  it('class_intro이 아직 없으면(상세수집 전) undefined로 비어있다', () => {
    const result = toUnifiedAkplazaRow({ class_id: '835467', class_title: '테스트' });
    expect(result.raw_extra.class_intro).toBeUndefined();
  });
});

describe('toUnifiedStarfieldRow', () => {
  it('스타필드 행을 통합 테이블 행으로 변환한다(이미지는 목록 단계에서 이미 채워져 있음)', () => {
    const row = {
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
    };
    const result = toUnifiedStarfieldRow(row);

    expect(result.brand).toBe('starfield');
    expect(result.source_class_id).toBe('L260910153');
    // [수강대상 라벨 — 신세계와 동일하게 sub_category_name 자리에 노출]
    expect(result.sub_category_name).toBe('영유아');
    expect(result.raw_extra.target_code).toBe('3');
    expect(result.class_original_fee).toBe(30000);
    expect(result.raw_status).toBe('P');
    expect(result.normalized_status).toBe('OPEN');
    // [접수 시작 시각 — 다른 브랜드와 달리 정밀하게 제공됨]
    expect(result.register_start_at).toBe('2026-09-10T00:00:00+09:00');
    expect(result.raw_extra.register_end_at).toBe('2026-10-09T11:29:59+09:00');
    expect(result.raw_extra.main_image_url).toBe('https://image.classkok.com/lect/20260910/1e5ce92f-9829-4616-942e-a59ba6b0e437.jpg');
  });

  it('class_intro이 row에 있으면 raw_extra로 그대로 전달된다', () => {
    const result = toUnifiedStarfieldRow({ class_id: 'L1', class_title: '테스트', class_intro: '강좌 소개 텍스트' });
    expect(result.raw_extra.class_intro).toBe('강좌 소개 텍스트');
  });

  it('class_intro이 아직 없으면(상세수집 전) undefined로 비어있다', () => {
    const result = toUnifiedStarfieldRow({ class_id: 'L1', class_title: '테스트' });
    expect(result.raw_extra.class_intro).toBeUndefined();
  });
});

describe('toUnifiedLotteDepartmentRow', () => {
  it('목록 배치가 넘긴 "뼈대" 행(상세수집 전)은 구조화 컬럼이 전부 undefined로 비어있다(다른 브랜드와 다른 설계 — 상세수집이 이 컬럼들을 채움)', () => {
    const result = toUnifiedLotteDepartmentRow({
      class_id: '0025_2026_3_0478',
      class_title: '[특강]아이좋아 아이꼬야(4~9개월)',
      store_code: '0025',
      store_name: '전주점',
      brch_cd: '0025',
      yy: '2026',
      lect_smster_cd: '3',
      lect_cd: '0478',
      raw_status: '대기접수',
      normalized_status: 'WAITING',
      main_image_url: 'https://culture.lotteshopping.com/files/CUL_ONL/2026/8/202608261048455010.jpg',
    });

    expect(result.brand).toBe('lotte_department');
    expect(result.source_class_id).toBe('0025_2026_3_0478');
    expect(result.normalized_status).toBe('WAITING');
    expect(result.instructor_name).toBeUndefined();
    expect(result.start_time).toBeUndefined();
    expect(result.raw_extra.brch_cd).toBe('0025');
    expect(result.raw_extra.main_image_url).toBe('https://culture.lotteshopping.com/files/CUL_ONL/2026/8/202608261048455010.jpg');
    expect(result.raw_extra.class_intro).toBeUndefined();
  });

  it('상세수집이 이미 끝난 행(merge된 값)은 구조화 컬럼이 그대로 전달된다(재실행 시 유실 방지)', () => {
    const result = toUnifiedLotteDepartmentRow({
      class_id: '0025_2026_3_0488',
      class_title: '테스트',
      store_code: '0025',
      store_name: '전주점',
      raw_status: '접수중',
      normalized_status: 'OPEN',
      instructor_name: '이영희',
      classroom: '8층 맘엔키즈',
      class_fee: 12000,
      class_day: ['화'],
      start_time: '1440',
      end_time: '1520',
      schedule_start_date: '2026-09-08',
      schedule_end_date: '2026-09-08',
      total_sessions: 1,
      min_age_months: 7,
      max_age_months: 12,
      class_intro: '실제 강좌 소개',
    });

    expect(result.instructor_name).toBe('이영희');
    expect(result.classroom).toBe('8층 맘엔키즈');
    expect(result.class_fee).toBe(12000);
    expect(result.start_time).toBe('1440');
    expect(result.min_age_months).toBe(7);
    expect(result.raw_extra.class_intro).toBe('실제 강좌 소개');
  });
});
