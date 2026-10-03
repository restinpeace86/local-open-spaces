// [문화센터 탭](2026-10-03 사용자 지시): "브랜드 선택 — 최상단에서 브랜드 전환(예: 이마트
// 컬처클럽 등). 현재는 이마트컬처클럽밖에 없지만 추후 현대백화점이라던가 데이터도 가져올
// 생각." 지금은 1개뿐이라 별도 DB 테이블을 만들지 않고(제5장 제7조 — 확장 구조는 허용하되
// 확장 기능 자체를 구현하지 않음) 배열 1개짜리 상수로 둔다. 브랜드가 실제로 늘어나면
// 원소만 추가한다.
export const CULTURE_CLUB_BRAND_OPTIONS = [{ key: 'emart', label: '이마트 컬처클럽' }] as const;

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
