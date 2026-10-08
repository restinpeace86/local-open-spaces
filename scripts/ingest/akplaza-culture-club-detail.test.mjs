import { describe, expect, it } from 'vitest';
import { parseClassIntro } from './akplaza-culture-club-detail.mjs';

// [AK플라자 상세 페이지 구조 — 실측 확인](2026-10-09, /course/detail?
// store=04&main_cd=3&sSubject_cd=835566 실제 응답에서 발췌한 최소 구조).
// 목록 응답엔 소개 텍스트가 전혀 없어 이 상세 페이지의 #lect_info 셀에서만
// 가져올 수 있다. 썸네일 이미지 블록은 사이트 자체가 "<!-- 썸네일 임시제거
// -->" 주석으로 꺼둔 상태라 상세 페이지에 이미지가 전혀 없다(그래서 이
// 스크립트는 이미지를 파싱하지 않는다 — akplaza-culture-club.mjs 참고).
function wrapDetailHtml({ lectInfoHtml = '' } = {}) {
  return `<html><body>
    <div class="cour-detop table">
      <table class="table01">
        <tbody>
          <tr><th>지점</th><td>평택점</td><th>강의시간</th><td>토 (17:00~18:30)</td></tr>
        </tbody>
      </table>
    </div>
    <div class="tab-cont">
      <div class="active">
        <table class="table01">
          <tbody>
            <tr><th>강사명</th><td id="lecturer_nm">최지승</td></tr>
            <tr><th>강좌&nbsp;소개</th><td id="lect_info">${lectInfoHtml}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </body></html>`;
}

describe('parseClassIntro', () => {
  it('#lect_info 셀의 텍스트를 가져온다(&nbsp; 등 공백 정리)', () => {
    const html = wrapDetailHtml({ lectInfoHtml: '수업&nbsp;목표<br/>본&nbsp;수업은&nbsp;오케스트라&nbsp;합주&nbsp;활동을&nbsp;통해...' });
    expect(parseClassIntro(html)).toBe('수업 목표 본 수업은 오케스트라 합주 활동을 통해...');
  });

  it('다른 셀(강사명 등)의 텍스트는 가져오지 않는다', () => {
    const html = wrapDetailHtml({ lectInfoHtml: '실제 소개' });
    expect(parseClassIntro(html)).not.toContain('최지승');
  });

  it('#lect_info가 아예 없으면 null(추측으로 지어내지 않음)', () => {
    expect(parseClassIntro('<html><body></body></html>')).toBeNull();
  });

  it('#lect_info가 있지만 내용이 빈 문자열이면 null', () => {
    const html = wrapDetailHtml({ lectInfoHtml: '' });
    expect(parseClassIntro(html)).toBeNull();
  });

  // [실측 회귀 테스트 — node-html-parser 대신 정규식을 쓰게 된 이유]
  // (2026-10-09) 674건 실제 수집을 돌려보니 class_intro가 전부 null로
  // 저장되는 조용한 실패가 있었다 — node-html-parser가 이 페이지의
  // <table>/<tr>/<td>를 단 하나도 파싱하지 못했기 때문(root.querySelectorAll
  // ('table').length === 0으로 실측 확인, div/span은 정상 파싱됨 — 이
  // 라이브러리의 table 파싱 자체 문제로 보이며 태그 밸런스는 정상이었다).
  // 실제 프로덕션 응답(store=02, sSubject_cd=835467)에서 그대로 발췌한
  // 샘플로 회귀를 방지한다.
  it('실제 프로덕션 응답 샘플(2026-10-09, store=02/sSubject_cd=835467)을 정확히 파싱한다', () => {
    const html = `<html><body>
      <div class="cour-detop table">
        <table class="table01"><tbody><tr><th>지점</th><td>수원점</td></tr></tbody></table>
      </div>
      <div class="cour-debot tab">
        <div class="tab-cont">
          <div class="active">
            <table class="table01">
              <tbody>
                <tr><th>강사명</th><td id="lecturer_nm">박영미</td></tr>
                <tr><th>강좌&nbsp;소개</th><td id="lect_info">※&nbsp;가을학기&nbsp;정규강좌&nbsp;중간부터&nbsp;참여하여&nbsp;7회&nbsp;수강하시는&nbsp;점&nbsp;참고&nbsp;부탁드립니다.<br/>※&nbsp;8회&nbsp;미만&nbsp;수업에는&nbsp;모든&nbsp;할인이&nbsp;불가합니다.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </body></html>`;
    expect(parseClassIntro(html)).toBe(
      '※ 가을학기 정규강좌 중간부터 참여하여 7회 수강하시는 점 참고 부탁드립니다. ※ 8회 미만 수업에는 모든 할인이 불가합니다.'
    );
  });
});
