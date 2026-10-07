// [이마트 컬처클럽 강좌 리스트 수집](2026-10-03 사용자 지시) — transform() 단위 테스트.
// 실측 표본 그대로(2026-10-03 getClassByFiltering 직접 호출, 응답 그대로 복사).
import { describe, expect, it } from 'vitest';
import { transform, parseRegisterStartAt, diagnoseRegisterWindowCapture, formatDurationSeconds } from './emart-culture-club.mjs';

const SAMPLE_ITEM = {
  classId: '4065WabI62026S3964',
  classTitle: '10/3(토) 11:00 두근두근 무지개 레이저쇼(36개월 이상)*인당 결제',
  classDay: ['토'],
  classTime: { startTime: '1100', endTime: '1140' },
  mainCategory: { categoryCode: '4', categoryName: 'Little Club' },
  subCategory: { categoryCode: '406', categoryName: 'Kids & Children(event)' },
  mainStoreInfo: { storeName: '제천', storeCode: '964', storeCenter: 'emart' },
  classroom: '다목적',
  minClassCapacity: '1',
  classCapacity: 32,
  semesterYear: 2026,
  semester: '가을',
  classOriginalFee: null,
  classFee: 2000,
  classMaterialFee: '',
  classType: '일반',
  occupiedFullFlag: false,
  channel: { online: 'Y', offline: 'Y' },
  classDateInfo: {
    classStartDate: '20261003',
    classEndDate: '20261003',
    classClosedDate: null,
    classRegisterStartDate: '202608101000',
    classRegisterEndDate: '20261003',
  },
};

describe('emart-culture-club transform', () => {
  it('실측 샘플을 올바른 DB 행으로 변환한다', () => {
    const row = transform(SAMPLE_ITEM, '접수중');
    expect(row).toEqual({
      class_id: '4065WabI62026S3964',
      class_title: '10/3(토) 11:00 두근두근 무지개 레이저쇼(36개월 이상)*인당 결제',
      class_day: ['토'],
      start_time: '1100',
      end_time: '1140',
      main_category_code: '4',
      main_category_name: 'Little Club',
      sub_category_code: '406',
      sub_category_name: 'Kids & Children(event)',
      store_code: '964',
      store_name: '제천',
      store_center: 'emart',
      classroom: '다목적',
      min_class_capacity: 1,
      class_capacity: 32,
      semester_year: '2026',
      semester: '가을',
      class_original_fee: null,
      class_fee: 2000,
      class_material_fee: null,
      class_type: '일반',
      occupied_full_flag: false,
      channel_online: true,
      channel_offline: true,
      register_start_date: '202608101000',
      register_start_at: '2026-08-10T10:00:00+09:00',
      register_end_date: '20261003',
      class_start_date: '20261003',
      class_end_date: '20261003',
      class_closed_date: null,
      filter_status: '접수중',
      min_age_months: 36,
      max_age_months: null,
      schedule_start_date: '2026-10-03',
      schedule_end_date: '2026-10-03',
      schedule_days_code: ['SAT'],
      round: null,
      total_sessions: null,
      instructor_name: null,
      normalized_status: 'OPEN',
    });
  });

  it('minClassCapacity가 문자열("1")이어도 정수로 변환한다(실측 확인된 타입 불일치)', () => {
    const row = transform({ ...SAMPLE_ITEM, minClassCapacity: '5' }, '접수중');
    expect(row.min_class_capacity).toBe(5);
  });

  it('classMaterialFee가 빈 문자열이면 null로 변환한다(실측 확인 — integer 컬럼에 빈 문자열 불가)', () => {
    const row = transform({ ...SAMPLE_ITEM, classMaterialFee: '' }, '접수중');
    expect(row.class_material_fee).toBeNull();
  });

  it('channel.online/offline이 "N"이면 false로 변환한다', () => {
    const row = transform({ ...SAMPLE_ITEM, channel: { online: 'N', offline: 'N' } }, '접수중');
    expect(row.channel_online).toBe(false);
    expect(row.channel_offline).toBe(false);
  });

  it('channel 정보가 아예 없으면 null로 둔다(추측 변환 금지)', () => {
    const row = transform({ ...SAMPLE_ITEM, channel: null }, '접수중');
    expect(row.channel_online).toBeNull();
    expect(row.channel_offline).toBeNull();
  });

  it('classId나 classTitle이 없으면 null(드롭)을 반환한다', () => {
    expect(transform({ ...SAMPLE_ITEM, classId: '' }, '접수중')).toBeNull();
    expect(transform({ ...SAMPLE_ITEM, classTitle: '' }, '접수중')).toBeNull();
  });

  it('filter_status를 그대로 저장한다(응답에 상태 필드 자체가 없어서)', () => {
    expect(transform(SAMPLE_ITEM, '정원마감').filter_status).toBe('정원마감');
    expect(transform(SAMPLE_ITEM, '접수대기').filter_status).toBe('접수대기');
  });
});

