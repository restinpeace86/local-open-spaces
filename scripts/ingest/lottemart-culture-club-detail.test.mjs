// [롯데마트 문화센터 강좌 상세정보 수집](2026-10-04) — parseDetailInfoTable()
// 단위 테스트. 실측 표본 그대로(2026-10-04 courseview.do 직접 호출, 응답에서
// #lctInfo 표 영역만 그대로 복사).
import { describe, expect, it } from 'vitest';
import { parseDetailInfoTable } from './lottemart-culture-club-detail.mjs';

function wrapHtml(tableInner) {
  return `<html><body><div id="lctInfo" class="conts-box mt30">
    <h3>강좌정보</h3>
    <table class="view-table">
      <caption>강좌정보 표 - 강좌코드, 강의실, 강좌소개, 강좌 수강 Tip</caption>
      <tbody>${tableInner}</tbody>
    </table>
  </div></body></html>`;
}

const REAL_TABLE_INNER = `
  <tr>
    <th scope="row" class="col-th">강좌코드</th>
    <td style="width:*;">24010</td>
    <th scope="row" class="col-th">강의실</th>
    <td style="width:*;">본관 6층 신비한방</td>
  </tr>
  <tr>
    <th scope="row" class="th-align-t">강좌소개</th>
    <td colspan="3">
      뜨거운 여름, 랄랄라 코알라와 함께 즐길 준비 됐나요?
      <br/>여름학기에는 그야말로 스펙타클한 놀이들이 준비되어 있어요^^<br/>
      더운 여름에는 옷이 조금 젖어도 괜찮아요. 미역, 수박, 토마토 등 다양한 재료들로 신나게 여름을 즐겨요 ♥
    </td>
  </tr>
  <tr>
    <th scope="row" class="th-align-t">강좌 수강 Tip</th>
    <td colspan="3">
      [장점] 새로운 교구와 코스튬의 옷들이 돋보이는 수업이며, 후기가 많은 수업입니다.
      <br/>[포인트] 지역 內 인지도가 높은 수업입니다.
    </td>
  </tr>
`;

describe('parseDetailInfoTable', () => {
  it('강좌코드/강의실을 th-td 쌍으로 추출한다', () => {
    const result = parseDetailInfoTable(wrapHtml(REAL_TABLE_INNER));
    expect(result.classCode).toBe('24010');
    expect(result.classroom).toBe('본관 6층 신비한방');
  });

  it('강좌소개의 <br/>을 줄바꿈으로 보존한다', () => {
    const result = parseDetailInfoTable(wrapHtml(REAL_TABLE_INNER));
    expect(result.classIntro).toContain('뜨거운 여름, 랄랄라 코알라와 함께 즐길 준비 됐나요?');
    expect(result.classIntro).toContain('\n여름학기에는');
  });

  it('강좌 수강 Tip의 <br/>을 줄바꿈으로 보존한다', () => {
    const result = parseDetailInfoTable(wrapHtml(REAL_TABLE_INNER));
    expect(result.classTip).toBe(
      '[장점] 새로운 교구와 코스튬의 옷들이 돋보이는 수업이며, 후기가 많은 수업입니다.\n[포인트] 지역 內 인지도가 높은 수업입니다.'
    );
  });

  it('#lctInfo 테이블이 없으면 전부 null을 반환한다', () => {
    const result = parseDetailInfoTable('<html><body>다른 페이지</body></html>');
    expect(result).toEqual({ classCode: null, classroom: null, classIntro: null, classTip: null });
  });
});
