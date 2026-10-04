// [롯데마트 문화센터 강좌 리스트 수집](2026-10-04) — parseRow() 단위 테스트.
// 실측 표본 그대로(2026-10-04 searchList.do 직접 호출, 응답 그대로 복사한 <tr>).
import { describe, expect, it } from 'vitest';
import { parse } from 'node-html-parser';
import { parseRow } from './lottemart-culture-club.mjs';

const CONTEXT = {
  storeCode: '455',
  storeName: '고양점',
  targetCode: '4',
  targetName: '엄마와함께',
  semesterCode: '202603',
};

function trFromHtml(html) {
  return parse(`<table><tbody>${html}</tbody></table>`).querySelector('tr');
}

// 재료비 포함 + 바로신청(실측: 2026-10-04 store=455 target=4)
const TR_MATERIAL_FEE = `
<tr>
  <td class="align-l dis-first">
    <div class="info-ico">
      <em class="ico_sale" style="background-color: #ff8c00  ">재료비 40,000원 포함</em>
    </div>
    <div class="info-txt">
      <a href="#none" onclick="fn_clsView('20260345522022')">
        <span>[고양점]</span>
        [8주]미술이랑 음악이랑 &#034;춤추는 팔레트&#034;
      </a>
      <p>영아강좌 > 미술 통합 퍼포먼스</p>
      <p>13~28개월</p>
    </div>
    <ul class="table-tit-list">
      <li class="dis-block dis-tablet">강사명 : 이정연 / 개강일 : 2026.10.06</li>
      <li class="bg-none dis-block dis-tablet">요일 / 시간 : (화) 11:00~11:40</li>
      <li class="bg-none dis-block dis-tablet">수강료 : 8회 96,000원</li>
      <li class="bg-none dis-block dis-last td-status">
        <a href="#none" onclick="fn_courseApp('20260345522022', 'T', '455');" class="btn-status">바로신청</a>
        <a href="#none" onclick="fn_courseCart('20260345522022', 'T');" class="btn-cart" title="강좌바구니에 담기">강좌바구니에 담기</a>
      </li>
    </ul>
  </td>
</tr>`;

// 할인 + 마감임박 뱃지 동시 존재, like_count 1 (실측: 2026-10-04)
const TR_DISCOUNT_AND_CLOSING_SOON = `
<tr>
  <td class="align-l dis-first">
    <div class="info-ico">
      <em class="ico_sale">40% 할인</em>
      <em class="ico_hit">마감임박</em>
    </div>
    <div class="info-txt">
      <a href="#none" onclick="fn_clsView('20260345522010')">
        <span>[고양점]</span>
        오감 파레트팡 퍼포먼스 미술
      </a>
      <p>영아강좌 > 미술 통합 퍼포먼스</p>
      <p>24~38개월</p>
      <div class="like-this"><strong>1</strong></div>
    </div>
    <ul class="table-tit-list">
      <li class="dis-block dis-tablet">강사명 : 임효진 / 개강일 : 2026.09.05</li>
      <li class="bg-none dis-block dis-tablet">요일 / 시간 : (토) 10:30~11:10</li>
      <li class="bg-none dis-block dis-tablet">수강료 : 11회 137,500원 82,500원</li>
      <li class="bg-none dis-block dis-last td-status">
        <a href="#none" onclick="fn_fieldCnsl('close');" class="btn-status finish">접수마감</a>
        <a href="#none" onclick="fn_courseCart('20260345522010', 'T');" class="btn-cart" title="강좌바구니에 담기">강좌바구니에 담기</a>
      </li>
    </ul>
  </td>
</tr>`;

// 접수마감(비활성 라벨) + 대기자 신청(활성 버튼) 동시 존재 (실측: 2026-10-04)
const TR_CLOSED_WITH_WAITLIST = `
<tr>
  <td class="align-l dis-first">
    <div class="info-ico"></div>
    <div class="info-txt">
      <a href="#none" onclick="fn_clsView('20260345524010')">
        <span>[고양점]</span>
        [8주]랄랄라 코알라
      </a>
      <p>영아강좌 > 오감자극</p>
      <p>5~9개월</p>
    </div>
    <ul class="table-tit-list">
      <li class="dis-block dis-tablet">강사명 : 문화센터 / 개강일 : 2026.09.03</li>
      <li class="bg-none dis-block dis-tablet">요일 / 시간 : (목) 11:20~12:00</li>
      <li class="bg-none dis-block dis-tablet">수강료 : 12회 140,000원 91,000원</li>
      <li class="bg-none dis-block dis-last td-status">
        <a href="#none" onclick="fn_fieldCnsl('close');" class="btn-status finish">접수마감</a>
        <a href="#none" onclick="fn_waitAppPopOpen('고양점', '20260345524010', '[8주]랄랄라 코알라 ', '2026.10.08 ~ 2026.11.26', '문화센터')" class="btn-status ">대기자 신청</a>
        <a href="#none" onclick="fn_courseCart('20260345524010', 'T');" class="btn-cart" title="강좌바구니에 담기">강좌바구니에 담기</a>
      </li>
    </ul>
  </td>
</tr>`;

