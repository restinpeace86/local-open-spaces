import { describe, expect, it } from 'vitest';
import {
  buildAkplazaDetailUrl,
  buildCultureClubThumbnailUrl,
  buildElandRetailDetailUrl,
  buildLotteDepartmentDetailUrl,
  buildShinsegaeDetailUrl,
  buildStarfieldDetailUrl,
} from './culture-club-options';

// [이미지 — 썸네일 CDN 확인됨](2026-10-03 사용자 제공 URL로 실측 확인): 두 가지 실제
// main_image_key 형태("category/4/403/{uuid}", "classImages/{uuid}") 모두에서
// https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/{key} 가 실제로 200 +
// JPEG를 반환함을 curl로 직접 확인했다. 이 함수는 그 URL 조합 로직만 검증한다.
describe('buildCultureClubThumbnailUrl', () => {
  it('"category/..." 형태 키로 올바른 CDN URL을 만든다', () => {
    expect(buildCultureClubThumbnailUrl('category/4/403/f1dcfa20-b0dc-4f75-890d-84eabb499b33')).toBe(
      'https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/category/4/403/f1dcfa20-b0dc-4f75-890d-84eabb499b33'
    );
  });

  it('"classImages/..." 형태 키로도 올바른 CDN URL을 만든다', () => {
    expect(buildCultureClubThumbnailUrl('classImages/6450c059-7f36-47e0-8c2e-670eeb1aed31')).toBe(
      'https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/classImages/6450c059-7f36-47e0-8c2e-670eeb1aed31'
    );
  });

  it('키가 없으면(null/undefined) null을 반환한다(추측으로 이미지를 만들어내지 않음)', () => {
    expect(buildCultureClubThumbnailUrl(null)).toBeNull();
    expect(buildCultureClubThumbnailUrl(undefined)).toBeNull();
  });
});

// [신세계 아카데미 상세/신청 페이지 — 사용자 제공 URL로 확정](2026-10-08):
// "https://sacademy.shinsegae.com/.../HP0010P1.do?yearCode=2026&smstCode=
// S3&storeCode=03&lectCode=T2694782" 실측으로 실제 강좌 상세 페이지가
// 정상 반환됨을 확인했다.
describe('buildShinsegaeDetailUrl', () => {
  it('yearCode/smstCode/storeCode/lectCode로 실제 확인된 URL 형태를 만든다', () => {
    expect(
      buildShinsegaeDetailUrl({ yearCode: '2026', semesterCode: 'S3', storeCode: '03', classId: 'T2694782' })
    ).toBe('https://sacademy.shinsegae.com/sdotcom/web/HP0010P0/HP0010P1.do?yearCode=2026&smstCode=S3&storeCode=03&lectCode=T2694782');
  });
});

// [AK플라자 상세/신청 페이지 — 실측 확인](2026-10-09): "/course/detail?
// store=04&main_cd=3&sSubject_cd=835566" 세션 쿠키 없이도 정상 반환됨을
// 확인했다.
describe('buildAkplazaDetailUrl', () => {
  it('store/main_cd/sSubject_cd로 실제 확인된 URL 형태를 만든다', () => {
    expect(buildAkplazaDetailUrl({ storeCode: '04', mainCd: '3', classId: '835566' })).toBe(
      'https://culture.akplaza.com/course/detail?store=04&main_cd=3&sSubject_cd=835566'
    );
  });
});

// [스타필드 상세/신청 페이지 — 실측 확인](2026-10-09): "/mlt/initLctrDetl.do
// ?lctrNo=L260912228&store=suwon" 쿠키 없이도 정상 반환됨을 확인했다.
describe('buildStarfieldDetailUrl', () => {
  it('lctrNo/store(영문 지점명)로 실제 확인된 URL 형태를 만든다', () => {
    expect(buildStarfieldDetailUrl({ storeEnNm: 'suwon', classId: 'L260912228' })).toBe(
      'https://www.classkok.com/mlt/initLctrDetl.do?lctrNo=L260912228&store=suwon'
    );
  });
});

// [롯데백화점 상세/신청 페이지 — 실측 확인](2026-10-09): "/application/
// search/view.do?brchCd=0025&yy=2026&lectSmsterCd=3&lectCd=0478" 쿠키
// 없이도 정상 반환됨을 확인했다.
describe('buildLotteDepartmentDetailUrl', () => {
  it('복합 class_id("brchCd_yy_lectSmsterCd_lectCd")를 분해해 실제 확인된 URL 형태를 만든다', () => {
    expect(buildLotteDepartmentDetailUrl('0025_2026_3_0478')).toBe(
      'https://culture.lotteshopping.com/application/search/view.do?brchCd=0025&yy=2026&lectSmsterCd=3&lectCd=0478'
    );
  });
});

// [이랜드리테일 상세/신청 페이지 — 실측 확인](2026-10-09): "/m/culture/
// culture04.do?storeid=8222&semnum=66&lectypeid=B&seq=36" 로그인 없이도
// 정상 반환됨을 확인했다.
describe('buildElandRetailDetailUrl', () => {
  it('복합 class_id("storeId_semNum_lecTypeId_seq")를 분해해 실제 확인된 URL 형태를 만든다', () => {
    expect(buildElandRetailDetailUrl('8222_66_B_36')).toBe(
      'https://www.elandretail.com/m/culture/culture04.do?storeid=8222&semnum=66&lectypeid=B&seq=36'
    );
  });
});
