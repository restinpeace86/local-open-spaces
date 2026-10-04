// [찜한 롯데마트 강좌 상태 변화 알림](2026-10-04) — parseDetailPageStatus()와
// isNewlyActionable() 단위 테스트. 실측 표본 그대로(2026-10-04 courseview.do
// 직접 호출, 응답에서 상태 버튼 영역만 그대로 복사).
import { describe, expect, it } from 'vitest';
import { isNewlyActionable, parseDetailPageStatus } from './lottemart-culture-club-status-watch.mjs';

function wrapHtml(buttonHtml) {
  return `<html><body><div class="btn-area">
    <a href="#none" onclick="fn_addWish('X', 'Y', 'Z');" class="btn btn-w">찜하기</a>
    <a href="#none" onclick="fn_courseCart('X', 'T');" class="btn btn-w bd-r">강좌바구니</a>
    ${buttonHtml}
  </div></body></html>`;
}

describe('parseDetailPageStatus', () => {
  it('바로신청(fn_courseApp)을 인식한다', () => {
    const html = wrapHtml(`<a href="#none" onclick="fn_courseApp('X', 'Z', 'T');" class="btn btn-status-red">바로신청</a>`);
    expect(parseDetailPageStatus(html)).toBe('바로신청');
  });

  it('대기자신청(fn_waitAppPopOpen)을 인식한다', () => {
    const html = wrapHtml(
      `<a href="#none" onclick="fn_waitAppPopOpen('고양점', 'X', '제목', '2026.10.08 ~ 2026.11.26', '문화센터')" class="btn  btn-status-red">대기자 신청</a>`
    );
    expect(parseDetailPageStatus(html)).toBe('대기자신청');
  });

  it('접수마감(fn_fieldCnsl(close), finish 접미사)을 인식한다', () => {
    const html = wrapHtml(`<a href="#none" onclick="fn_fieldCnsl('close');" class="btn btn-status-red finish">접수마감</a>`);
    expect(parseDetailPageStatus(html)).toBe('접수마감');
  });

  it('전화문의(fn_fieldCnsl(빈 문자열))를 인식한다', () => {
    const html = wrapHtml(`<a href="#none" onclick="fn_fieldCnsl('');" class="btn btn-status-red">전화문의</a>`);
    expect(parseDetailPageStatus(html)).toBe('전화문의');
  });

  it('현장접수(onclick 없음, 텍스트만)를 인식한다', () => {
    const html = wrapHtml(`<a href="#none" class="btn btn-status-red">현장접수</a>`);
    expect(parseDetailPageStatus(html)).toBe('현장접수');
  });

  it('상태 버튼이 아예 없으면 접수마감으로 처리한다(안전한 기본값)', () => {
    const html = wrapHtml('');
    expect(parseDetailPageStatus(html)).toBe('접수마감');
  });
});

describe('isNewlyActionable', () => {
  it('접수마감 → 바로신청은 알림 대상이다', () => {
    expect(isNewlyActionable('접수마감', '바로신청')).toBe(true);
  });

  it('전화문의 → 대기자신청은 알림 대상이다', () => {
    expect(isNewlyActionable('전화문의', '대기자신청')).toBe(true);
  });

  it('현장접수 → 바로신청은 알림 대상이다', () => {
    expect(isNewlyActionable('현장접수', '바로신청')).toBe(true);
  });

  it('바로신청 → 접수마감(악화)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable('바로신청', '접수마감')).toBe(false);
  });

  it('전화문의 → 접수마감(둘 다 불가 상태끼리 전환)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable('전화문의', '접수마감')).toBe(false);
  });

  it('대기자신청 → 바로신청(둘 다 이미 가능 상태끼리 전환)은 알림 대상이 아니다', () => {
    expect(isNewlyActionable('대기자신청', '바로신청')).toBe(false);
  });
});
