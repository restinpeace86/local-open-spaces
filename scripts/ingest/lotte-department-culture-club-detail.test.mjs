import { describe, expect, it } from 'vitest';
import {
  parseClassIntro,
  parseDayTimeRange,
  parseDetailHtml,
  parseDotDateRange,
  parseFeeAmount,
  parseSessionsAndCapacity,
} from './lotte-department-culture-club-detail.mjs';
import { parse } from 'node-html-parser';

describe('parseDotDateRange', () => {
  it('"YYYY.MM.DD ~ YYYY.MM.DD"(공백 포함)를 파싱한다', () => {
    expect(parseDotDateRange('2026.10.10 ~ 2026.11.28')).toEqual({ startDate: '2026-10-10', endDate: '2026-11-28' });
  });
  it('형식이 다르면 둘 다 null', () => {
    expect(parseDotDateRange(null)).toEqual({ startDate: null, endDate: null });
  });
});

describe('parseDayTimeRange', () => {
  it('"(요일) HH:MM~HH:MM"을 파싱한다', () => {
    expect(parseDayTimeRange('(수) 11:20~12:00')).toEqual({ day: '수', startTime: '1120', endTime: '1200' });
  });
  it('형식이 다르면 전부 null', () => {
    expect(parseDayTimeRange('세부 일정 선택')).toEqual({ day: null, startTime: null, endTime: null });
  });
});

describe('parseFeeAmount', () => {
  it('"12,000원"을 12000으로 바꾼다', () => {
    expect(parseFeeAmount('12,000원')).toBe(12000);
  });
  it('숫자가 없으면 null', () => {
    expect(parseFeeAmount(null)).toBeNull();
  });
});

describe('parseSessionsAndCapacity', () => {
  it('"1회/12명"을 분리한다', () => {
    expect(parseSessionsAndCapacity('1회/12명')).toEqual({ sessions: 1, capacity: 12 });
  });
  it('"8회/1명"도 분리한다', () => {
    expect(parseSessionsAndCapacity('8회/1명')).toEqual({ sessions: 8, capacity: 1 });
  });
  it('형식이 다르면 둘 다 null', () => {
    expect(parseSessionsAndCapacity(null)).toEqual({ sessions: null, capacity: null });
  });
});

// [실측 확인된 상세 페이지 구조](2026-10-09, brchCd=0025&yy=2026&
// lectSmsterCd=3&lectCd=0488 실제 응답에서 발췌한 최소 구조).
function wrapDetailHtml({ introText = '실제 소개' } = {}) {
  return `<html><body>
    <dl><dt>지점</dt><dd>전주점</dd></dl>
    <dl><dt>강좌구분</dt><dd>특강</dd></dl>
    <dl><dt>학기</dt><dd>2026년 가을학기</dd></dl>
    <dl><dt>강사명</dt><dd>이영희</dd></dl>
    <dl><dt>강의기간</dt><dd>2026.09.08 ~ 2026.09.08</dd></dl>
    <dl><dt>강의시간</dt><dd>(화) 14:40~15:20</dd></dl>
    <dl><dt>강의횟수/정원</dt><dd>1회/12명</dd></dl>
    <dl><dt>강의실</dt><dd>8층 맘엔키즈</dd></dl>
    <dl><dt>수강료</dt><dd>12,000원</dd></dl>
    <dl><dt>자녀연령</dt><dd>7~12개월</dd></dl>
    <dl><dt>대상구분</dt><dd>2인강좌</dd></dl>
    <dl><dt>접수기간</dt><dd>2026.07.23~2026.11.14</dd></dl>
    <dl><dt>문의처</dt><dd>063-289-3755~7</dd></dl>
    <p class="sub_tit">강좌정보</p>
    <p class="sub_tit">강좌소개</p>
    <div class="info_img_txt">${introText}</div>
    <script>// 무관한 스크립트</script>
    <div class="more_btn_wrap">강좌소개 더보기</div>
  </body></html>`;
}

describe('parseClassIntro', () => {
  it('"강좌소개" 바로 다음 .info_img_txt 텍스트를 가져온다', () => {
    const root = parse(wrapDetailHtml({ introText: '아이좋아 아이꼬야 소개 텍스트' }));
    expect(parseClassIntro(root)).toBe('아이좋아 아이꼬야 소개 텍스트');
  });

  it('"강좌소개" 섹션이 없으면 null', () => {
    const root = parse('<html><body></body></html>');
    expect(parseClassIntro(root)).toBeNull();
  });
});

describe('parseDetailHtml — 실측 샘플 전체 파싱', () => {
  it('dt/dd 전부를 정확히 구조화된 필드로 변환한다', () => {
    const html = wrapDetailHtml({ introText: '실제 강좌 소개' });
    expect(parseDetailHtml(html)).toEqual({
      instructor_name: '이영희',
      classroom: '8층 맘엔키즈',
      class_fee: 12000,
      class_day: ['화'],
      schedule_days_code: ['TUE'],
      start_time: '1440',
      end_time: '1520',
      schedule_start_date: '2026-09-08',
      schedule_end_date: '2026-09-08',
      total_sessions: 1,
      min_age_months: 7,
      max_age_months: 12,
      lect_gubun: '특강',
      target_gubun: '2인강좌',
      capacity: 12,
      register_start_date: '2026-07-23',
      register_end_date: '2026-11-14',
      contact_phone: '063-289-3755~7',
      class_intro: '실제 강좌 소개',
    });
  });
});
