// [롯데마트 문화센터 강좌 리스트 수집](2026-10-04) — parseRow() 단위 테스트.
// 실측 표본 그대로(2026-10-04 searchList.do 직접 호출, 응답 그대로 복사한 <tr>).
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'node-html-parser';
import { markFallenOutRowsAsUnavailable, parsePageInfo, parseRow } from './lottemart-culture-club.mjs';

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
      min_age_months: 13,
      max_age_months: 28,
      schedule_start_date: '2026-10-06',
      schedule_end_date: null,
      schedule_days_code: ['TUE'],
      round: null,
      total_sessions: 8,
      normalized_status: 'OPEN',
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

// [ping 배치용 버킷 건수 추출](2026-10-04) — lottemart-culture-club-ping.mjs가
// 이 함수로 접수가능/온라인마감/접수마감 3개 버킷 건수를 읽어 변화를 감지한다.
describe('lottemart-culture-club parsePageInfo', () => {
  it('실측 pageInfo 문자열에서 totalPage와 3개 버킷 건수를 전부 추출한다', () => {
    const html = '<input type="hidden" id="pageInfo" value="1|18|354|34|0|320">';
    expect(parsePageInfo(html)).toEqual({
      totalPage: 18,
      acceptTotalCnt: 34,
      onlnCloseTotalCnt: 0,
      acceptCloseTotalCnt: 320,
    });
  });

  it('pageInfo가 없으면(겨울학기 등 빈 응답) 전부 0으로 반환한다', () => {
    expect(parsePageInfo('')).toEqual({ totalPage: 1, acceptTotalCnt: 0, onlnCloseTotalCnt: 0, acceptCloseTotalCnt: 0 });
  });
});

// [수집 범위 축소 — search_reg_status=1만](2026-10-04 사용자 지시) —
// markFallenOutRowsAsUnavailable() 단위 테스트. 롯데마트에 추가 요청 없이
// 우리 DB끼리만 비교하는 함수라 Supabase 클라이언트를 모킹한다.
describe('markFallenOutRowsAsUnavailable', () => {
  function makeClient({ bookmarkedIds = [], bookableIds = [], updateError = null }) {
    const updateCalls = [];
    let selectCallCount = 0;

    const client = {
      from: vi.fn((table) => {
        if (table === 'user_bookmarks') {
          return {
            select: () => ({
              not: () =>
                Promise.resolve({
                  data: bookmarkedIds.map((id) => ({ culture_club_classes: { brand: 'lottemart', source_class_id: id } })),
                  error: null,
                }),
            }),
          };
        }
        // lottemart_culture_club_classes — select(페이지네이션 조회) 또는 update.
        return {
          select: () => ({
            in: () => ({
              in: () => ({
                range: () => {
                  selectCallCount += 1;
                  // 테스트 데이터가 작아 항상 1페이지에서 끝난다(길이 < PAGE_SIZE).
                  if (selectCallCount > 1) return Promise.resolve({ data: [], error: null });
                  return Promise.resolve({ data: bookableIds.map((id) => ({ class_id: id })), error: null });
                },
              }),
            }),
          }),
          update: (payload) => ({
            in: (_column, ids) => {
              updateCalls.push({ payload, ids });
              return Promise.resolve({ error: updateError });
            },
          }),
        };
      }),
    };
    return { client, updateCalls };
  }

  it('1번 버킷에서 빠진(신선하지 않은) 접수가능 행만 접수불가로 갱신한다', async () => {
    const { client, updateCalls } = makeClient({ bookableIds: ['a', 'b', 'c'] });

    const count = await markFallenOutRowsAsUnavailable(client, ['a'], ['455']);

    expect(count).toBe(2);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({ registration_status: '접수불가', normalized_status: 'CLOSED' });
    expect(updateCalls[0].ids.sort()).toEqual(['b', 'c']);
  });

  it('찜한 class_id는 빠졌어도 갱신하지 않는다(찜-상태감시가 더 정확히 추적 중)', async () => {
    const { client, updateCalls } = makeClient({ bookableIds: ['a', 'b'], bookmarkedIds: ['b'] });

    const count = await markFallenOutRowsAsUnavailable(client, [], ['455']);

    expect(count).toBe(1);
    expect(updateCalls[0].ids).toEqual(['a']);
  });

  it('신선한 목록에 전부 남아있으면 갱신하지 않는다', async () => {
    const { client, updateCalls } = makeClient({ bookableIds: ['a', 'b'] });

    const count = await markFallenOutRowsAsUnavailable(client, ['a', 'b'], ['455']);

    expect(count).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it('기존 접수가능 행 자체가 없으면 아무 것도 하지 않는다', async () => {
    const { client, updateCalls } = makeClient({ bookableIds: [] });

    const count = await markFallenOutRowsAsUnavailable(client, ['a'], ['455']);

    expect(count).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });
});
