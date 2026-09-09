import { createElement, Fragment, type ReactNode } from 'react';

// [카테고리별 뱃지/룰 완전 독립 Config 구조](2026-09-07, implementation/todo.md
// 개선사항4 — 사용자 지시로 세부 방침 확정) — 예전엔 뱃지 목록이 "노출 중분류"와
// 무관하게 전역 단일 목록 하나였다(식당 기준). 그런데 실측 확인 결과 "노출
// 중분류" 드롭다운엔 이미 서로 성격이 다른 13개 값(키즈카페/실내놀이터, 캠핑장,
// 도서관, 박물관 등)이 실제로 존재했고, 이미 17건이 "키즈카페 / 실내놀이터"로
// 큐레이션돼 있으면서도 식당용 뱃지("좌식/온돌", "키즈 메뉴" 등)만 볼 수 있었다 —
// 실제 문제로 확인된 것을 이번에 고친다.
//
// 사용자 지시: "노출 중분류에 대하여 적용시 [전부] 같이 가도록 적용해야지..
// 하나씩 채워넣어야지 거기에 맞는거" — 13개(사용자는 "10개"라고 했으나 실측
// service_categories 실제 행 수는 13개, todo.md 자체의 [노출될 중분류] 참고
// 목록과도 정확히 일치해 그 수를 그대로 따른다) 전부를 이 배열에 등록해 구조는
// 처음부터 갖추되, 실제 콘텐츠(뱃지/키워드)가 확정된 것만 우선 채운다:
// - "키즈친화 식당(놀이시설 포함)": 기존 13개 뱃지 그대로(이미 83건 실사용 중,
//   변경하면 기존 데이터와 어긋남).
// - "키즈카페 / 실내놀이터": todo.md 원문이 예시로 준 키즈카페 전용 뱃지 세트
//   그대로 반영(트램폴린/볼풀장/베이비존 등).
// - 나머지 11개(도서관/박물관/캠핑장/휴양마을 등): 아직 실제 큐레이션 데이터도,
//   todo.md가 준 예시 콘텐츠도 없다 — venue 특유의 뱃지(예: 도서관에 "트램폴린")를
//   임의로 지어내지 않고(제3장 제5조 추측 금지), 어떤 공공장소에도 보편적으로
//   적용 가능한 최소 공통 항목(주차/유모차/수유실/기저귀대/예약 필수·가능)만
//   임시로 채워 둔다 — 관리자가 각 카테고리에 맞는 실제 뱃지를 하나씩 확정해
//   주면 그때 개별 교체한다("하나씩 채워넣어야지"라는 지시와 일치).
export type CurationBadgeOption = {
  key: string;
  label: string;
  group: string;
};

type CurationCategoryConfig = {
  categoryId: string;
  // service_categories.category_name과 정확히 일치하는 값들 — 이 목록에 속한
  // 노출 중분류를 고르면 이 config가 활성화된다.
  exposureCategoryNames: string[];
  badgeGroups: string[];
  badgeOptions: CurationBadgeOption[];
  // 뱃지 키 → 하이라이트/자동 체크용 키워드 목록.
  keywordGroups: Record<string, string[]>;
};

// [뱃지 목록 정정 이력](2026-09-05~06 사용자 지시) — "식당" config는 그 논의를
// 그대로 이어받는다: 12개 → 룸/개별공간 재합침 + 예약가능 추가로 13개 확정.
const RESTAURANT_KEYWORD_GROUPS: Record<string, string[]> = {
  parking: ['주차', '주차장', '파킹', '차댈곳', '발렛'],
  stroller: ['유모차', '유모차반입', '유모차동반'],
  nursing_room: ['수유실', '모유수유'],
  diaper_table: ['기저귀', '갈이대', '기저귀존'],
  kids_chair: ['아기의자', '하이체어', '유아용의자', '유아의자'],
  kids_tableware: ['유아식기', '식판', '아기식기'],
  kids_menu: ['키즈메뉴', '돈가스', '주먹밥', '어린이메뉴'],
  floor_seating: ['좌식', '온돌'],
  private_room: ['룸', '개별룸', '단독룸', '프라이빗룸'],
  kids_zone: ['키즈존', '놀이방', '장난감', '정글짐'],
  outdoor_yard: ['마당', '잔디밭', '테라스', '야외'],
  reservation_required: ['예약필수', '사전예약필수'],
  reservation_possible: ['예약', '사전예약', '캐치테이블', '네이버예약'],
};

