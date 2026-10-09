// [문화센터 통합 테이블 매핑 — 공유](2026-10-06, project/decision-log.md
// Decision 028): emart_culture_club_classes/lottemart_culture_club_classes의
// 한 행을 culture_club_classes 행 모양으로 변환한다. 1회성 복사 스크립트
// (scripts/migrations/2026-10-06-backfill-culture-club-classes-unified.mjs)
// 와 매일 도는 ingest 스크립트(emart-culture-club.mjs/lottemart-culture-
// club.mjs)의 "이중 쓰기"가 이 함수를 공유해 매핑 로직이 둘로 갈라지지
// 않게 한다.
//
// [실측으로 발견한 버그] created_at/updated_at/detail_fetched_at은 원본 ingest
// 스크립트의 upsert payload에 원래 없는 키다(DB 기본값/보존 동작에 맡기려는
// 의도 — "created_at은 upsert payload에 포함하지 않아 각 행의 '최초 수집
// 시각'을 보존한다" 주석 참고). collected_at은 한때 같은 취급을 받았으나,
// 그 결과 이미 존재하는 강좌는 가격/상태가 매일 갱신돼도 화면의 "마지막
// 업데이트" 표시만 최초 수집 시각에 영원히 고정되는 버그가 있었다(2026-10-07
// 사용자 지적으로 발견) — 지금은 ingest 스크립트가 매 실행 시각을 명시적으로
// 넘겨준다(emart-culture-club.mjs/lottemart-culture-club.mjs 참고). 이 함수가
// `collected_at: row.collected_at`처럼 값이 undefined여도 키 자체를 만들어
// 반환하면(1회성 백필 스크립트처럼 collected_at을 안 넘기는 호출자가 있을 때),
// Supabase 대량 upsert가(단일 행 insert와 달리) 그 키를 명시적 null로 보내
// NOT NULL 제약을 위반한다(실제 라이브 실행 중 발견: "null value in column
// \"collected_at\" ..." 에러). 그래서 반환 직전에 undefined 값을 가진 키를
// 전부 제거해, 정말로 "키가 없던" 원본과 동일하게 만든다.
function omitUndefinedKeys(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

export function toUnifiedEmartRow(row) {
  return omitUndefinedKeys(buildUnifiedEmartRow(row));
}

function buildUnifiedEmartRow(row) {
  return {
    brand: 'emart',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: row.main_category_name,
    sub_category_name: row.sub_category_name,
    classroom: row.classroom,
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: row.class_original_fee,
    class_fee: row.class_fee,
    class_material_fee: row.class_material_fee,
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: row.round,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.filter_status,
    register_start_at: row.register_start_at,
    is_excluded: row.is_excluded ?? false,
    raw_extra: {
      main_category_code: row.main_category_code,
      sub_category_code: row.sub_category_code,
      store_center: row.store_center,
      min_class_capacity: row.min_class_capacity,
      class_capacity: row.class_capacity,
      semester_year: row.semester_year,
      semester: row.semester,
      class_type: row.class_type,
      occupied_full_flag: row.occupied_full_flag,
      channel_online: row.channel_online,
      channel_offline: row.channel_offline,
      register_start_date: row.register_start_date,
      register_end_date: row.register_end_date,
      class_start_date: row.class_start_date,
      class_end_date: row.class_end_date,
      class_closed_date: row.class_closed_date,
      class_detail_title: row.class_detail_title,
      class_detail_content: row.class_detail_content,
      main_image_bucket: row.main_image_bucket,
      main_image_region: row.main_image_region,
      main_image_key: row.main_image_key,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function toUnifiedLottemartRow(row) {
  return omitUndefinedKeys(buildUnifiedLottemartRow(row));
}

function buildUnifiedLottemartRow(row) {
  return {
    brand: 'lottemart',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: row.main_category_name,
    sub_category_name: row.sub_category_name,
    classroom: row.classroom,
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: row.class_original_fee,
    class_fee: row.class_fee,
    class_material_fee: row.class_material_fee,
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: row.round,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.registration_status,
    register_start_at: null, // 롯데마트는 이 개념 자체가 없다(실측 확인)
    is_excluded: row.is_excluded ?? false,
    raw_extra: {
      age_range_text: row.age_range_text,
      session_count: row.session_count,
      discount_badge_text: row.discount_badge_text,
      is_closing_soon: row.is_closing_soon,
      is_new: row.is_new,
      like_count: row.like_count,
      semester_code: row.semester_code,
      target_code: row.target_code,
      target_name: row.target_name,
      class_code: row.class_code,
      class_intro: row.class_intro,
      class_tip: row.class_tip,
      main_image_url: row.main_image_url,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// [AK플라자 — 통합 테이블 직접 쓰기](2026-10-09) 신세계와 동일한 구조
// (별도 원본 스테이징 테이블 없음) — 다만 이미지는 목록 응답 자체에 이미
// 있어(akplaza-culture-club-parser.mjs의 buildThumbnailUrl 참고) 별도
// 상세수집 단계가 채울 필요가 없고, 강좌 소개 텍스트(lect_info)만
// akplaza-culture-club-detail.mjs가 1회성으로 채운다 — 그래서 이중 쓰기
// 방지(mergeDetailEnrichment)가 class_intro 하나에만 필요하다.
export function toUnifiedAkplazaRow(row) {
  return omitUndefinedKeys(buildUnifiedAkplazaRow(row));
}

function buildUnifiedAkplazaRow(row) {
  return {
    brand: 'ak_plaza',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    // [분류 2단계 — AK플라자는 수강대상/강좌분야를 둘 다 구조화된 필드로
    // 갖는다](실측 확인, akplaza-culture-club-parser.mjs parseLecture 주석
    // 참고) main_category_name=수강대상 한글 라벨, sub_category_name=
    // 강좌분야(SECT_NM) — 이마트와 동일한 2단계 분류 구조.
    main_category_name: row.main_category_name,
    sub_category_name: row.sub_category_name,
    classroom: null, // 목록 응답의 CLASSROOM은 항상 " / 층-호" 템플릿 placeholder라 저장하지 않음(실측 확인)
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: null, // 목록에 할인 전 가격이 별도로 없음(실측 확인)
    class_fee: row.class_fee,
    class_material_fee: row.class_material_fee,
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: null,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.raw_status,
    register_start_at: null, // 목록에 접수 시작 시각 개념이 노출되지 않는다(실측 확인, 추측 금지)
    is_excluded: row.is_excluded ?? false,
    raw_extra: {
      main_cd: row.main_cd,
      sect_cd: row.sect_cd,
      subject_fg_name: row.subject_fg_name,
      reco_cnt: row.reco_cnt,
      // [이미지 — 목록 단계에서 바로 채움](akplaza-culture-club-parser.mjs
      // buildThumbnailUrl 참고) 상세 페이지의 이미지 블록은 사이트 자체가
      // 꺼둔 상태라(실측 확인) 상세수집 스크립트는 이 필드를 건드리지 않는다.
      main_image_url: row.main_image_url,
      // [소개 텍스트 — akplaza-culture-club-detail.mjs가 채움] 목록 응답엔
      // 없고 상세 페이지의 #lect_info에만 있다. 이 메인 배치 자신은 채우지
      // 않고, fetchDetailEnrichmentByClassId가 기존 값을 읽어와 병합해줄
      // 때만 값이 들어온다(없으면 undefined → omitUndefinedKeys가 제거).
      class_intro: row.class_intro,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// [현대백화점 — 통합 테이블 직접 쓰기](2026-10-08) 이마트/롯데마트와 달리
// 별도 원본 스테이징 테이블이 없다 — 목록 페이지에 썸네일까지 이미 포함돼
// 있어(실측 확인) 1회성 상세수집 단계 자체가 필요 없기 때문이다(그래서
// mergeDetailEnrichment()를 쓸 필요도 없다). hyundai-culture-club.mjs가
// 파싱한 행을 여기서 바로 통합 테이블 모양으로 바꿔 upsert한다.
export function toUnifiedHyundaiRow(row) {
  return omitUndefinedKeys(buildUnifiedHyundaiRow(row));
}

function buildUnifiedHyundaiRow(row) {
  return {
    brand: 'hyundai',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: null, // 현대백화점은 이 단계(목록) 구조상 상위 분류가 없다(추측 금지)
    sub_category_name: row.sub_category_name,
    classroom: null, // 목록에 없음 — 상세 페이지를 따로 긁지 않기로 했으므로 비워둔다
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: null, // 목록에서 할인 전 가격이 별도로 보이지 않음(실측 확인)
    class_fee: row.class_fee,
    class_material_fee: null,
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: null,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.raw_status,
    register_start_at: null, // 현대백화점도 이 개념이 목록에 노출되지 않는다(추측 금지)
    is_excluded: row.is_excluded ?? false,
    raw_extra: {
      category_keyword: row.category_keyword,
      sq_cd: row.sq_cd,
      crs_cd: row.crs_cd,
      pro_cust_no: row.pro_cust_no,
      main_image_url: row.main_image_url,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// [신세계 아카데미 — 목록 직결](2026-10-08, implementation/todo.md 개선사항2):
// 현대백화점과 동일하게 목록 응답 자체에 필요한 필드가 다 있어 별도
// 상세수집 단계가 없다 — 원본 스테이징 테이블 없이 통합 테이블에 바로 쓴다.
export function toUnifiedShinsegaeRow(row) {
  return omitUndefinedKeys(buildUnifiedShinsegaeRow(row));
}

function buildUnifiedShinsegaeRow(row) {
  return {
    brand: 'shinsegae',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: null, // 목록에 상위 분류 필드가 없다(추측 금지)
    // [수강대상 라벨 — getCommCode.do(headCode=0025)로 확정](2026-10-08
    // 사용자 제보로 발견) B1=위드맘(대디)/B2=키즈/C1=패밀리 — 다른 브랜드의
    // sub_category_name과 동일한 자리에 그대로 노출해 화면에서 바로 보이게 한다.
    sub_category_name: row.target_name ?? null,
    classroom: null,
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: null, // 목록에 할인 전 가격이 별도로 없음(실측 확인)
    class_fee: row.class_fee,
    class_material_fee: null,
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: null,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.raw_status,
    // [접수 시작 시각 — 날짜만 있고 시각이 없음](실측 확인) 다른 브랜드의
    // register_start_at(정밀 시각, 접수시작 10분 전 알림 대상)과 같은
    // 정밀도가 없어 가짜 시각을 채우지 않는다 — raw_extra의 날짜 문자열로만
    // 표시용으로 쓴다.
    register_start_at: null,
    is_excluded: row.is_excluded ?? false,
    raw_extra: {
      target_code: row.target_code,
      target_name: row.target_name,
      semester_code: row.semester_code,
      // [외부 신청 딥링크 파라미터](2026-10-08 사용자 제공 URL로 확정)
      // HP0010P1.do?yearCode=...&smstCode=...&storeCode=...&lectCode=...
      // — smstCode/storeCode/lectCode는 이미 다른 컬럼에 있어 year_code만
      // 추가로 보존하면 된다.
      year_code: row.year_code,
      register_start_date: row.register_start_date,
      register_end_date: row.register_end_date,
      // [상세정보 — shinsegae-culture-club-detail.mjs가 채움](2026-10-08
      // 사용자 지시: "상세내용도 긁어오는거지? 이미지도?") 목록 응답엔
      // 없고 상세 페이지에만 있다 — 이 메인 배치 자신은 채우지 않고,
      // 위 fetchDetailEnrichmentByClassId가 기존 값을 읽어와 병합해줄
      // 때만 값이 들어온다(없으면 undefined → omitUndefinedKeys가 제거).
      main_image_url: row.main_image_url,
      class_intro: row.class_intro,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// [스타필드 문화센터(클래스콕) — 목록 직결](2026-10-09, 사용자 승인:
// "그렇게 진행하자") 신세계/AK플라자와 동일한 구조(별도 원본 스테이징
// 테이블 없음) — 이미지는 목록 응답 자체에 이미 있어(thumbnailImgPath)
// 별도 상세수집 단계가 채울 필요가 없고, 강좌 소개 텍스트만 starfield-
// culture-club-detail.mjs가 1회성으로 채운다.
export function toUnifiedStarfieldRow(row) {
  return omitUndefinedKeys(buildUnifiedStarfieldRow(row));
}

function buildUnifiedStarfieldRow(row) {
  return {
    brand: 'starfield',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: null, // 목록에 상위 분류 필드가 없다(추측 금지)
    // [수강대상 라벨 — 응답에 없어 호출 컨텍스트가 채움](실측 확인,
    // starfield-culture-club-parser.mjs 주석 참고) 신세계와 동일하게
    // sub_category_name 자리에 노출한다.
    sub_category_name: row.target_name ?? null,
    classroom: null, // 목록에 강의실 정보가 없다(실측 확인)
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    // [학습비/재료비 분리 — 항상 null, 총액만 신뢰 가능](실측 확인,
    // starfield-culture-club-parser.mjs 주석 참고) class_original_fee에는
    // 할인 전 총액(다른 브랜드와 달리 실제로 존재)을 넣는다.
    class_original_fee: row.class_original_fee,
    class_fee: row.class_fee,
    class_material_fee: null,
    instructor_name: null, // pfmcoNm은 업체명이라 개인 강사명이 아니다(raw_extra에 보존)
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: null,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.raw_status,
    // [접수 시작 시각 — 날짜+시각까지 정밀하게 제공됨](실측 확인) 다른
    // 브랜드와 달리 emart와 동일한 정밀도의 register_start_at을 그대로
    // 쓸 수 있다.
    register_start_at: row.register_start_at,
    is_excluded: row.is_excluded ?? false,
    raw_extra: {
      target_code: row.target_code,
      target_name: row.target_name,
      pfmco_nm: row.pfmco_nm,
      fdtr_yn: row.fdtr_yn,
      lctr_type: row.lctr_type,
      register_end_at: row.register_end_at,
      // [이미지 — 목록 단계에서 바로 채움](실측 확인: thumbnailImgPath가
      // 이미 완전한 URL) rehost-culture-club-thumbnails.mjs(브랜드 공용)
      // 가 이 raw_extra.main_image_url을 그대로 재호스팅 대상으로 읽는다.
      main_image_url: row.main_image_url,
      // [소개 텍스트 — starfield-culture-club-detail.mjs가 채움] 목록
      // 응답엔 없고 상세 페이지에만 있다. 이 메인 배치 자신은 채우지
      // 않고, fetchDetailEnrichmentByClassId가 기존 값을 읽어와 병합해줄
      // 때만 값이 들어온다(없으면 undefined → omitUndefinedKeys가 제거).
      class_intro: row.class_intro,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// [롯데백화점 문화센터 — 다른 브랜드와 다른 설계: 상세수집이 핵심 구조화
// 컬럼을 채움](2026-10-09 사용자 지시: "상세꺼가 중요해") 목록 응답은
// 지점/상태/제목/이미지만 믿을 수 있고(요일·시간은 "세부 일정 선택"처럼
// 없는 경우가 있고, 강사명/강의실/정확한 연령은 아예 없음) — 상세
// 페이지(<dt>/<dd>)가 훨씬 구조화된 진짜 데이터를 준다. 그래서 이 목록
// 배치는 "뼈대" 행만 만들고, 나머지 구조화 컬럼(instructor_name/
// classroom/class_fee/class_day/start_time/end_time/schedule_*_date/
// total_sessions/min_max_age_months)은 lotte-department-culture-club-
// detail.mjs가 UPDATE로 직접 채운다. 이 목록 배치가 재실행될 때(4~6시간
// 주기) 이미 상세수집된 값을 지우지 않도록, row에 그 필드들이 있으면
// (fetchDetailEnrichmentByClassId가 기존 DB 값을 읽어와 병합해줬을 때만)
// 그대로 전달하고, 없으면(처음 수집 또는 상세수집 전) undefined로 비워
// omitUndefinedKeys가 제거하게 한다 — 다른 브랜드의 class_intro 전용
// merge와 동일한 메커니즘을 더 많은 컬럼으로 확장한 것일 뿐이다.
export function toUnifiedLotteDepartmentRow(row) {
  return omitUndefinedKeys(buildUnifiedLotteDepartmentRow(row));
}

function buildUnifiedLotteDepartmentRow(row) {
  return {
    brand: 'lotte_department',
    source_class_id: row.class_id,
    class_title: row.class_title,
    store_code: row.store_code,
    store_name: row.store_name,
    main_category_name: null, // 목록에 상위 분류 필드가 없다(추측 금지)
    classroom: row.classroom,
    class_day: row.class_day,
    start_time: row.start_time,
    end_time: row.end_time,
    class_original_fee: null, // 할인 전/후 구분이 보이지 않는다(실측 확인)
    class_fee: row.class_fee,
    class_material_fee: null, // 재료비는 소개 텍스트 안의 자유 서술일 뿐 구조화 필드가 아니다(추측 금지)
    instructor_name: row.instructor_name,
    min_age_months: row.min_age_months,
    max_age_months: row.max_age_months,
    schedule_start_date: row.schedule_start_date,
    schedule_end_date: row.schedule_end_date,
    schedule_days_code: row.schedule_days_code,
    round: null,
    total_sessions: row.total_sessions,
    normalized_status: row.normalized_status,
    raw_status: row.raw_status,
    register_start_at: null, // 접수기간은 날짜만 있고 시각이 없다(실측 확인) — raw_extra에 날짜만 보존
    is_excluded: row.is_excluded ?? false,
    raw_extra: {
      brch_cd: row.brch_cd,
      yy: row.yy,
      lect_smster_cd: row.lect_smster_cd,
      lect_cd: row.lect_cd,
      lect_gubun: row.lect_gubun,
      target_gubun: row.target_gubun,
      capacity: row.capacity,
      register_start_date: row.register_start_date,
      register_end_date: row.register_end_date,
      contact_phone: row.contact_phone,
      main_image_url: row.main_image_url,
      class_intro: row.class_intro,
    },
    detail_fetched_at: row.detail_fetched_at,
    collected_at: row.collected_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
