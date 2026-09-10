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

// [캠핑장/휴양마을/체험농장 뱃지 체계 전면 재작성](2026-09-10 사용자 지시,
// implementation/todo.md 개선사항1): "각 중분류별 뱃지 태그 만들어주고 뱃지별
// keyword 세팅해줘. 그리고 추가적으로 제안할 뱃지나 혹은 키워드 빠진게 있으면
// 더 추가해줘 [캠핑장 / 피크닉장] [휴양마을] [교육체험 / 체험농장]" — 2026-09-10
// 1차(Step 90)에 임시로 잡았던 cp_/rv_/ef_ 키를 폐기하고, todo.md가 확정한 뱃지
// 키/라벨/키워드 목록(CAMPING_TRAMPOLINE / NEG_BACKPACKING / RURAL_* / EDU_*
// 명명 규칙)으로 전면 교체한다. 이 3개 노출 중분류에 저장된 기존 curation_badges는
// 0건이라(Step 90 구현 기록에서 실측 확인) 데이터 마이그레이션은 불필요하다.
//
// 텍스트 마이닝 철학(todo.md 공통 원칙): 표준어 외에 구어체·외래어 변형
// (트램폴린/트램펄린 등)·블로그 후기 속 생생한 유의어를 폭넓게 반영한다. 다만
// 단일 음절 키워드('양', '벌')나 어느 후기에나 등장하는 초광역 단어(맨 '체험')는
// 자동 체크가 매 스팟마다 오검출을 쏟아내 검수 워크플로를 오히려 방해하므로,
// todo.md 스펙에서 그런 항목은 오검출이 적은 구(句) 단위로 구체화했다(예:
// '양'→'양떼'/'염소', '벌'→'벌 쏘'/'말벌', 맨 '체험'→'체험활동'). 뱃지 키·라벨
// 자체는 스펙 그대로다.
//
// [네거티브(주의/제한) 뱃지] curation_badges는 단순 키 배열이라 포지티브/
// 네거티브를 스키마로 구분할 필요가 없다 — "주의/제한" 그룹명으로만 묶어
// 관리자가 어린이 동반 시 배제 요소를 명확히 체크하게 한다.
const CAMPING_CONFIG: CurationCategoryConfig = {
  categoryId: 'camping',
  exposureCategoryNames: ['캠핑장 / 피크닉장'],
  badgeGroups: ['놀이/물놀이', '편의/시설', '캠핑 유형', '주의/제한'],
  badgeOptions: [
    { key: 'CAMPING_TRAMPOLINE', label: '트램폴린/방방', group: '놀이/물놀이' },
    { key: 'CAMPING_WATER_PLAY', label: '수영장/물놀이장/계곡 인접', group: '놀이/물놀이' },
    { key: 'CAMPING_SAND', label: '모래놀이터', group: '놀이/물놀이' },
    // [제안 추가 뱃지] todo.md "제안할 뱃지 더 추가해줘" — 놀이터는 어린 자녀
    // 동반 캠핑의 대표 편의 요소인데 스펙 목록에서 빠져 있어 보완한다.
    { key: 'CAMPING_PLAYGROUND', label: '놀이터 있음', group: '놀이/물놀이' },
    { key: 'CAMPING_WARM_WATER', label: '온수 샤워/온수 개수대', group: '편의/시설' },
    { key: 'CAMPING_FLAT_SITE', label: '평탄한 부지', group: '편의/시설' },
    { key: 'CAMPING_STORE', label: '매점 편의성 좋음', group: '편의/시설' },
    { key: 'CAMPING_GLAMPING_CARAVAN', label: '글램핑/카라반/온돌 사이트', group: '캠핑 유형' },
    { key: 'NEG_BACKPACKING', label: '백패킹/오지 전용', group: '주의/제한' },
    { key: 'NEG_NO_KIDS', label: '노키즈존/성인 전용', group: '주의/제한' },
    { key: 'NEG_NO_ELECTRICITY', label: '전기 미사용 사이트', group: '주의/제한' },
    { key: 'NEG_ROUGH_TERRAIN', label: '험지/고지대', group: '주의/제한' },
    { key: 'NEG_PET_ONLY', label: '반려동물 전용 캠핑장', group: '주의/제한' },
    { key: 'NEG_DANGEROUS_VALLEY', label: '안전펜스 없는 계곡/급류', group: '주의/제한' },
  ],
  keywordGroups: {
    CAMPING_TRAMPOLINE: ['방방', '방방이', '방방장', '방방존', '트램폴린', '트램펄린', '퐁퐁', '봉봉'],
    CAMPING_WATER_PLAY: ['수영장', '물놀이장', '풀장', '계곡물', '계곡', '물놀이', '유아풀', '발담그기'],
    CAMPING_SAND: ['모래놀이터', '모래사장', '모래놀이', '모래 털이', '모래존'],
    CAMPING_PLAYGROUND: ['놀이터', '어린이놀이터', '유아놀이터', '놀이시설'],
    CAMPING_WARM_WATER: ['온수개수대', '온수샤워', '온수가 잘', '온수 콸콸', '온수', '따뜻한 물', '뜨거운 물'],
    CAMPING_FLAT_SITE: ['평탄한', '평지', '경사 없', '발판 편한', '파쇄석 평탄', '데크 사이트'],
    CAMPING_GLAMPING_CARAVAN: ['글램핑', '카라반', '캠핑카', '온돌방', '방갈로', '펜션형', '몸만 가는', '텐트 대여'],
    CAMPING_STORE: ['매점', '장작 판매', '간식 파는 곳', '편의점 있', '얼음 판매'],
    NEG_BACKPACKING: ['백패킹', '오지', '노지', '주차장에서 짐', '수레로 이동', '사이트까지 걸어서', '리어카'],
    NEG_NO_KIDS: ['노키즈존', '노키즈', '성인전용', '어린이 입장 불가', '조용한 캠핑장'],
    NEG_NO_ELECTRICITY: ['전기 안됨', '전기 미사용', '릴선 필요 없', '오프그리드', '전기 불가'],
    NEG_ROUGH_TERRAIN: ['험지', '고지대', '경사 심함', '오르막 험함', '4륜 필수'],
    NEG_PET_ONLY: ['반려동물 전용', '애견 전용', '애견동반 전문', '반려견 놀이터'],
    NEG_DANGEROUS_VALLEY: ['안전펜스 없', '급류', '위험한 계곡', '물살 센', '추락 위험'],
  },
};