const RESTAURANT_CONFIG: CurationCategoryConfig = {
  categoryId: 'restaurant',
  exposureCategoryNames: ['키즈친화 식당(놀이시설 포함)', '키즈친화 식당 (놀이시설 포함)'],
  badgeGroups: ['이동/편의', '식사/아기', '공간/놀이', '운영'],
  badgeOptions: [
    { key: 'parking', label: '주차 완비', group: '이동/편의' },
    { key: 'stroller', label: '유모차 가능', group: '이동/편의' },
    { key: 'nursing_room', label: '수유실 있음', group: '이동/편의' },
    { key: 'diaper_table', label: '기저귀 갈이대', group: '이동/편의' },
    { key: 'kids_chair', label: '아기의자', group: '식사/아기' },
    { key: 'kids_tableware', label: '유아 식기', group: '식사/아기' },
    { key: 'kids_menu', label: '키즈 메뉴', group: '식사/아기' },
    { key: 'floor_seating', label: '좌식/온돌 있음', group: '식사/아기' },
    { key: 'private_room', label: '룸/개별 공간 있음', group: '식사/아기' },
    { key: 'kids_zone', label: '키즈존/놀이방', group: '공간/놀이' },
    { key: 'outdoor_yard', label: '야외 마당/테라스', group: '공간/놀이' },
    { key: 'reservation_required', label: '예약 필수', group: '운영' },
    { key: 'reservation_possible', label: '예약 가능', group: '운영' },
  ],
  keywordGroups: RESTAURANT_KEYWORD_GROUPS,
};