// 현장접수 (실측: 2026-10-04, 60개 지점 전수 스캔 15,101행 중 14건 발견 —
// onclick 자체가 없어 텍스트로만 판별 가능)
const TR_ONSITE_ONLY = `
<tr>
  <td class="align-l dis-first">
    <div class="info-ico"></div>
    <div class="info-txt">
      <a href="#none" onclick="fn_clsView('20260346537541')">
        <span>[송도점]</span>
        테스트 현장접수 강좌
      </a>
      <p>유아강좌 > 신체건강</p>
    </div>
    <ul class="table-tit-list">
      <li class="dis-block dis-tablet">강사명 : 박현장 / 개강일 : 2026.09.20</li>
      <li class="bg-none dis-block dis-tablet">요일 / 시간 : (금) 10:00~10:40</li>
      <li class="bg-none dis-block dis-tablet">수강료 : 8회 70,000원</li>
      <li class="bg-none dis-block dis-last td-status">
        <a href="#none" id="" class="btn-status">현장접수</a>
        <a href="#none" onclick="fn_courseCart('20260346537541', 'F');" class="btn-cart" title="강좌바구니에 담기">강좌바구니에 담기</a>
      </li>
    </ul>
  </td>
</tr>`;

// 전화문의 (실측: 2026-10-04)
const TR_PHONE_INQUIRY = `
<tr>
  <td class="align-l dis-first">
    <div class="info-ico"></div>
    <div class="info-txt">
      <a href="#none" onclick="fn_clsView('20260345524022')">
        <span>[고양점]</span>
        테스트 전화문의 강좌
      </a>
      <p>영아강좌 > 오감자극</p>
    </div>
    <ul class="table-tit-list">
      <li class="dis-block dis-tablet">강사명 : 홍길동 / 개강일 : 2026.09.10</li>
      <li class="bg-none dis-block dis-tablet">요일 / 시간 : (수) 09:00~09:40</li>
      <li class="bg-none dis-block dis-tablet">수강료 : 10회 100,000원</li>
      <li class="bg-none dis-block dis-last td-status">
        <a href="#none" onclick="fn_fieldCnsl('');" class="btn-status">전화문의</a>
        <a href="#none" onclick="fn_courseCart('20260345524022', 'T');" class="btn-cart" title="강좌바구니에 담기">강좌바구니에 담기</a>
      </li>
    </ul>
  </td>
</tr>`;

describe('lottemart-culture-club parseRow', () => {
  it('재료비 뱃지 + 바로신청 행을 올바르게 변환한다', () => {
    const row = parseRow(trFromHtml(TR_MATERIAL_FEE), CONTEXT);
    expect(row).toEqual({
      class_id: '20260345522022',
      class_title: '[8주]미술이랑 음악이랑 "춤추는 팔레트"',
      store_code: '455',
      store_name: '고양점',
      main_category_name: '영아강좌',
      sub_category_name: '미술 통합 퍼포먼스',
      age_range_text: '13~28개월',
      instructor_name: '이정연',
      class_day: ['화'],
      start_time: '11:00',
      end_time: '11:40',
      class_start_date: '20261006',
      session_count: 8,
      class_original_fee: null,
      class_fee: 96000,
      class_material_fee: 40000,
      discount_badge_text: null,
      is_closing_soon: false,
      is_new: false,
      like_count: null,
      registration_status: '바로신청',
      semester_code: '202603',
      target_code: '4',
      target_name: '엄마와함께',
    });
  });

  it('할인 뱃지 + 마감임박 뱃지가 동시에 있으면 둘 다 반영한다(접수마감 상태)', () => {
    const row = parseRow(trFromHtml(TR_DISCOUNT_AND_CLOSING_SOON), CONTEXT);
    expect(row.class_original_fee).toBe(137500);
    expect(row.class_fee).toBe(82500);
    expect(row.discount_badge_text).toBe('40% 할인');
    expect(row.is_closing_soon).toBe(true);
    expect(row.like_count).toBe(1);
    expect(row.registration_status).toBe('접수마감');
  });

  it('접수마감 라벨과 대기자 신청 버튼이 동시에 있으면 실제 신청 가능한 대기자신청을 채택한다', () => {
    const row = parseRow(trFromHtml(TR_CLOSED_WITH_WAITLIST), CONTEXT);
    expect(row.registration_status).toBe('대기자신청');
    expect(row.class_original_fee).toBe(140000);
    expect(row.class_fee).toBe(91000);
  });

  it('현장접수(onclick 없음, 텍스트만 존재)를 접수마감과 구분해 인식한다', () => {
    const row = parseRow(trFromHtml(TR_ONSITE_ONLY), CONTEXT);
    expect(row.registration_status).toBe('현장접수');
    expect(row.class_fee).toBe(70000);
  });

  it('전화문의 상태를 접수마감과 구분해 인식한다', () => {
    const row = parseRow(trFromHtml(TR_PHONE_INQUIRY), CONTEXT);
    expect(row.registration_status).toBe('전화문의');
    expect(row.age_range_text).toBeNull();
    expect(row.class_original_fee).toBeNull();
    expect(row.class_fee).toBe(100000);
  });

  it('<img> 태그를 전제하지 않는다(목록 응답에 썸네일이 없음을 실측 확인)', () => {
    const row = parseRow(trFromHtml(TR_MATERIAL_FEE), CONTEXT);
    expect(row).not.toHaveProperty('image_url');
  });

  it('class_id를 못 찾으면 null을 반환한다', () => {
    const tr = trFromHtml('<tr><td class="align-l dis-first"><div class="info-txt"></div></td></tr>');
    expect(parseRow(tr, CONTEXT)).toBeNull();
  });
});
