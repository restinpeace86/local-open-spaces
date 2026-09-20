import { describe, expect, it } from 'vitest';
import { stripHtml } from './strip-html';

describe('stripHtml', () => {
  it('br/p/div/tr/li 닫는 태그를 개행으로 바꾼다', () => {
    expect(stripHtml('예약자명: 김손님<br>연락처: 010-1234-5678')).toBe('예약자명: 김손님\n연락처: 010-1234-5678');
    expect(stripHtml('<p>예약자명: 김손님</p><p>연락처: 010-1234-5678</p>')).toBe(
      '예약자명: 김손님\n연락처: 010-1234-5678'
    );
  });

  it('나머지 태그는 제거한다', () => {
    expect(stripHtml('<div><strong>예약자명</strong>: 김손님</div>')).toBe('예약자명: 김손님');
  });

  it('흔한 HTML 엔티티를 복원한다', () => {
    expect(stripHtml('예약 &amp; 방문 &nbsp;확인')).toBe('예약 & 방문  확인');
  });

  it('앞뒤 공백을 정리한다', () => {
    expect(stripHtml('  <p>내용</p>  ')).toBe('내용');
  });
});
