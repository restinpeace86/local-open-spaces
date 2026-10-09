import { describe, expect, it } from 'vitest';
import { parseClassIntro } from './starfield-culture-club-detail.mjs';

// [스타필드 상세 페이지 구조 — 실측 확인](2026-10-09, /mlt/initLctrDetl.do
// ?lctrNo=L260912228&store=suwon 실제 응답에서 발췌한 최소 구조). 목록
// 응답엔 소개 텍스트가 전혀 없어 이 상세 페이지의 "클래스소개" 다음
// <div>에서만 가져올 수 있다. AK플라자와 달리 <table> 구조가 아니라
// node-html-parser가 정상 동작함을 실측으로 확인했다.
function wrapDetailHtml({ introText = '' } = {}) {
  return `<html><body>
    <div class="tab-contents" id="classDetailTabCont1">
      <h3 class="title-d1">클래스정보</h3>
      <div class="view-post">
        <div class="post-contents">
          <h4 class="title-d3">클래스소개</h4>
          <div>
            ${introText}
          </div>
        </div>
      </div>
    </div>
    <div>
      <h5 class="title-d3">강의경력</h5>
      <div>엉뚱한 다른 섹션 텍스트 — 이건 뽑히면 안 됨</div>
    </div>
  </body></html>`;
}

describe('parseClassIntro', () => {
  it('"클래스소개" 바로 다음 <div>의 텍스트를 가져온다', () => {
    const html = wrapDetailHtml({
      introText: '안녕하세요, 씨드앤그로우 입니다.😄<br/><br/>❤️작은 공간 안에 흙과 식물, 자연 소재를 차곡차곡 담아 나만의 작은 정원을 만들어봅니다.',
    });
    expect(parseClassIntro(html)).toBe(
      '안녕하세요, 씨드앤그로우 입니다.😄 ❤️작은 공간 안에 흙과 식물, 자연 소재를 차곡차곡 담아 나만의 작은 정원을 만들어봅니다.'
    );
  });

  it('다른 섹션("강의경력" 등)의 텍스트는 가져오지 않는다', () => {
    const html = wrapDetailHtml({ introText: '실제 소개' });
    expect(parseClassIntro(html)).not.toContain('엉뚱한 다른 섹션');
  });

  it('"클래스소개" 섹션 자체가 없으면 null', () => {
    expect(parseClassIntro('<html><body></body></html>')).toBeNull();
  });

  it('"클래스소개" 섹션이 있지만 내용이 빈 문자열이면 null', () => {
    const html = wrapDetailHtml({ introText: '' });
    expect(parseClassIntro(html)).toBeNull();
  });
});