// [휴양체험마을] 내륙·어촌 통합형(todo.md 개선사항1-2).
const RURAL_VILLAGE_CONFIG: CurationCategoryConfig = {
  categoryId: 'rural_village',
  exposureCategoryNames: ['휴양마을'],
  badgeGroups: ['물놀이/자연', '체험 프로그램', '공간/숙박/인프라', '주의/제한'],
  badgeOptions: [
    { key: 'RURAL_STREAM_PLAY', label: '냇가/계곡/갯벌 물놀이', group: '물놀이/자연' },
    { key: 'RURAL_ANIMAL_FEEDING', label: '동물 먹이주기/교감', group: '체험 프로그램' },
    { key: 'RURAL_TRADITIONAL_FOOD', label: '전통 요리·만들기 체험', group: '체험 프로그램' },
    { key: 'RURAL_CROP_HARVEST', label: '농작물 수확 체험', group: '체험 프로그램' },
    { key: 'RURAL_SPACIOUS_YARD', label: '안전한 넓은 잔디마당/광장', group: '공간/숙박/인프라' },
    { key: 'RURAL_ACCOMMODATION', label: '마을 숙박/펜션 연계', group: '공간/숙박/인프라' },
    { key: 'RURAL_NEARBY_INFRA', label: '주변 생활 인프라 인접', group: '공간/숙박/인프라' },
    { key: 'NEG_DEEP_VALLEY', label: '안전펜스 없는 위험한 냇가/계곡', group: '주의/제한' },
    { key: 'NEG_REMOTE_VILLAGE', label: '오지 마을/진입로 협소', group: '주의/제한' },
    { key: 'NEG_POOR_FACILITY', label: '노후화된 편의/화장실 시설', group: '주의/제한' },
  ],
  keywordGroups: {
    RURAL_STREAM_PLAY: ['냇가', '계곡', '갯벌', '다슬기', '조개캐기', '물놀이', '발담그기', '얕은 물'],
    RURAL_TRADITIONAL_FOOD: ['떡메치기', '인절미 만들기', '피자 만들기', '가마솥', '만들기 체험', '전통요리', '요리 체험'],
    RURAL_CROP_HARVEST: ['수확', '감자캐기', '고구마캐기', '딸기따기', '사과따기', '농작물 따기', '작물 수확'],
    RURAL_ANIMAL_FEEDING: ['먹이주기', '토끼', '염소', '동물농장', '자연학습', '교감체험'],
    RURAL_SPACIOUS_YARD: ['잔디마당', '넓은 공터', '마을 광장', '차 없는 거리', '마음껏 뛰어놀', '넓은 잔디밭'],
    RURAL_ACCOMMODATION: ['숙박 가능', '마을 펜션', '체험관 숙소', '민박', '1박2일', '숙박 체험'],
    RURAL_NEARBY_INFRA: ['하나로마트', '편의점', '약국', '보건소', '차로 5분', '마트 가까'],
    NEG_DEEP_VALLEY: ['안전펜스 없', '물살 센', '깊은 계곡', '추락 위험'],
    NEG_REMOTE_VILLAGE: ['오지', '꼬불꼬불 길', '진입로 좁', '대중교통 불가', '차 없이는'],
    NEG_POOR_FACILITY: ['화장실 낡', '시설 노후', '휴게실 협소', '매점 없'],
  },
};

