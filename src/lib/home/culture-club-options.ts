// [문화센터 탭](2026-10-03 사용자 지시): "브랜드 선택 — 최상단에서 브랜드 전환(예: 이마트
// 컬처클럽 등). 현재는 이마트컬처클럽밖에 없지만 추후 현대백화점이라던가 데이터도 가져올
// 생각." 지금은 1개뿐이라 별도 DB 테이블을 만들지 않고(제5장 제7조 — 확장 구조는 허용하되
// 확장 기능 자체를 구현하지 않음) 배열 1개짜리 상수로 둔다. 브랜드가 실제로 늘어나면
// 원소만 추가한다.
// [롯데마트 추가](2026-10-04): 예고한 대로 두 번째 원소를 추가한다. 저장 스키마는
// 이마트와 완전히 다르므로(2026-10-04 사용자 확인 — 표준화 강제하지 않음) 화면
// 쪽에서 브랜드별로 별도 컴포넌트(lottemart-culture-club-view.tsx)를 렌더링한다.
export const CULTURE_CLUB_BRAND_OPTIONS = [
  { key: 'emart', label: '이마트 컬처클럽' },
  { key: 'lottemart', label: '롯데마트 문화센터' },
] as const;

export type CultureClubBrandKey = (typeof CULTURE_CLUB_BRAND_OPTIONS)[number]['key'];

// [카테고리 필터 — 실측 확인](2026-10-03): emart_culture_club_classes.sub_category_name의
// 실제 값은 정확히 이 5개뿐이다(전부 영문 — 사용자가 예시로 든 "오감/미술"은 실제 컬럼 값이
// 아니라 일러스트용 예시였던 것으로 보임, 추측으로 새 라벨을 지어내지 않고 실제 값을 그대로
// 쓴다. 제3장 제5조).
export const CULTURE_CLUB_SUB_CATEGORY_OPTIONS = [
  'Club Originals',
  'With Mom',
  'With mom(event)',
  'Kids & Children',
  'Kids & Children(event)',
] as const;

export type CultureClubSubCategory = (typeof CULTURE_CLUB_SUB_CATEGORY_OPTIONS)[number];

// [요일 필터] emart_culture_club_classes.class_day(text[])의 실제 값 표기와 동일한 한 글자
// 한글 요일(실측: ['금'] 등).
export const CULTURE_CLUB_DAY_OPTIONS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export type CultureClubDay = (typeof CULTURE_CLUB_DAY_OPTIONS)[number];

// [이미지 — 썸네일 CDN 확인됨](2026-10-03 사용자 제공): main_image_bucket/region 자체(S3
// 직접 접근)는 여전히 403(Amplify Cognito 인증 추정)이지만, 사용자가 실제 사이트에서 뜨는
// 이미지의 실제 요청 URL을 찾아줬다 — `https://d24y2yfxh2iebm.cloudfront.net/resized/
// thumbnail/{main_image_key}` 형태의 별도 공개 CloudFront 배포로, 인증 없이 바로
// 접근 가능함을 실측 확인(두 가지 키 형태 "category/4/403/{uuid}"와 "classImages/{uuid}"
// 모두에서 200 + 실제 JPEG 확인). 상세(큰) 해상도 경로는 아직 못 찾았다(resized/detail,
// /large, /full, /original, /1200 등 전부 404 — 추측으로 더 시도하지 않음, 제3장 제5조) —
// 사용자가 상세 화면용 URL을 하나 더 제공하면 그 때 추가한다.
const CULTURE_CLUB_IMAGE_CDN_BASE = 'https://d24y2yfxh2iebm.cloudfront.net/resized';

export function buildCultureClubThumbnailUrl(imageKey: string | null | undefined): string | null {
  if (!imageKey) return null;
  return `${CULTURE_CLUB_IMAGE_CDN_BASE}/thumbnail/${imageKey}`;
}

// [롯데마트 수강대상 필터 — 실측 확인](2026-10-04): search_cls_target 2/3/4만
// 수집한다(1=성인은 사용자 지시로 제외). lottemart_culture_club_classes.target_code/
// target_name에 그대로 저장돼 있어 수집 시 쓴 라벨을 그대로 재사용한다.
export const LOTTEMART_TARGET_OPTIONS = [
  { code: '2', label: '어린이청소년' },
  { code: '3', label: '유아' },
  { code: '4', label: '엄마와함께' },
] as const;

// [롯데마트 수강신청 딥링크 — 실측 확인](2026-10-04): fn_courseApp()가 로그인 세션 +
// 서버 측 접수 가능 시간대 확인(getBuyTime.json)을 거친 뒤에야 결제 페이지
// (selectCoursePaymentInfo.do)로 이동한다 — 로그인 안 된 상태에서 그 결제 URL로
// 바로 보내면 깨진다. 이마트의 "클래스 신청하러 가기"와 동일한 역할을 하는, 로그인
// 여부와 무관하게 항상 정상 동작하는 공개 페이지는 검색 상세 페이지(courseview.do)
// 다 — 거기 있는 실제 "바로신청"/"대기자 신청" 버튼을 사용자가 그대로 누르면 된다.
// 필수 파라미터만으로 동작함을 실측 확인(2026-10-04, 나머지 빈 파라미터는 불필요).
export function buildLottemartCourseViewUrl(params: { storeCode: string; classId: string; semesterCode: string; targetCode: string }) {
  const query = new URLSearchParams({
    search_str_cd: params.storeCode,
    cls_cd: params.classId,
    search_term_cd: params.semesterCode,
    search_cls_target: params.targetCode,
  });
  return `https://culture.lottemart.com/cu/gus/course/courseinfo/courseview.do?${query.toString()}`;
}
