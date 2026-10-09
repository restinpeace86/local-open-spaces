import { describe, expect, it } from 'vitest';
import {
  LOTTE_DEPARTMENT_LARGE_CATEGORY_LABELS,
  getTotalCount,
  looksLikeDetailBotBlocked,
  looksLikeListBotBlocked,
  normalizeLotteDepartmentStatus,
  parseLectureListResponse,
} from './lotte-department-culture-club-parser.mjs';

describe('LOTTE_DEPARTMENT_LARGE_CATEGORY_LABELS', () => {
  it('2=영유아/3=아동으로 확정된 라벨을 갖는다(1=성인은 수집 범위 밖)', () => {
    expect(LOTTE_DEPARTMENT_LARGE_CATEGORY_LABELS[2]).toBe('영유아');
    expect(LOTTE_DEPARTMENT_LARGE_CATEGORY_LABELS[3]).toBe('아동');
  });
});

describe('normalizeLotteDepartmentStatus — 실측 확인된 뱃지 라벨 7종', () => {
  it('접수중은 OPEN', () => {
    expect(normalizeLotteDepartmentStatus('접수중')).toBe('OPEN');
  });
  it('대기접수는 WAITING', () => {
    expect(normalizeLotteDepartmentStatus('대기접수')).toBe('WAITING');
  });
  it('나머지(접수예정/접수마감/접수불가/강의종료/지점문의)는 안전하게 CLOSED', () => {
    expect(normalizeLotteDepartmentStatus('접수예정')).toBe('CLOSED');
    expect(normalizeLotteDepartmentStatus('접수마감')).toBe('CLOSED');
    expect(normalizeLotteDepartmentStatus('접수불가')).toBe('CLOSED');
    expect(normalizeLotteDepartmentStatus('강의종료')).toBe('CLOSED');
    expect(normalizeLotteDepartmentStatus('지점문의')).toBe('CLOSED');
  });
});

// [봇 차단/정책 변경 의심 감지 — list/detail 각각 다른 "정상 응답 신호"
// 필요](2026-10-09 사용자 지시: "차단 정책이 바뀌면 나한테 알려줘서
// 내가 인지할수있게해줘") 처음엔 하나의 함수로 두 엔드포인트를 전부
// 검사했는데, 실제 상세 페이지 1,679건을 수집해보니 전부 "차단 의심"
// 오탐이 났다 — data-tot-cnt는 목록 응답에만 있고, NetFunnel_Action은
// 완전한 HTML 페이지(상세/홈페이지)엔 표준 템플릿으로 항상 포함돼
// 있어서(차단과 무관) 둘 다 상세 페이지 쪽 전제가 틀렸다. list/detail
// 각각에 맞는 "정상이면 반드시 있어야 할 것"만 확인하도록 분리했다.
describe('looksLikeListBotBlocked', () => {
  it('정상 응답(data-tot-cnt 포함)은 false', () => {
    expect(looksLikeListBotBlocked('<div class="card_list_v" data-tot-cnt="93">...</div>')).toBe(false);
  });
  it('data-tot-cnt가 없으면 true(예상과 다른 응답)', () => {
    expect(looksLikeListBotBlocked('<div>이상한 응답</div>')).toBe(true);
  });
  it('Incapsula 챌린지 마커가 있으면 true', () => {
    expect(looksLikeListBotBlocked('<script src="/_Incapsula_Resource?..."></script>')).toBe(true);
  });
  it('문자열이 아니면(예: undefined) true', () => {
    expect(looksLikeListBotBlocked(undefined)).toBe(true);
  });
});