// [키즈카페 전용 뱃지](2026-09-07 todo.md 개선사항4 원문 예시 그대로 반영) —
// 이 config가 활성화되면서 기존 17건의 "키즈카페 / 실내놀이터" 큐레이션의
// curation_badges는 식당용 값이 섞여 있어 사용자 지시대로 전부 초기화했다
// (별도 DB 마이그레이션, scripts/migrations/2026-09-07-reset-kidscafe-badges.sql).
// [뱃지 확장](2026-09-08 사용자 지시): "미끄럼틀 추가해.. 체험존 같은것도..
// 드로잉존이나 프로그램 선택가능한거.. 카페테리아는 키워드로.. 공공인지
// 민간인지 뱃지도.. 연령대(영유아 36개월/미취학 7세이하/취학 초등학생)
// 체크할수있는거" — 7개 신규 뱃지를 추가한다:
// - kc_slide(미끄럼틀): 기존엔 kc_ball_pool_jungle 키워드에 '미끄럼틀'이 섞여
//   있어 별도로 체크할 수 없었다. 전용 뱃지로 분리하고 그 키워드는 이동한다.
// - kc_experience_zone(체험존/프로그램존): 사용자가 예로 든 "레인보우스타"처럼
//   물감/미술/오감놀이 등 프로그램형 존이 시설 중심 키즈존과 별도로 있는
//   경우를 표시한다.
// - kc_food(식사 및 간식 판매) 키워드에 '카페테리아' 추가 — 신규 뱃지가
//   아니라 기존 식음료 뱃지의 키워드 확장이다("원래 키즈카페가 음료팔기는
//   하는데" — 이미 있는 뱃지 범위와 일치한다는 사용자 판단을 그대로 반영).
// - kc_public_operated/kc_private_operated(공공/민간 운영): "공공/민간" 그룹.
//   기존 "운영"(예약 관련) 그룹과 헷갈리지 않도록 그룹명을 분리했다.
// - kc_age_infant/kc_age_preschool/kc_age_school(연령대): 체크박스 구조 자체가
//   이미 복수 선택 가능이라(다른 뱃지들처럼 curation_badges 배열에 여러 키를
//   같이 저장) 별도 UI 변경 없이 세 뱃지를 추가하는 것만으로 "복수선택
//   가능"이 충족된다. 사용자가 확인한 경계값 그대로: 영유아=36개월(만 3세)
//   이하, 미취학=7세 이하, 취학=초등학생.
const KIDS_CAFE_CONFIG: CurationCategoryConfig = {
  categoryId: 'kids_cafe',
  exposureCategoryNames: ['키즈카페 / 실내놀이터'],
  badgeGroups: ['이동/편의', '놀이/시설', '부대시설/보호자', '운영', '공공/민간', '연령대'],
  badgeOptions: [
    { key: 'kc_parking', label: '주차 완비', group: '이동/편의' },
    { key: 'kc_stroller_parking', label: '유모차 보관/가능', group: '이동/편의' },
    { key: 'kc_nursing_room', label: '수유실 있음', group: '이동/편의' },
    { key: 'kc_diaper_table', label: '기저귀 갈이대', group: '이동/편의' },
    { key: 'kc_trampoline', label: '트램폴린/방방', group: '놀이/시설' },
    { key: 'kc_ball_pool_jungle', label: '볼풀장/정글짐', group: '놀이/시설' },
    { key: 'kc_slide', label: '미끄럼틀', group: '놀이/시설' },
    { key: 'kc_hinoki_sandbox', label: '편백존/모래놀이', group: '놀이/시설' },
    { key: 'kc_baby_zone', label: '베이비존(영유아 전용)', group: '놀이/시설' },
    { key: 'kc_experience_zone', label: '체험존/프로그램존(미술·오감놀이 등)', group: '놀이/시설' },
    { key: 'kc_parent_relax', label: '부모 쉼터/안마의자', group: '부대시설/보호자' },
    { key: 'kc_party_room', label: '파티룸/개별 룸', group: '부대시설/보호자' },
    { key: 'kc_food', label: '식사 및 간식 판매', group: '부대시설/보호자' },
    { key: 'kc_reservation_required', label: '예약 필수', group: '운영' },
    { key: 'kc_reservation_possible', label: '예약 가능', group: '운영' },
    { key: 'kc_public_operated', label: '공공 운영', group: '공공/민간' },
    { key: 'kc_private_operated', label: '민간 운영', group: '공공/민간' },
    { key: 'kc_age_infant', label: '영유아(0~36개월)', group: '연령대' },
    { key: 'kc_age_preschool', label: '미취학(7세 이하)', group: '연령대' },
    { key: 'kc_age_school', label: '취학(초등학생)', group: '연령대' },
  ],
  keywordGroups: {
    kc_parking: ['주차', '주차장', '파킹', '차댈곳', '발렛'],
    kc_stroller_parking: ['유모차보관', '유모차파킹', '유모차'],
    kc_nursing_room: ['수유실', '모유수유'],
    kc_diaper_table: ['기저귀', '갈이대', '기저귀존'],
    // [트램펄린 표기 동의어 추가](2026-09-08 사용자 지시, todo.md 개선사항1-1):
    // "트램폴린에 대하여 키워드 트램펄린도 가져가도록 할것" — 표준 표기(트램폴린)
    // 외에 흔한 대체 표기(트램펄린)도 블로그 본문에서 자주 쓰여 같은 뱃지로
    // 묶는다.
    kc_trampoline: ['트램폴린', '트램펄린', '방방', '방방이', '점핑존', '점프'],
    kc_ball_pool_jungle: ['볼풀', '볼풀장', '정글짐', '클라이밍'],
    kc_slide: ['미끄럼틀', '슬라이드'],
    kc_hinoki_sandbox: ['편백', '편백존', '편백나무', '모래놀이', '모래존'],
    kc_baby_zone: ['베이비존', '영유아존', '아기들노는곳', '돌쟁이'],
    kc_experience_zone: ['체험존', '드로잉존', '프로그램존', '미술놀이', '오감놀이', '창의미술', '아트존'],
    kc_parent_relax: ['안마의자', '릴렉스존', '부모쉼터', '안마기', '안마'],
    kc_party_room: ['파티룸', '대관', '생일파티', '단독룸', '프라이빗룸'],
    kc_food: ['식사', '떡볶이', '주먹밥', '식음료', '음식맛집', '매점', '카페테리아'],
    kc_reservation_required: ['예약필수', '사전예약필수', '회차별예약'],
    kc_reservation_possible: ['예약', '네이버예약', '전화예약'],
    kc_public_operated: ['공공운영', '국공립', '시립', '구립', '공립'],
    kc_private_operated: ['민간운영', '사설', '프랜차이즈'],
    kc_age_infant: ['영유아', '36개월', '만3세'],
    kc_age_preschool: ['미취학', '유치원생', '7세이하'],
    kc_age_school: ['취학아동', '초등학생', '초등부'],
  },
};

