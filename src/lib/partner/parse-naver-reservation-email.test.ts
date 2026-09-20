import { describe, expect, it } from 'vitest';
import { parseNaverReservationEmail } from './parse-naver-reservation-email';

// [나드리픽 파트너 PMS — 클라우드플레어 인바운드 메일 연동](2026-09-21 사용자
// 지시): 실제 "네이버 예약 알림" 메일 샘플이 없어(추측 금지 원칙상 확보 전까지
// 라벨/포맷을 확신할 수 없음) 이 파서가 지원하기로 설계한 흔한 라벨/포맷
// 변형들이 실제로 동작하는지만 검증한다 — 실제 메일로 검증된 것은 아니다.
describe('parseNaverReservationEmail', () => {
  it('가장 표준적인 형태(라벨: 값, 각 줄바꿈)를 파싱한다', () => {
    const body = ['예약자명: 김손님', '연락처: 010-1234-5678', '예약날짜: 2026-09-25', '예약시간: 14:30', '인원: 4명'].join(
      '\n'
    );
    expect(parseNaverReservationEmail(body)).toEqual({
      customerName: '김손님',
      customerPhone: '010-1234-5678',
      bookingDate: '2026-09-25',
      bookingTime: '14:30',
      headcount: 4,
    });
  });

  it('한글 날짜/오후 시간 표기, 콜론 없는 라벨도 파싱한다', () => {
    const body = ['예약자 이나드', '전화번호 010-9876-5432', '방문일 2026년 9월 25일', '방문시간 오후 2시 30분', '방문인원 3명'].join(
      '\n'
    );
    expect(parseNaverReservationEmail(body)).toEqual({
      customerName: '이나드',
      customerPhone: '010-9876-5432',
      bookingDate: '2026-09-25',
      bookingTime: '14:30',
      headcount: 3,
    });
  });

  it('날짜와 시간이 "예약일시" 한 줄에 같이 온 경우도 파싱한다', () => {
    const body = ['성함: 박농장', '휴대폰: 01011112222', '예약일시: 2026년 9월 25일 오전 11시', '인원수: 2명'].join('\n');
    expect(parseNaverReservationEmail(body)).toEqual({
      customerName: '박농장',
      customerPhone: '010-1111-2222',
      bookingDate: '2026-09-25',
      bookingTime: '11:00',
      headcount: 2,
    });
  });

  it('연도가 생략된 날짜는 오늘(KST) 연도를 사용한다', () => {
    const body = ['예약자명: 최고객', '연락처: 010-2222-3333', '예약날짜: 9월 25일', '예약시간: 10:00', '인원: 1명'].join('\n');
    const result = parseNaverReservationEmail(body);
    expect(result?.bookingDate).toMatch(/^\d{4}-09-25$/);
  });

  it('"성인 N명, 아동 N명"처럼 여러 항목으로 나뉜 인원을 합산한다', () => {
    const body = [
      '예약자명: 정가족',
      '연락처: 010-3333-4444',
      '예약날짜: 2026-09-25',
      '예약시간: 12:00',
      '인원: 성인 2명, 아동 2명',
    ].join('\n');
    expect(parseNaverReservationEmail(body)?.headcount).toBe(4);
  });

  it('라벨 없이 전화번호 패턴만 있어도 최후 수단으로 추출한다', () => {
    const body = ['예약자명: 남손님', '방문 관련 문의는 010-5555-6666 으로', '예약날짜: 2026-09-25', '예약시간: 09:00', '인원: 2명'].join(
      '\n'
    );
    expect(parseNaverReservationEmail(body)?.customerPhone).toBe('010-5555-6666');
  });

  it('필수 항목 중 하나라도 추출하지 못하면 null을 반환한다(추측하지 않음)', () => {
    const missingPhone = ['예약자명: 김손님', '예약날짜: 2026-09-25', '예약시간: 14:30', '인원: 4명'].join('\n');
    expect(parseNaverReservationEmail(missingPhone)).toBeNull();

    const missingHeadcount = ['예약자명: 김손님', '연락처: 010-1234-5678', '예약날짜: 2026-09-25', '예약시간: 14:30'].join('\n');
    expect(parseNaverReservationEmail(missingHeadcount)).toBeNull();
  });

  it('아무 라벨도 없는 임의 텍스트는 null을 반환한다', () => {
    expect(parseNaverReservationEmail('안녕하세요, 그냥 문의드립니다.')).toBeNull();
  });
});