// [접수 시작 시각 파싱](2026-10-03 사용자 지시: "예약 시작시간이니 이 부분
// 파싱해서 따로 컬럼으로 가지고 있든 해야할거같은데?") — register_start_date
// 원본 "YYYYMMDDHHmm"(KST) 문자열을 timestamptz로 쓸 ISO 문자열로 변환한다.
describe('parseRegisterStartAt', () => {
  it('"YYYYMMDDHHmm" 원본을 KST(+09:00) ISO 문자열로 변환한다', () => {
    expect(parseRegisterStartAt('202608101000')).toBe('2026-08-10T10:00:00+09:00');
  });

  it('null/빈 문자열이면 null을 반환한다', () => {
    expect(parseRegisterStartAt(null)).toBeNull();
    expect(parseRegisterStartAt('')).toBeNull();
  });

  it('길이가 12자가 아니면(실측상 항상 12자지만 방어적으로) null을 반환한다', () => {
    expect(parseRegisterStartAt('20261003')).toBeNull();
    expect(parseRegisterStartAt('2026081010000')).toBeNull();
  });
});

// [접수대기 포착 가능성 진단](2026-10-03 사용자 지시: "당일 등록+당일 오픈이거나
// 우리의 배치주기보다 짧아서 우리가 캐치못할수 있는지에 대하여 데이터 가져오면서
// 확인해") — 기존 class_id와 비교해 "이번에 처음 나타난 강좌" 중, 처음 본 시점에
// 이미 접수 시작을 지나 있었는지(= 접수대기로 포착할 기회조차 없었던 것)를 가려낸다.
describe('diagnoseRegisterWindowCapture', () => {
  const now = new Date('2026-10-03T00:00:00Z');

  it('기존에 없던(신규) 강좌이고 접수 시작이 이미 지났으면 missedWindow로 센다', () => {
    const rows = [{ class_id: 'new-1', register_start_at: '2026-10-02T23:00:00Z' }]; // 1시간 전
    const result = diagnoseRegisterWindowCapture(rows, new Set(), now);
    expect(result.newCount).toBe(1);
    expect(result.missedWindowCount).toBe(1);
    expect(result.caughtInTimeCount).toBe(0);
    expect(result.missedWindowSampleClassIds).toEqual(['new-1']);
  });

  it('기존에 없던(신규) 강좌이고 접수 시작이 아직 안 지났으면 리드타임을 계산한다', () => {
    const rows = [{ class_id: 'new-2', register_start_at: '2026-10-05T00:00:00Z' }]; // 48시간 후
    const result = diagnoseRegisterWindowCapture(rows, new Set(), now);
    expect(result.caughtInTimeCount).toBe(1);
    expect(result.missedWindowCount).toBe(0);
    expect(result.leadTimeHoursMin).toBe(48);
  });

  it('이미 기존 DB에 있던(신규가 아닌) 강좌는 진단 대상에서 제외한다', () => {
    const rows = [{ class_id: 'existing-1', register_start_at: '2026-10-02T23:00:00Z' }];
    const result = diagnoseRegisterWindowCapture(rows, new Set(['existing-1']), now);
    expect(result.newCount).toBe(0);
    expect(result.missedWindowCount).toBe(0);
  });

  it('register_start_at이 없는 신규 강좌는 newCount엔 포함되지만 리드타임 계산에선 제외된다', () => {
    const rows = [{ class_id: 'new-3', register_start_at: null }];
    const result = diagnoseRegisterWindowCapture(rows, new Set(), now);
    expect(result.newCount).toBe(1);
    expect(result.missedWindowCount).toBe(0);
    expect(result.caughtInTimeCount).toBe(0);
  });
});

describe('formatDurationSeconds', () => {
  it('밀리초를 소수점 1자리 초 단위 문자열로 바꾼다', () => {
    expect(formatDurationSeconds(12345)).toBe('12.3초');
    expect(formatDurationSeconds(500)).toBe('0.5초');
  });
});