// [캠핑장/체험휴양마을/교육농장 전용 뱃지 + 네거티브 뱃지](2026-09-10 사용자
// 지시): "중분류중 캠핑장과 체험휴양마을 교육농장 3개에 대하여 각각 데이터들
// 속성들을 확인해 보고 어린이 친화로 사용할 뱃지들 리스트 제안 및 작성해줘.
// 또 반대로 어린이 포함 가족들이 가지 못하는 뱃지들도 제안해줘." — 실측 확인:
// 이 3개 노출 중분류의 원천 데이터(GO_CAMPING/RURAL_EXPERIENCE_VILLAGE/
// RURAL_EDUCATION_FARM)는 부대시설 관련 구조화 필드(sbrsCl/posblFcltyCl/
// holdFclty 등)가 있어도 실제로는 거의 비어 있어(실측 샘플 전수 확인),
// 구조화 필드 기반 자동 판정은 신뢰할 수 없다 — 기존 키즈카페/식당과 동일하게
// "관리자가 블로그 본문을 붙여넣으면 키워드로 1차 자동 체크"하는 방식을
// 그대로 따른다(제5장 제4조 기존 구조 우선). 이 3개는 이제 아래 GENERIC_
// CATEGORY_NAMES에서 빠지고 전용 config로 승격된다.
//
// [네거티브 뱃지 신설] 이 기능이 다루는 첫 "주의/제한" 유형 뱃지다 — 구조상
// 특별한 처리가 필요 없다(curation_badges는 단순 키 배열이라 포지티브/
// 네거티브 구분 없이 같은 방식으로 저장·표시된다). "노출 중분류에 이런
// 어린이 위험 요소가 있다"를 관리자가 정확히 표시할 수 있게 그룹만 별도
// ("주의/제한")로 분리했다.
const CAMPING_CONFIG: CurationCategoryConfig = {
  categoryId: 'camping',
  exposureCategoryNames: ['캠핑장 / 피크닉장'],
  badgeGroups: ['이동/편의', '놀이/편의시설', '캠핑 유형', '주의/제한'],
  badgeOptions: [
    { key: 'cp_parking', label: '주차 완비', group: '이동/편의' },
    { key: 'cp_stroller', label: '유모차 이용 가능(평탄한 부지)', group: '이동/편의' },
    { key: 'cp_hot_water', label: '온수 샤워 가능', group: '이동/편의' },
    { key: 'cp_playground', label: '놀이터 있음', group: '놀이/편의시설' },
    { key: 'cp_trampoline', label: '트램폴린/방방', group: '놀이/편의시설' },
    { key: 'cp_slide', label: '미끄럼틀', group: '놀이/편의시설' },
    { key: 'cp_sand_play', label: '모래놀이터', group: '놀이/편의시설' },
    { key: 'cp_water_play', label: '물놀이장/계곡 인접', group: '놀이/편의시설' },
    { key: 'cp_convenience_store', label: '매점/편의점', group: '놀이/편의시설' },
    { key: 'cp_glamping', label: '글램핑 사이트', group: '캠핑 유형' },
    { key: 'cp_caravan', label: '카라반 사이트', group: '캠핑 유형' },
    { key: 'cp_ondol', label: '온돌/구들장 사이트', group: '캠핑 유형' },
    { key: 'cp_backpacking_only', label: '백패킹 전용(차량 진입 불가)', group: '주의/제한' },
    { key: 'cp_rough_terrain', label: '험지/고지대(등산 필요)', group: '주의/제한' },
    { key: 'cp_no_kids_zone', label: '노키즈존/유아 동반 제한', group: '주의/제한' },
    { key: 'cp_no_electricity', label: '전기 미사용(무전기 사이트만)', group: '주의/제한' },
    { key: 'cp_pet_only', label: '반려동물 전용 캠핑장', group: '주의/제한' },
    { key: 'cp_valley_danger', label: '계곡 급류/안전펜스 없음', group: '주의/제한' },
  ],
  keywordGroups: {
    cp_parking: ['주차', '주차장', '파킹', '차댈곳'],
    cp_stroller: ['유모차', '유모차동반', '평탄한부지', '유모차이동'],
    cp_hot_water: ['온수', '온수샤워', '따뜻한물', '온수이용'],
    cp_playground: ['놀이터', '어린이놀이터', '키즈놀이터'],
    cp_trampoline: ['트램폴린', '트램펄린', '방방', '방방이', '점핑존'],
    cp_slide: ['미끄럼틀', '슬라이드'],
    cp_sand_play: ['모래놀이', '모래놀이터', '모래사장', '모래존'],
    cp_water_play: ['물놀이', '물놀이장', '계곡', '개울', '수영장'],
    cp_convenience_store: ['매점', '편의점', '마트'],
    cp_glamping: ['글램핑', '글램핑존', '글램핑사이트'],
    cp_caravan: ['카라반', '트레일러', '카라반사이트'],
    cp_ondol: ['온돌', '구들장', '온돌사이트', '온돌존'],
    cp_backpacking_only: ['백패킹', '백패킹전용', '차량진입불가', '도보이동만'],
    cp_rough_terrain: ['험지', '고지대', '등산', '오지캠핑', '산악지형'],
    cp_no_kids_zone: ['노키즈존', '유아동반불가', '어린이동반제한'],
    cp_no_electricity: ['무전기', '전기없음', '전기미사용', '노전기'],
    cp_pet_only: ['반려동물전용', '펫캠핑', '애견동반전용'],
    cp_valley_danger: ['급류', '계곡위험', '안전펜스없음', '깊은계곡'],
  },
};