// [교육체험 / 체험농장](todo.md 개선사항1-3). service_categories.category_name은
// '체험농장·농원' 한 개다.
const EDUCATION_FARM_CONFIG: CurationCategoryConfig = {
  categoryId: 'education_farm',
  exposureCategoryNames: ['체험농장·농원'],
  badgeGroups: ['체험 프로그램', '편의/안전', '주의/제한'],
  badgeOptions: [
    { key: 'EDU_MAKING_COOKING', label: '요리·공예 만들기 체험', group: '체험 프로그램' },
    { key: 'EDU_CROP_HARVEST', label: '농작물 수확·관찰 학습', group: '체험 프로그램' },
    { key: 'EDU_ANIMAL_EXPERIENCE', label: '동물 교감·승마 체험', group: '체험 프로그램' },
    { key: 'EDU_FARM_MACHINE', label: '트랙터·농기구 탑승 체험', group: '체험 프로그램' },
    { key: 'EDU_INDOOR_RAINY', label: '우천 대비 실내 학습장', group: '편의/안전' },
    { key: 'EDU_SAFETY_STAFF', label: '안전 관리 인력 상주/전문 인솔', group: '편의/안전' },
    { key: 'NEG_EDU_PESTS_RISK', label: '벌·모기 등 해충 주의 야외', group: '주의/제한' },
    { key: 'NEG_EDU_MACHINE_HAZARD', label: '농기계 이동 구간 등 안전 주의', group: '주의/제한' },
  ],
  keywordGroups: {
    EDU_MAKING_COOKING: ['만들기', '요리', '쿠킹', '공예', '빚기', '담그기', '그림그리기', '도자기', '체험활동'],
    EDU_CROP_HARVEST: ['수확', '따기', '캐기', '채집', '농사', '자연관찰', '자연학습'],
    EDU_ANIMAL_EXPERIENCE: ['동물체험', '승마', '먹이주기', '토끼', '양떼', '염소', '교감', '동물농장', '목장'],
    EDU_INDOOR_RAINY: ['실내체험', '비와도', '우천', '비닐하우스', '실내교육장', '실내 프로그램'],
    EDU_SAFETY_STAFF: ['안전요원', '선생님 인솔', '선생님 케어', '전문 강사', '인솔 선생님', '체험 지도사'],
    EDU_FARM_MACHINE: ['트랙터', '경운기', '농기구 탑승', '수레 타기', '이색 탈것'],
    NEG_EDU_PESTS_RISK: ['모기', '해충', '날파리', '진드기', '벌레 많', '벌 쏘', '말벌', '벌집'],
    NEG_EDU_MACHINE_HAZARD: ['농기계 이동', '차량 조심', '위험 구간', '안전 주의', '차량 통행'],
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
