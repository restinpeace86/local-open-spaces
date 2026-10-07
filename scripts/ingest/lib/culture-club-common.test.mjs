import { describe, expect, it } from 'vitest';
import { normalizeEmartStatus, normalizeLottemartStatus, parseInstructorFromTitle, stampCollectedAt, mergeDetailEnrichment } from './culture-club-common.mjs';

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

describe('stampCollectedAt', () => {
  it('모든 행에 같은 collected_at 값을 덧붙인다(기존 필드는 유지)', () => {
    const rows = [{ class_id: 'a' }, { class_id: 'b' }];
    const result = stampCollectedAt(rows, '2026-10-07T00:00:00.000Z');
    expect(result).toEqual([
      { class_id: 'a', collected_at: '2026-10-07T00:00:00.000Z' },
      { class_id: 'b', collected_at: '2026-10-07T00:00:00.000Z' },
    ]);
  });

  it('이미 collected_at이 있던 행도 새 값으로 덮어쓴다(매 실행마다 최신으로 갱신)', () => {
    const rows = [{ class_id: 'a', collected_at: '2026-10-03T00:00:00.000Z' }];
    const result = stampCollectedAt(rows, '2026-10-07T00:00:00.000Z');
    expect(result[0].collected_at).toBe('2026-10-07T00:00:00.000Z');
  });
});

describe('mergeDetailEnrichment', () => {
  it('class_id가 일치하는 상세정보(이미지 등)를 행에 합친다(2026-10-07 — 통합 테이블에서 이미지/소개가 사라지던 버그 수정, 이마트/롯데마트 공통)', () => {
    const rows = [{ class_id: 'a', class_title: '제목' }];
    const enrichmentByClassId = new Map([['a', { class_id: 'a', main_image_key: 'classImages/x', detail_fetched_at: '2026-10-03T00:00:00Z' }]]);

    const result = mergeDetailEnrichment(rows, enrichmentByClassId);

    expect(result[0].main_image_key).toBe('classImages/x');
    expect(result[0].class_title).toBe('제목');
  });

  it('상세정보가 아직 없는(detail_fetched_at이 null인) 강좌는 원본 행을 그대로 둔다', () => {
    const rows = [{ class_id: 'b', class_title: '제목2' }];
    const result = mergeDetailEnrichment(rows, new Map());

    expect(result[0]).toEqual({ class_id: 'b', class_title: '제목2' });
  });
});