const RURAL_VILLAGE_CONFIG: CurationCategoryConfig = {
  categoryId: 'rural_village',
  exposureCategoryNames: ['휴양마을'],
  badgeGroups: ['이동/편의', '체험 프로그램', '숙박/편의시설', '주의/제한'],
  badgeOptions: [
    { key: 'rv_parking', label: '주차 완비', group: '이동/편의' },
    { key: 'rv_mudflat_experience', label: '갯벌체험 가능', group: '체험 프로그램' },
    { key: 'rv_animal_feeding', label: '동물 먹이주기 체험', group: '체험 프로그램' },
    { key: 'rv_fruit_picking', label: '과일·농작물 수확 체험', group: '체험 프로그램' },
    { key: 'rv_indoor_experience', label: '우천 대비 실내 체험장', group: '체험 프로그램' },
    { key: 'rv_safety_gear', label: '장화/장갑 등 체험 장비 제공', group: '숙박/편의시설' },
    { key: 'rv_wash_facility', label: '체험 후 세척시설 잘 갖춰짐', group: '숙박/편의시설' },
    { key: 'rv_lodging', label: '숙박 가능(온돌방 등)', group: '숙박/편의시설' },
    { key: 'rv_deep_mudflat', label: '갯벌이 깊어 유아 부적합', group: '주의/제한' },
    { key: 'rv_tide_danger', label: '밀물시간 위험(조수 간만 주의)', group: '주의/제한' },
    { key: 'rv_adult_labor_program', label: '성인 위주 중노동 체험', group: '주의/제한' },
    { key: 'rv_remote_access', label: '교통 불편/오지 마을', group: '주의/제한' },
  ],
  keywordGroups: {
    rv_parking: ['주차', '주차장', '파킹', '차댈곳'],
    rv_mudflat_experience: ['갯벌체험', '갯벌', '바지락캐기', '동죽', '조개캐기'],
    rv_animal_feeding: ['동물먹이주기', '동물체험', '먹이주기체험'],
    rv_fruit_picking: ['수확체험', '과일따기', '농작물수확', '체험수확'],
    rv_indoor_experience: ['실내체험장', '실내체험', '우천대비'],
    rv_safety_gear: ['장화', '장갑', '체험장비제공', '장비대여'],
    rv_wash_facility: ['세척시설', '샤워실', '세면장', '씻는곳'],
    rv_lodging: ['숙박', '민박', '온돌방', '체험마을숙박'],
    rv_deep_mudflat: ['깊은갯벌', '갯벌위험', '유아부적합'],
    rv_tide_danger: ['밀물', '조수간만', '물때주의', '밀물위험'],
    rv_adult_labor_program: ['중노동', '성인전용체험', '농사일체험'],
    rv_remote_access: ['교통불편', '오지마을', '접근성낮음'],
  },
};

