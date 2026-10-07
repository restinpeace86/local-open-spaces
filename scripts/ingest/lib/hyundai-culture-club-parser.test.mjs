// [현대백화점 문화센터 수집 — 파서 단위 테스트](2026-10-08) — 실측 표본
// 그대로(사용자 제공 네트워크 캡처 기반 CT010100_L.do 직접 호출, 응답에서
// 강좌 카드 영역만 그대로 복사).
import { describe, expect, it } from 'vitest';
import {
  parseDateRange,
  parseTimeRange,
  parseSessionCount,
  parseFee,
  normalizeHyundaiStatus,
  parseCourseItem,
  parseCourseListPage,
} from './hyundai-culture-club-parser.mjs';
import { parse } from 'node-html-parser';

describe('parseDateRange', () => {
  it('단발성 날짜 하나만 있으면 start=end로 같다', () => {
    expect(parseDateRange('2026.10.17(토)')).toEqual({ startDate: '2026-10-17', endDate: '2026-10-17', dayOfWeek: '토' });
  });

  it('범위 날짜는 시작~종료를 각각 파싱한다', () => {
    expect(parseDateRange('2026.10.11(일) ~ 2026.12.13(일)')).toEqual({
      startDate: '2026-10-11',
      endDate: '2026-12-13',
      dayOfWeek: '일',
    });
  });

  it('빈 문자열/매칭 실패는 전부 null', () => {
    expect(parseDateRange('')).toEqual({ startDate: null, endDate: null, dayOfWeek: null });
    expect(parseDateRange('날짜 없음')).toEqual({ startDate: null, endDate: null, dayOfWeek: null });
  });
});

describe('parseTimeRange', () => {
  it('"15:30-16:30"을 시작/종료 시각(HHmm)으로 변환한다', () => {
    expect(parseTimeRange('15:30-16:30')).toEqual({ startTime: '1530', endTime: '1630' });
  });
});

describe('parseSessionCount', () => {
  it('"1회"에서 숫자만 뽑는다', () => {
    expect(parseSessionCount('[무역센터점]\n1회')).toBe(1);
  });

  it('회차 표기가 없으면 null', () => {
    expect(parseSessionCount('[무역센터점]')).toBeNull();
  });
});

describe('parseFee', () => {
  it('쉼표를 제거하고 숫자로 바꾼다', () => {
    expect(parseFee('30,000')).toBe(30000);
  });
});

describe('normalizeHyundaiStatus', () => {
  it('신청가능/중간신청/마감임박은 OPEN이다(실측 확인된 값)', () => {
    expect(normalizeHyundaiStatus('신청가능')).toBe('OPEN');
    expect(normalizeHyundaiStatus('중간신청')).toBe('OPEN');
    expect(normalizeHyundaiStatus('마감임박')).toBe('OPEN');
  });

  it('알려지지 않은 상태는 안전하게 CLOSED로 본다(추측 금지)', () => {
    expect(normalizeHyundaiStatus('마감')).toBe('CLOSED');
    expect(normalizeHyundaiStatus(null)).toBe('CLOSED');
  });
});

// 실측 표본(2026-10-07 사용자 제공 캡처로 직접 조회한 courseview 목록
// 카드 HTML 그대로).
const SAMPLE_LI_HTML = `
  <li><a href="/newCulture/CT/CT010100_V.do?stCd=220&sqCd=168&crsSqNo=40950&crsCd=37932&proCustNo=P02666039&ctGubn=">
    <img src="https://imgprism.ehyundai.com/derivedImage/fileValue/202609/12/a0f7ab98-de40-414a-a8fb-4557383cacd1_01.jpg" alt="강의 관련 사진">
    <div class="branch_info">
      <span class="state">신청가능</span>
      <span class="etc">엄마랑 아가랑</span>
    </div>
    <dl>
      <dt>10.17) 오감발달 우리쌀 키즈베이킹 : 꼬마버스 자동차 쿠키_3세 이상 / 보호자 1인 동반</dt>
      <dd class="class_info">
        <div class="info"><span>[무역센터점] 1회</span> <span>주연진</span></div>
        <div class="info">2026.10.17(토)</div>
        <div class="info">15:30-16:30</div>
        <div class="price">30,000<span class="won">원</span></div>
      </dd>
    </dl>
  </a></li>
`;

describe('parseCourseItem', () => {
  it('실측 표본 카드 하나를 전부 올바르게 파싱한다', () => {
    const li = parse(SAMPLE_LI_HTML).querySelector('li');
    const result = parseCourseItem(li, '025');

    expect(result).toEqual({
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
      main_image_url: 'https://imgprism.ehyundai.com/derivedImage/fileValue/202609/12/a0f7ab98-de40-414a-a8fb-4557383cacd1_01.jpg',
      category_keyword: '025',
      sq_cd: '168',
      crs_cd: '37932',
      pro_cust_no: 'P02666039',
    });
  });

  it('제목 문자열 자체는 전혀 가공하지 않고 원문 그대로 보존한다(2026-10-07 사용자 지시)', () => {
    const li = parse(SAMPLE_LI_HTML).querySelector('li');
    const result = parseCourseItem(li, '025');
    expect(result.class_title).toBe('10.17) 오감발달 우리쌀 키즈베이킹 : 꼬마버스 자동차 쿠키_3세 이상 / 보호자 1인 동반');
  });

  it('crsSqNo(class_id)가 없는 링크는 null을 반환한다', () => {
    const li = parse('<li><a href="/newCulture/CT/CT010100_V.do?stCd=220">no id</a></li>').querySelector('li');
    expect(parseCourseItem(li, '025')).toBeNull();
  });
});

describe('parseCourseListPage', () => {
  it('페이지 전체에서 강좌 카드만 걸러 파싱한다', () => {
    const html = `<html><body><ul>${SAMPLE_LI_HTML}<li><a href="/other.do">관련없는 링크</a></li></ul></body></html>`;
    const result = parseCourseListPage(html, '025');
    expect(result).toHaveLength(1);
    expect(result[0].class_id).toBe('40950');
  });
});
