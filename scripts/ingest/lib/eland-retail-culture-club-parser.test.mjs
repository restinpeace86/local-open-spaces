import { describe, expect, it } from 'vitest';
import {
  ELAND_LEC_TYPE_LABELS,
  normalizeElandStatus,
  parseFeeAmount,
  parseKoreanDayChar,
  parseLectureListResponse,
  parseTimeRange,
  parseTotalSessionsFromTitle,
} from './eland-retail-culture-club-parser.mjs';

describe('ELAND_LEC_TYPE_LABELS', () => {
  it('사용자가 확정한 8개(B/C/D/F/J/K/L/M) 라벨을 갖는다', () => {
    expect(ELAND_LEC_TYPE_LABELS.B).toBe('엄마랑아기랑');
    expect(ELAND_LEC_TYPE_LABELS.C).toBe('아동');
    expect(ELAND_LEC_TYPE_LABELS.D).toBe('초등');
    expect(ELAND_LEC_TYPE_LABELS.F).toBe('아동단기');
    expect(ELAND_LEC_TYPE_LABELS.J).toBe('방학특강');
    expect(ELAND_LEC_TYPE_LABELS.K).toBe('중도수강');
    expect(ELAND_LEC_TYPE_LABELS.L).toBe('아동일일');
    expect(ELAND_LEC_TYPE_LABELS.M).toBe('엄마랑 아가랑 단기');
  });
});

describe('normalizeElandStatus — "신청현황" select 옵션으로 확정된 라벨', () => {
  it('수강신청은 OPEN', () => {
    expect(normalizeElandStatus('수강신청')).toBe('OPEN');
  });
  it('대기신청은 WAITING', () => {
    expect(normalizeElandStatus('대기신청')).toBe('WAITING');
  });
  it('나머지(현장문의/마감/온라인 접수마감)는 안전하게 CLOSED', () => {
    expect(normalizeElandStatus('현장문의')).toBe('CLOSED');
    expect(normalizeElandStatus('마감')).toBe('CLOSED');
    expect(normalizeElandStatus('온라인 접수마감')).toBe('CLOSED');
  });
});

describe('parseKoreanDayChar', () => {
  it('"월요일"에서 첫 글자만 가져온다', () => {
    expect(parseKoreanDayChar('월요일')).toBe('월');
  });
  it('빈 값이면 null', () => {
    expect(parseKoreanDayChar(null)).toBeNull();
  });
});

describe('parseTimeRange', () => {
  it('"HH:MM ~ HH:MM"을 HHmm 포맷으로 바꾼다', () => {
    expect(parseTimeRange('13:50 ~ 14:30')).toEqual({ startTime: '1350', endTime: '1430' });
  });
  it('형식이 다르면 둘 다 null', () => {
    expect(parseTimeRange(null)).toEqual({ startTime: null, endTime: null });
  });
});

describe('parseFeeAmount', () => {
  it('"77,000원"을 77000으로 바꾼다', () => {
    expect(parseFeeAmount('77,000원')).toBe(77000);
  });
  it('숫자가 없으면 null', () => {
    expect(parseFeeAmount(null)).toBeNull();
  });
});

describe('parseTotalSessionsFromTitle', () => {
  it('맨 앞 "N회"를 가져온다', () => {
    expect(parseTotalSessionsFromTitle('11회 (월)동화촉감놀이 당나귀똥(11-20개월) 13:50')).toBe(11);
  });
  it('형식이 다르면 null', () => {
    expect(parseTotalSessionsFromTitle('(월)동화촉감놀이')).toBeNull();
  });
});

// 실측 샘플(2026-10-09, StoreID=8222/LecTypeID=B 실제 응답에서 발췌).
function wrapCardHtml({ storeId = '8222', semNum = '66', lecTypeId = 'B', seq = '36', statusText = '현장문의', storeName = '부천', title, dayTime, fee } = {}) {
  return `<li>
    <a href="#;" onclick="culture04('${storeId}','${semNum}','${lecTypeId}','${seq}');">
      <mark class="mark2">${statusText}</mark>
      <strong>${title}</strong>
      <span class="assist">${storeName} <span>|</span> ${lecTypeId}${seq} <span>|</span> 전문강사</span>
      <span class="assist"> ${dayTime} <span>|</span> ${fee}</span>
    </a>
  </li>`;
}

describe('parseLectureListResponse', () => {
  it('실제 카드 1건을 정확히 파싱한다(복합 class_id, 상태/지점/요일/시간/가격 포함)', () => {
    const html = wrapCardHtml({
      title: '11회 (월)동화촉감놀이 당나귀똥(11-20개월) 13:50',
      dayTime: '월요일 13:50 ~ 14:30',
      fee: '77,000원',
    });
    const items = parseLectureListResponse(html);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      class_id: '8222_66_B_36',
      store_id: '8222',
      sem_num: '66',
      lec_type_id: 'B',
      seq: '36',
      class_title: '11회 (월)동화촉감놀이 당나귀똥(11-20개월) 13:50',
      store_code: '8222',
      store_name: '부천',
      class_day: ['월'],
      schedule_days_code: ['MON'],
      start_time: '1350',
      end_time: '1430',
      class_fee: 77000,
      total_sessions: 11,
      min_age_months: 11,
      max_age_months: 20,
      raw_status: '현장문의',
      normalized_status: 'CLOSED',
      target_code: 'B',
      target_name: '엄마랑아기랑',
    });
  });

  it('수강신청 상태는 OPEN으로 정규화된다', () => {
    const html = wrapCardHtml({
      statusText: '수강신청',
      title: '(화)테스트 강좌(5-7세)',
      dayTime: '화요일 10:00 ~ 10:40',
      fee: '50,000원',
    });
    expect(parseLectureListResponse(html)[0].normalized_status).toBe('OPEN');
  });

  it('onclick이 예상 형식과 다르면(culture04 호출이 아님) 건너뛴다', () => {
    const html = `<li><a href="#;" onclick="somethingElse();"><strong>테스트</strong></a></li>`;
    expect(parseLectureListResponse(html)).toEqual([]);
  });

  it('카드가 없으면 빈 배열', () => {
    expect(parseLectureListResponse('<div></div>')).toEqual([]);
  });
});
