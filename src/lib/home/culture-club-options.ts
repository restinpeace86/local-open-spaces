// [문화센터 탭](2026-10-03 사용자 지시): "브랜드 선택 — 최상단에서 브랜드 전환(예: 이마트
// 컬처클럽 등). 현재는 이마트컬처클럽밖에 없지만 추후 현대백화점이라던가 데이터도 가져올
// 생각." 지금은 1개뿐이라 별도 DB 테이블을 만들지 않고(제5장 제7조 — 확장 구조는 허용하되
// 확장 기능 자체를 구현하지 않음) 배열 1개짜리 상수로 둔다. 브랜드가 실제로 늘어나면
// 원소만 추가한다.
// [롯데마트 추가](2026-10-04): 예고한 대로 두 번째 원소를 추가한다.
//
// [통합검색으로 전환](2026-10-06 사용자 지시, project/decision-log.md Decision
// 028): "전체 통합검색 및 롯데마트나 이마트 필터검색도 가능하게" — 저장은
// culture_club_classes 하나로 통합됐으니(화면도 브랜드별 별도 컴포넌트가
// 아니라 brand를 필터 중 하나로 다루는 단일 화면으로 바꿨다) 'all'(전체,
// 기본값)을 맨 앞에 추가한다. 브랜드가 5개(AK플라자/신세계/현대백화점 추가
// 예정)가 돼도 이 배열에 원소만 늘리면 된다.
export const CULTURE_CLUB_BRAND_OPTIONS = [
  { key: 'all', label: '전체' },
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

// [롯데마트 지점 목록 — 성능 수정](2026-10-04 사용자 지적): "문화센터를
// 이벤트픽 화면에서 들어갔었는데... 왜이렇게 느려졌지?" — 원인은
// `/api/culture-club/lottemart-stores`가 60개 지점명을 뽑으려고 전체
// 15,000여 행을 1,000건씩 16번 페이지네이션으로 훑고 있었던 것(실측: 2.3초,
// 이마트 지점 API의 0.6초 대비 4배). 이 지점 목록은 scripts/ingest/
// lottemart-culture-club.mjs의 STORES와 동일한 정적 데이터(수집 스크립트도
// 매번 재수집하지 않고 하드코딩해서 쓴다 — 지점이 느는 건 드문 수동 이벤트)
// 라 굳이 매 요청마다 테이블을 훑을 필요가 없다. API 라우트가 이 상수를
// 그대로 반환하도록 바꿔 쿼리 자체를 없앤다.
export const LOTTEMART_STORES: { storeCode: string; label: string }[] = [
  ['103', 'MAXX영등포점'], ['322', '송파점'], ['328', '양평점'], ['342', '은평점'], ['307', '중계점'],
  ['455', '고양점'], ['463', '광교점'], ['405', '구리점'], ['458', '권선점'], ['479', '김포한강점'],
  ['435', '동두천점'], ['446', '롯데몰수지점'], ['476', '시흥배곧점'], ['468', '신갈점'], ['415', '안산점'],
  ['417', '안성점'], ['410', '오산점'], ['409', '의왕점'], ['422', '이천점'], ['436', '평택점'],
  ['433', '검단점'], ['469', '계양점'], ['426', '부평점'], ['418', '삼산점'], ['465', '송도점'],
  ['424', '영종도점'], ['461', '청라점'], ['516', '노은점'], ['515', '당진점'], ['508', '대덕점'],
  ['519', '상당점'], ['504', '서대전점'], ['506', '서산점'], ['507', '성정점'], ['505', '충주점'],
  ['112', 'MAXX창원중앙점'], ['645', '거제점'], ['613', '구미점'], ['647', '김천점'], ['629', '대구율하점'],
  ['626', '부산점'], ['612', '사상점'], ['643', '양덕점'], ['601', '울산점'], ['610', '웅상점'],
  ['609', '장유점'], ['614', '진장점'], ['611', '진해점'], ['608', '통영점'], ['109', 'MAXX목포점'],
  ['108', 'MAXX상무점'], ['110', 'MAXX송천점'], ['707', '군산점'], ['715', '수완점'], ['705', '여수점'],
  ['706', '월드컵점'], ['702', '익산점'], ['708', '전주점'], ['704', '첨단점'], ['802', '춘천점'],
].map(([storeCode, label]) => ({ storeCode, label }));

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
