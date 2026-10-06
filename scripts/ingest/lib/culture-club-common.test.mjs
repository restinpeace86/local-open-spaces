import { describe, expect, it } from 'vitest';
import { normalizeEmartStatus, normalizeLottemartStatus, parseInstructorFromTitle } from './culture-club-common.mjs';

describe('normalizeEmartStatus', () => {
  it('접수중은 OPEN이다', () => {
    expect(normalizeEmartStatus('접수중')).toBe('OPEN');
  });

  it('정원마감은 WAITING이다(취소 시 등록 가능)', () => {
    expect(normalizeEmartStatus('정원마감')).toBe('WAITING');
  });

  it('접수대기(오픈 전)는 CLOSED이다', () => {
    expect(normalizeEmartStatus('접수대기')).toBe('CLOSED');
  });

  it('접수마감은 CLOSED이다', () => {
    expect(normalizeEmartStatus('접수마감')).toBe('CLOSED');
  });
});

describe('normalizeLottemartStatus', () => {
  it('바로신청은 OPEN이다', () => {
    expect(normalizeLottemartStatus('바로신청')).toBe('OPEN');
  });

  it('대기자신청은 WAITING이다', () => {
    expect(normalizeLottemartStatus('대기자신청')).toBe('WAITING');
  });

  it.each(['접수마감', '전화문의', '현장접수', '접수불가'])('%s는 CLOSED이다', (status) => {
    expect(normalizeLottemartStatus(status)).toBe('CLOSED');
  });
});

describe('parseInstructorFromTitle', () => {
  it('"~선생님" 꼴에서 강사명을 추출한다(실측)', () => {
    expect(parseInstructorFromTitle('[트니트니] 은하수 선생님(15~24개월) 10:40')).toBe('은하수');
  });

  it('"- 호야 선생님" 처럼 구분자가 섞여 있어도 이름만 추출한다', () => {
    expect(parseInstructorFromTitle('[8주]10/8~11/26 [목 10:30] 트니트니플러스 - 호야 선생님 [15~24개월]A')).toBe('호야');
  });

  it('강사명 표기가 없으면 null을 반환한다', () => {
    expect(parseInstructorFromTitle('[8주] [일정변경] [특별가] (화) 13:00 대교 트니트니 오감올리 오감놀이 (8~15개월)')).toBeNull();
  });

  it('제목이 없으면 null을 반환한다', () => {
    expect(parseInstructorFromTitle(null)).toBeNull();
    expect(parseInstructorFromTitle('')).toBeNull();
  });
});