describe('looksLikeDetailBotBlocked', () => {
  it('정상 응답(<dt> 포함, NetFunnel_Action이 섞여 있어도)은 false — 실측: 정상 상세 페이지도 NetFunnel_Action을 표준 템플릿으로 포함함', () => {
    expect(looksLikeDetailBotBlocked('<html><body>NetFunnel_Action({});<dt>지점</dt><dd>전주점</dd></body></html>')).toBe(false);
  });
  it('<dt>가 없으면 true(예상과 다른 응답)', () => {
    expect(looksLikeDetailBotBlocked('<div>이상한 응답</div>')).toBe(true);
  });
  it('Incapsula 챌린지 마커가 있으면 true', () => {
    expect(looksLikeDetailBotBlocked('<script src="/_Incapsula_Resource?..."></script>')).toBe(true);
  });
  it('문자열이 아니면(예: undefined) true', () => {
    expect(looksLikeDetailBotBlocked(undefined)).toBe(true);
  });
});

// 실측 샘플(2026-10-09, type=category&lrclsCtegryCd=02&brchCdList=0025
// 실제 응답에서 발췌한 최소 구조).
function wrapCardHtml({ href, statusText, storeName, title, imgSrc }) {
  return `<div class="card_list_v" data-tot-cnt="93">
    <a onclick="javascript:scrollSet();" href="${href}" class="lec_list">
      <div class="img_box"><div class="img_resize_w img reverse"><img src="${imgSrc}" alt="upload.jpg"></div></div>
      <div class="con">
        <div class="label_div">
          <p class="label small gray">${statusText}</p>
          <p class="label small black_gray">${storeName}</p>
        </div>
        <p class="tit limit_line_two">${title}</p>
        <div class="info_con">
          <div class="type_div"><p class="type">가을학기</p><p class="type">문아영</p></div>
          <p class="time">세부 일정 선택</p>
        </div>
      </div>
    </a>
  </div>`;
}

describe('parseLectureListResponse', () => {
  it('실제 카드 1건을 정확히 파싱한다(복합 class_id, 상태/지점/이미지 포함)', () => {
    const html = wrapCardHtml({
      href: '/application/search/view.do?brchCd=0025&yy=2026&lectSmsterCd=3&lectCd=0478',
      statusText: '대기접수',
      storeName: '전주점',
      title: '[특강]아이좋아 아이꼬야&#40;4~9개월&#41;',
      imgSrc: 'https://culture.lotteshopping.com/files/CUL_ONL/2026/8/202608261048455010.jpg',
    });
    const { items, totalCount } = parseLectureListResponse(html);

    expect(totalCount).toBe(93);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      class_id: '0025_2026_3_0478',
      brch_cd: '0025',
      yy: '2026',
      lect_smster_cd: '3',
      lect_cd: '0478',
      class_title: '[특강]아이좋아 아이꼬야(4~9개월)',
      store_code: '0025',
      store_name: '전주점',
      raw_status: '대기접수',
      normalized_status: 'WAITING',
      main_image_url: 'https://culture.lotteshopping.com/files/CUL_ONL/2026/8/202608261048455010.jpg',
    });
  });

  it('href에 필요한 쿼리 파라미터가 없으면(형식이 다른 카드) 건너뛴다', () => {
    const html = wrapCardHtml({
      href: '/application/search/view.do?weird=1',
      statusText: '접수중',
      storeName: '전주점',
      title: '테스트',
      imgSrc: 'https://example.com/a.jpg',
    });
    const { items } = parseLectureListResponse(html);
    expect(items).toEqual([]);
  });

  it('카드가 없으면 빈 배열, totalCount는 data-tot-cnt에서 읽는다', () => {
    const { items, totalCount } = parseLectureListResponse('<div class="card_list_v" data-tot-cnt="0"></div>');
    expect(items).toEqual([]);
    expect(totalCount).toBe(0);
  });
});

describe('getTotalCount', () => {
  it('data-tot-cnt 속성값을 숫자로 읽는다', () => {
    expect(getTotalCount('<div data-tot-cnt="6709">')).toBe(6709);
  });
  it('속성이 없으면 0', () => {
    expect(getTotalCount('<div>')).toBe(0);
  });
});
