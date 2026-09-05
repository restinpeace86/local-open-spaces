import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CURATION_BADGE_OPTIONS, highlightKeywords, isKnownCurationBadgeKey } from './curation-badges';

// [관리자용 블로그 큐레이션 모달](2026-09-05 사용자 지시, Decision 021) 단위 테스트.
describe('CURATION_BADGE_OPTIONS', () => {
  // 사용자 요구사항 원문은 "다중 선택 11개"라 썼지만 실제로 나열한 항목은 12개다 —
  // 어느 항목을 뺄지 추측하지 않고 실제로 나열된 12개를 그대로 구현했다(구현
  // 기록에 정직하게 남김). 이 테스트는 그 12개가 정확히 존재하는지 고정한다.
  it('사용자가 나열한 12개 뱃지가 정확히 존재한다', () => {
    expect(CURATION_BADGE_OPTIONS).toHaveLength(12);
    expect(CURATION_BADGE_OPTIONS.map((o) => o.label)).toEqual([
      '주차 완비',
      '유모차 가능',
      '수유실 있음',
      '기저귀 갈이대',
      '아기의자',
      '유아 식기',
      '키즈 메뉴',
      '좌식/온돌 있음',
      '룸/개별 공간 있음',
      '키즈존/놀이방',
      '야외 마당/테라스',
      '예약 필수',
    ]);
  });

  it('4개 그룹(이동/편의, 식사/아기, 공간/놀이, 운영)으로 나뉜다', () => {
    const groupCounts = CURATION_BADGE_OPTIONS.reduce<Record<string, number>>((acc, o) => {
      acc[o.group] = (acc[o.group] ?? 0) + 1;
      return acc;
    }, {});
    expect(groupCounts).toEqual({ '이동/편의': 4, '식사/아기': 5, '공간/놀이': 2, 운영: 1 });
  });

  it('isKnownCurationBadgeKey는 실제 키만 true를 반환한다', () => {
    expect(isKnownCurationBadgeKey('parking')).toBe(true);
    expect(isKnownCurationBadgeKey('완전히새로운키')).toBe(false);
  });
});

// [핵심 기능: 자동 형광펜 하이라이팅](사용자 지시 원문): "핵심 뱃지 관련 키워드들에
// 자동으로 노란색 배경 형광펜 마킹(<mark>)이 적용되도록.."
describe('highlightKeywords', () => {
  it('키워드를 <mark>로 감싼다', () => {
    const { container } = render(<div>{highlightKeywords('여기는 주차장이 넓고 유모차도 편해요')}</div>);
    const marks = container.querySelectorAll('mark');
    expect(Array.from(marks).map((m) => m.textContent)).toEqual(['주차장', '유모차']);
  });

  it('노란색 배경(#fef08a)이 인라인 스타일로 적용된다', () => {
    const { container } = render(<div>{highlightKeywords('수유실 있어요')}</div>);
    const mark = container.querySelector('mark')!;
    expect(mark.style.backgroundColor).toBe('rgb(254, 240, 138)'); // #fef08a
  });

  it('긴 키워드를 우선 매칭한다("유모차반입"이 "유모차"에 가려 잘리지 않음)', () => {
    const { container } = render(<div>{highlightKeywords('유모차반입 가능합니다')}</div>);
    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('유모차반입');
  });

  it('매칭 키워드가 없으면 원문 그대로 렌더링된다', () => {
    const { container } = render(<div>{highlightKeywords('평범한 문장입니다')}</div>);
    expect(container.querySelectorAll('mark')).toHaveLength(0);
    expect(container.textContent).toBe('평범한 문장입니다');
  });

  it('빈 문자열이면 그대로 반환한다(에러 없음)', () => {
    const { container } = render(<div>{highlightKeywords('')}</div>);
    expect(container.textContent).toBe('');
  });
});