const EDUCATION_FARM_CONFIG: CurationCategoryConfig = {
  categoryId: 'education_farm',
  exposureCategoryNames: ['체험농장·농원'],
  badgeGroups: ['이동/편의', '체험 프로그램', '부대시설', '주의/제한'],
  badgeOptions: [
    { key: 'ef_parking', label: '주차 완비', group: '이동/편의' },
    { key: 'ef_animal_experience', label: '동물 체험/승마 체험', group: '체험 프로그램' },
    { key: 'ef_harvest_experience', label: '작물 수확 체험', group: '체험 프로그램' },
    { key: 'ef_cooking_experience', label: '요리·만들기 체험(장 담그기 등)', group: '체험 프로그램' },
    { key: 'ef_tractor_ride', label: '트랙터 등 농기구 탑승 체험', group: '체험 프로그램' },
    { key: 'ef_indoor_experience', label: '우천 대비 실내 체험장', group: '부대시설' },
    { key: 'ef_toddler_program', label: '미취학 아동 맞춤 프로그램', group: '부대시설' },
    { key: 'ef_safety_staff', label: '안전 관리 인력 상주', group: '부대시설' },
    { key: 'ef_farm_machinery_danger', label: '농기계 이동 구간 위험', group: '주의/제한' },
    { key: 'ef_insect_risk', label: '벌·모기 등 해충 많음', group: '주의/제한' },
    { key: 'ef_uneven_terrain', label: '계단식 지형(유모차 이동 어려움)', group: '주의/제한' },
    { key: 'ef_high_intensity_program', label: '체력 소모 큰 체험(미취학 제한)', group: '주의/제한' },
  ],
  keywordGroups: {
    ef_parking: ['주차', '주차장', '파킹', '차댈곳'],
    ef_animal_experience: ['동물체험', '승마체험', '말타기', '동물먹이주기'],
    ef_harvest_experience: ['수확체험', '작물수확', '과일따기', '농작물체험'],
    ef_cooking_experience: ['장담그기', '요리체험', '만들기체험', '떡만들기'],
    ef_tractor_ride: ['트랙터체험', '농기구체험', '트랙터탑승'],
    ef_indoor_experience: ['실내체험장', '실내체험', '우천대비'],
    ef_toddler_program: ['미취학프로그램', '유아프로그램', '영유아체험'],
    ef_safety_staff: ['안전관리', '안전요원', '체험도우미'],
    ef_farm_machinery_danger: ['농기계위험', '트랙터이동구간', '농기계주의'],
    ef_insect_risk: ['벌레많음', '모기', '벌', '해충주의'],
    ef_uneven_terrain: ['계단식지형', '유모차이동어려움', '경사지형'],
    ef_high_intensity_program: ['체력소모', '고강도체험', '장시간체험'],
  },
};

// [보편 임시 뱃지](위 파일 상단 설명 참고) — 아직 전용 콘텐츠가 확정되지 않은
// 나머지 8개 노출 중분류에 공통으로 적용하는 최소 항목. venue별 특화 뱃지가
// 아니라 "어느 공공장소든 있을 법한" 편의시설만 담았다 — 임의로 지어낸 특화
// 항목(예: 도서관에 "볼풀장")은 없다.
const GENERIC_BADGE_GROUPS = ['이동/편의', '운영'];
const GENERIC_BADGE_OPTIONS: CurationBadgeOption[] = [
  { key: 'parking', label: '주차 완비', group: '이동/편의' },
  { key: 'stroller', label: '유모차 가능', group: '이동/편의' },
  { key: 'nursing_room', label: '수유실 있음', group: '이동/편의' },
  { key: 'diaper_table', label: '기저귀 갈이대', group: '이동/편의' },
  { key: 'reservation_required', label: '예약 필수', group: '운영' },
  { key: 'reservation_possible', label: '예약 가능', group: '운영' },
];
const GENERIC_KEYWORD_GROUPS: Record<string, string[]> = {
  parking: ['주차', '주차장', '파킹', '차댈곳', '발렛'],
  stroller: ['유모차', '유모차반입', '유모차동반'],
  nursing_room: ['수유실', '모유수유'],
  diaper_table: ['기저귀', '갈이대', '기저귀존'],
  reservation_required: ['예약필수', '사전예약필수'],
  reservation_possible: ['예약', '사전예약', '네이버예약'],
};

// [보편 임시 config 목록] — 사용자 지시대로 "노출 중분류 13개 전부"가 이 배열에
// 등록돼 있어야 한다. 실측 확인한 나머지 8개 노출 중분류(service_categories
// 실제 값) 각각에 위 보편 임시 뱃지를 연결한다.
// [2026-09-10] '체험농장·농원'/'휴양마을'/'캠핑장 / 피크닉장' 3개는 전용 config
// (CAMPING_CONFIG/RURAL_VILLAGE_CONFIG/EDUCATION_FARM_CONFIG)로 승격돼 이
// 목록에서 빠졌다.
const GENERIC_CATEGORY_NAMES = [
  '물놀이장 / 바닥분수 (시즌성)',
  '실내 체험·놀이 공간',
  '대형 근린공원 / 잔디광장',
  '생태공원 / 산책로',
  '수목원 / 식물원',
  '어린이 도서관',
  '어린이 과학관 / 박물관',
  '미술관 / 전시체험관',
];

