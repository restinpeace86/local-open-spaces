import { describe, expect, it } from 'vitest';
import { parseClassIntro, parseDetailHtml, parseDotDateRange, parseLeadingNumber } from './eland-retail-culture-club-detail.mjs';
import { parse } from 'node-html-parser';

describe('parseDotDateRange', () => {
  it('"YYYY.MM.DD~YYYY.MM.DD"를 파싱한다', () => {
    expect(parseDotDateRange('2026.12.07~2027.02.22')).toEqual({ startDate: '2026-12-07', endDate: '2027-02-22' });
  });
  it('형식이 다르면 둘 다 null', () => {
    expect(parseDotDateRange(null)).toEqual({ startDate: null, endDate: null });
  });
});

describe('parseLeadingNumber', () => {
  it('"15명"에서 15를 가져온다', () => {
    expect(parseLeadingNumber('15명')).toBe(15);
  });
  it('"40000원"에서 40000을 가져온다', () => {
    expect(parseLeadingNumber('40000원')).toBe(40000);
  });
  it('숫자가 없으면 null', () => {
    expect(parseLeadingNumber(null)).toBeNull();
  });
});

// [실측 확인된 상세 페이지 구조](2026-10-09, storeid=8222&semnum=66&
// lectypeid=B&seq=36 실제 응답에서 발췌한 최소 구조).
function wrapDetailHtml({ introBody = '실제 소개' } = {}) {
  return `<html><body>
    <table>
      <tbody>
        <tr><th scope="row">지점명</th><td>부천</td></tr>
        <tr><th scope="row">카테고리(코드)</th><td>B36</td></tr>
        <tr><th scope="row">강사명</th><td>전문강사</td></tr>
        <tr><th scope="row">강의실</th><td>키즈룸</td></tr>
        <tr><th scope="row">강좌기간</th><td>2026.12.07~2027.02.22</td></tr>
        <tr><th scope="row">요일/시간</th><td>월요일 / 13:50~14:30</td></tr>
        <tr><th scope="row">전체정원</th><td>15명</td></tr>
        <tr><th scope="row">수강료</th><td>77000원</td></tr>
        <tr><th scope="row">재료비</th><td>40000원</td></tr>
        <tr><th scope="row">교재비</th><td>0원</td></tr>
        <tr><th scope="row">첫 시간 준비물</th><td>없음</td></tr>
      </tbody>
    </table>
    <details class="comm-togg"><summary>강좌개요</summary>${introBody}</details>
  </body></html>`;
}

describe('parseClassIntro', () => {
  it('"강좌개요" summary 다음 본문 텍스트를 가져온다(summary 자체 텍스트는 제외)', () => {
    const root = parse(wrapDetailHtml({ introBody: '동화촉감놀이 당나귀똥 전문강사 이정민' }));
    expect(parseClassIntro(root)).toBe('동화촉감놀이 당나귀똥 전문강사 이정민');
  });

  it('"강좌개요" 섹션이 없으면 null', () => {
    const root = parse('<html><body></body></html>');
    expect(parseClassIntro(root)).toBeNull();
  });
});

describe('parseDetailHtml — 실측 샘플 전체 파싱', () => {
  it('th/td 전부를 정확히 구조화된 필드로 변환한다', () => {
    const html = wrapDetailHtml({ introBody: '실제 강좌 소개' });
    expect(parseDetailHtml(html)).toEqual({
      classroom: '키즈룸',
      schedule_start_date: '2026-12-07',
      schedule_end_date: '2027-02-22',
      capacity: 15,
      class_material_fee: 40000,
      textbook_fee: 0,
      first_class_supplies: '없음',
      class_intro: '실제 강좌 소개',
    });
  });
});
