import { describe, expect, it } from 'vitest';
import { parseClassIntro, parseMainImageUrl } from './shinsegae-culture-club-detail.mjs';

// [신세계 아카데미 상세 페이지 구조 — 실측 확인](2026-10-08, HP0010P0/
// HP0010P1.do?yearCode=2026&smstCode=S3&storeCode=03&lectCode=T2694782
// 실제 응답에서 발췌한 최소 구조). 목록 응답엔 이미지/소개가 전혀 없어
// 이 상세 페이지에서만 채울 수 있다(사용자 지시: "강의 상세내용도
// 긁어오는거지? 그리고 이미지도 마찬가지고?").
function wrapDetailHtml({ imgHtml = '', introHtml = '' } = {}) {
  return `<html><body>
    <div class="detail_form1">
      <div class="slider-for mb10">
        <div>${imgHtml}</div>
      </div>
      <div class="slider-nav mb50">
        <div><img alt="썸네일" src="/sdotcom/uploads/images/bl/291_thumb.png"/></div>
      </div>
    </div>
    <h3 class="skip subtitle s17 mb15">강좌소개</h3>
    <ul class="mb30">
      ${introHtml}
    </ul>
    <h3 class="skip subtitle s48 mb15">수강 신청 및 취소 환불 안내</h3>
    <ul class="mb30"><p>엉뚱한 다른 섹션 텍스트 — 이건 뽑히면 안 됨</p></ul>
  </body></html>`;
}

describe('parseMainImageUrl', () => {
  it('.slider-for 안의 메인 이미지(상대경로)에 도메인을 붙여 절대 URL로 만든다(실측: 서버가 겹친 "//"도 그대로 200을 반환해 임의로 고치지 않는다)', () => {
    const html = wrapDetailHtml({ imgHtml: '<img alt="291.png" src="/sdotcom/uploads/images/bl//291_20260717041957.png"/>' });
    expect(parseMainImageUrl(html)).toBe('https://sacademy.shinsegae.com/sdotcom/uploads/images/bl//291_20260717041957.png');
  });

  it('.slider-nav(썸네일) 쪽 이미지는 가져오지 않는다(.slider-for로 범위 한정)', () => {
    const html = wrapDetailHtml({ imgHtml: '' });
    expect(parseMainImageUrl(html)).toBeNull();
  });

  it('이미지가 아예 없으면 null(추측으로 지어내지 않음)', () => {
    expect(parseMainImageUrl('<html><body></body></html>')).toBeNull();
  });
});

describe('parseClassIntro', () => {
  it('"강좌소개" 바로 다음 <ul> 안의 <p> 텍스트를 가져온다', () => {
    const html = wrapDetailHtml({
      introHtml: '<p>매일 밥 대신 과자, 사탕, 초콜릿을 먹으며... <br /><br />※ 2022년생 이상 자녀를 동반한 가족에 한해 참여 가능합니다. </p>',
    });
    expect(parseClassIntro(html)).toBe('매일 밥 대신 과자, 사탕, 초콜릿을 먹으며... ※ 2022년생 이상 자녀를 동반한 가족에 한해 참여 가능합니다.');
  });

  it('"수강 신청 및 취소 환불 안내" 같은 다른 섹션의 텍스트는 가져오지 않는다', () => {
    const html = wrapDetailHtml({ introHtml: '<p>실제 소개</p>' });
    expect(parseClassIntro(html)).not.toContain('엉뚱한 다른 섹션');
  });

  it('"강좌소개" 섹션 자체가 없으면 null', () => {
    expect(parseClassIntro('<html><body></body></html>')).toBeNull();
  });
});