function slugifyCategoryName(name: string): string {
  return name.replace(/[^가-힣a-zA-Z0-9]/g, '');
}

const GENERIC_CONFIGS: CurationCategoryConfig[] = GENERIC_CATEGORY_NAMES.map((name) => ({
  categoryId: `generic_${slugifyCategoryName(name)}`,
  exposureCategoryNames: [name],
  badgeGroups: GENERIC_BADGE_GROUPS,
  badgeOptions: GENERIC_BADGE_OPTIONS,
  keywordGroups: GENERIC_KEYWORD_GROUPS,
}));

const CURATION_CATEGORIES: CurationCategoryConfig[] = [
  RESTAURANT_CONFIG,
  KIDS_CAFE_CONFIG,
  CAMPING_CONFIG,
  RURAL_VILLAGE_CONFIG,
  EDUCATION_FARM_CONFIG,
  ...GENERIC_CONFIGS,
];

// 노출 중분류가 아직 선택되지 않았거나(신규 스팟) 어떤 config에도 매칭되지 않는
// 값이면 식당 기준으로 되돌린다 — 이 프로젝트에서 가장 먼저, 가장 많이(83건)
// 실사용 중인 카테고리라 기존 동작과 호환된다.
const DEFAULT_CATEGORY_ID = RESTAURANT_CONFIG.categoryId;

export function resolveCurationCategoryId(exposureCategoryName: string | null | undefined): string {
  if (!exposureCategoryName) return DEFAULT_CATEGORY_ID;
  const found = CURATION_CATEGORIES.find((c) => c.exposureCategoryNames.includes(exposureCategoryName));
  return found ? found.categoryId : DEFAULT_CATEGORY_ID;
}

function getCategoryConfig(categoryId: string): CurationCategoryConfig {
  return CURATION_CATEGORIES.find((c) => c.categoryId === categoryId) ?? RESTAURANT_CONFIG;
}

export function getBadgeGroupsForCategory(categoryId: string): string[] {
  return getCategoryConfig(categoryId).badgeGroups;
}

export function getBadgeOptionsForCategory(categoryId: string): CurationBadgeOption[] {
  return getCategoryConfig(categoryId).badgeOptions;
}

export function isKnownCurationBadgeKey(categoryId: string, key: string): boolean {
  return getCategoryConfig(categoryId).badgeOptions.some((opt) => opt.key === key);
}

// 정규식 특수문자가 섞인 키워드는 없지만(전부 한글), 방어적으로 이스케이프한다.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// [공백 무시 매칭](2026-09-07 개선사항3 2번): "아기의자", "아기 의자", "아 기 의 자"를
// 모두 동일하게 매칭하기 위해 키워드의 각 글자 사이에 선택적 공백(\s*)을 끼워 넣는다.
function toWhitespaceInsensitivePattern(keyword: string): string {
  return [...keyword].map(escapeRegExp).join('\\s*');
}

// 정규식에서 캡처 그룹으로 감싼 부분만 split() 결과에 원본 매칭 텍스트로 남는다 —
// 이 매칭 텍스트를 어느 원래 키워드(공백 유무와 무관하게 정규화한 키)가 낳았는지
// 되짚어야 뱃지 자동 체크(4번)에 쓸 수 있다. 공백을 전부 제거한 값을 정규화 키로
// 쓴다(원래 키워드도 공백이 없으므로 서로 일치).
function normalizeForLookup(value: string): string {
  return value.replace(/\s+/g, '');
}

// 카테고리별 "정규화 키워드 → 뱃지 키" 역참조 맵과 하이라이트 정규식을 지연
// 생성 후 캐시한다(카테고리 수만큼 매번 다시 만들 필요 없음).
const keywordLookupCache = new Map<string, Map<string, string>>();
const highlightRegexCache = new Map<string, RegExp>();

function getKeywordToBadgeKeyMap(categoryId: string): Map<string, string> {
  const cached = keywordLookupCache.get(categoryId);
  if (cached) return cached;
  const map = new Map<string, string>();
  for (const [badgeKey, keywords] of Object.entries(getCategoryConfig(categoryId).keywordGroups)) {
    for (const keyword of keywords) map.set(normalizeForLookup(keyword), badgeKey);
  }
  keywordLookupCache.set(categoryId, map);
  return map;
}

