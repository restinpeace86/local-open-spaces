import { describe, expect, it } from 'vitest';
import { mergeGroupArrayField } from './2026-09-28-backfill-dedup-group-excluded-weekdays.mjs';

// [어린이도서관 중복 스팟 그룹 — 정기휴관일 통합](2026-09-28 사용자 지시) — "둘중
// 하나가 값이 있으면 있는것 기준으로 통합"이 정확히 동작하는지, 진짜 충돌(서로 다른
// 값)은 추측으로 합치지 않는지 검증한다.
describe('mergeGroupArrayField', () => {
  it('한 멤버만 값을 가지면 그 값을 반환한다', () => {
    const rows = [
      { excluded_weekdays: null },
      { excluded_weekdays: ['MON'] },
    ];
    expect(mergeGroupArrayField(rows, 'excluded_weekdays')).toEqual({ value: ['MON'], conflict: false });
  });

  it('여러 멤버가 같은 값을 가지면(순서 달라도) 그 값을 반환한다', () => {
    const rows = [
      { excluded_weekdays: ['FRI'] },
      { excluded_weekdays: null },
      { excluded_weekdays: ['FRI'] },
    ];
    expect(mergeGroupArrayField(rows, 'excluded_weekdays')).toEqual({ value: ['FRI'], conflict: false });
  });

  it('아무도 값이 없으면 null(채울 근거 없음)', () => {
    const rows = [{ excluded_weekdays: null }, { excluded_weekdays: null }];
    expect(mergeGroupArrayField(rows, 'excluded_weekdays')).toEqual({ value: null, conflict: false });
  });

  it('서로 다른 값이 섞여 있으면(진짜 충돌) 추측으로 합치지 않는다', () => {
    const rows = [{ excluded_weekdays: ['MON'] }, { excluded_weekdays: ['TUE'] }];
    expect(mergeGroupArrayField(rows, 'excluded_weekdays')).toEqual({ value: null, conflict: true });
  });

  it('excluded_nth_weekdays 필드에도 동일하게 동작한다', () => {
    const rows = [{ excluded_nth_weekdays: ['2-MON', '4-MON'] }, { excluded_nth_weekdays: null }];
    expect(mergeGroupArrayField(rows, 'excluded_nth_weekdays')).toEqual({ value: ['2-MON', '4-MON'], conflict: false });
  });
});