// 길이가 긴 키워드부터 매칭해야 "유모차반입"이 "유모차"에 가려 앞부분만 하이라이트되는
// 것을 방지한다(예: "유모차반입" 전체가 아니라 "유모차"만 마킹되는 사고 방지). 정규식
// 대체(|)는 나열 순서대로 첫 매칭을 채택하므로, 원래(공백 없는) 키워드 길이 기준으로
// 정렬하면 공백 삽입 매칭에서도 동일한 우선순위가 유지된다.
function getHighlightRegex(categoryId: string, extraKeywords: string[] = []): RegExp {
  if (extraKeywords.length === 0) {
    const cached = highlightRegexCache.get(categoryId);
    if (cached) return cached;
  }
  const categoryKeywords = Object.values(getCategoryConfig(categoryId).keywordGroups).flat();
  const all = [...categoryKeywords, ...extraKeywords];
  const sorted = [...all].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${sorted.map(toWhitespaceInsensitivePattern).join('|')})`, 'g');
  if (extraKeywords.length === 0) highlightRegexCache.set(categoryId, regex);
  return regex;
}

// 순수 텍스트 배열로 쪼갠 뒤, 매칭된 조각만 <mark>로 감싼 React 노드 배열을 만든다.
// 블로그 본문은 외부(크롤링) 출처라 dangerouslySetInnerHTML로 렌더링하면 XSS 위험이
// 있다 — React가 문자열 자식을 자동으로 이스케이프하는 이 방식이 안전하다.
// [카테고리별 실시간 전환](2026-09-07 개선사항4): categoryId가 바뀌면(관리자가
// 노출 중분류 콤보박스를 바꾸면) 그 카테고리의 키워드만으로 다시 하이라이트한다 —
// 서버 재요청 없이 클라이언트에서 즉시 재계산된다.
// [지역/지점명 동시 하이라이팅](2026-09-07 개선사항3 3번): extraKeywords로 뱃지
// 키워드가 아닌 임의 키워드(지역명 등)도 같은 방식(공백 무시 포함)으로 하이라이트.
export function highlightKeywords(text: string, categoryId: string = DEFAULT_CATEGORY_ID, extraKeywords: string[] = []): ReactNode {
  if (!text) return text;
  const regex = getHighlightRegex(categoryId, extraKeywords);
  const parts = text.split(regex);
  // split()은 홀수 인덱스에 캡처 그룹 매칭 결과를, 짝수 인덱스에 그 사이 일반 텍스트를
  // 담는다 — 매칭인지 여부를 정규식 재실행으로 다시 판정하지 않고 인덱스 패리티로
  // 안전하게 구분한다(빈 문자열 조각을 우연히 알려진 키워드로 오인하는 것도 방지).
  return createElement(
    Fragment,
    null,
    ...parts.map((part, i) =>
      i % 2 === 1
        ? createElement('mark', { key: i, style: { backgroundColor: '#fef08a' } }, part)
        : part
    )
  );
}

// [키워드 하이라이팅에 따른 뱃지 자동 체크](2026-09-07 개선사항3 4번): "블로그 본문 및
// 하이라이트 데이터를 기반으로 관련 뱃지가 1차로 자동 체크(Pre-check)되도록" — 본문
// 텍스트에서 실제로 매칭된 키워드들을 훑어 어느 뱃지가 걸리는지 Set으로 돌려준다.
// 관리자는 이 결과를 보고 문맥상 아니다 싶으면 클릭 한 번으로 체크 해제하면 된다
// (세미오토 검수 — 실제 체크박스 상태 반영은 호출부인 useSpotCurationForm이 담당).
// [카테고리별 독립 판정](2026-09-07 개선사항4): 현재 선택된 노출 중분류의 config
// 기준으로만 판정한다 — 카테고리를 바꾸면 자동 체크 결과도 그 카테고리 기준으로
// 달라진다.
export function matchBadgeKeysFromText(text: string, categoryId: string = DEFAULT_CATEGORY_ID): Set<string> {
  const matched = new Set<string>();
  if (!text) return matched;
  const regex = getHighlightRegex(categoryId);
  const hits = text.match(regex) ?? [];
  const keywordToBadgeKey = getKeywordToBadgeKeyMap(categoryId);
  for (const hit of hits) {
    const badgeKey = keywordToBadgeKey.get(normalizeForLookup(hit));
    if (badgeKey) matched.add(badgeKey);
  }
  return matched;
}
