-- [유아숲체험원 전용 뱃지 태깅](todo.md 개선사항2, 2026-10-16 사용자 지시):
-- 5개 요청 뱃지 중 데이터로 근거를 확인한 3개만 자동 태깅한다(나머지 2개 —
-- 주차 가능/화장실 유무 — 는 근거 데이터가 없어 badgeOptions만 만들고 자동
-- 태깅하지 않음, src/lib/admin/curation-badges.ts의 FOREST_EXPERIENCE_CONFIG
-- 주석 참고). 374건 중 1건만 기존 spot_curations 행이 있어(실측 확인), 나머지는
-- 이 스크립트가 upsert로 새로 만든다 — 기존에 수기로 체크된 뱃지(있다면)는
-- curation_badges 배열 합집합으로 보존한다(2026-09-28-tag-children-library-
-- badges.mjs와 동일한 원칙).

-- 1) 상시 무료 개방: category_min='유아숲체험원' 전체(374건)에 구조적 사실로
--    일괄 태깅. 공공 데이터 원천(지자체 운영)은 사용자가 이미 "대부분 무료·상시
--    개방"이라고 전제를 명시했다 — 예외가 드러나면 그때 개별 제외한다.
insert into spot_curations (spot_id, curation_badges)
select id, array['always_free_open']
from open_spaces
where category_min = '유아숲체험원'
on conflict (spot_id) do update
set curation_badges = (
  select array_agg(distinct x)
  from unnest(spot_curations.curation_badges || excluded.curation_badges) x
);

-- 2) 유모차 진입 가능: raw_data.COT_NAME_03이 실제로 '접근성'을 가리키는 행만
--    대상(동일 컬럼 번호가 테마별로 다른 의미로 쓰이는 걸 실측 확인 — 일부 행은
--    "조성년도" 등 엉뚱한 값). 그중 "양호/매우양호/좋음/매우좋음"으로 시작하는
--    행만 태깅(보통/null/깨진 값은 근거 불충분으로 제외, 추측 금지).
insert into spot_curations (spot_id, curation_badges)
select id, array['stroller']
from open_spaces
where category_min = '유아숲체험원'
  and raw_data->>'COT_NAME_03' = '접근성'
  and raw_data->>'COT_VALUE_03' ~ '^(매우)?(양호|좋음)'
on conflict (spot_id) do update
set curation_badges = (
  select array_agg(distinct x)
  from unnest(spot_curations.curation_badges || excluded.curation_badges) x
);

-- 3) 숲체험 프로그램 운영: 제목/장소명에 "유아숲체험"이 포함된 활성 이벤트와
--    좌표 30m 이내(match_events_to_open_spaces RPC와 동일한 반경 기준 재사용,
--    제5장 제4조)인 유아숲체험원 스팟에 태깅. events.space_id 자동 연결(일반
--    매칭기)은 33건 중 3건만 돼 있어(실측 확인) 그대로 믿을 수 없어 직접
--    반경 매칭한다.
insert into spot_curations (spot_id, curation_badges)
select distinct os.id, array['forest_program']
from open_spaces os
join events e
  on e.is_active = true
  and e.location is not null
  and (e.title ilike '%유아숲체험%' or e.venue_name ilike '%유아숲체험%')
  and st_dwithin(os.location::geography, e.location::geography, 30)
where os.category_min = '유아숲체험원'
  and os.location is not null
on conflict (spot_id) do update
set curation_badges = (
  select array_agg(distinct x)
  from unnest(spot_curations.curation_badges || excluded.curation_badges) x
);

-- 결과 확인용
select
  count(*) filter (where 'always_free_open' = any(sc.curation_badges)) as always_free_open_count,
  count(*) filter (where 'stroller' = any(sc.curation_badges)) as stroller_count,
  count(*) filter (where 'forest_program' = any(sc.curation_badges)) as forest_program_count
from open_spaces os
join spot_curations sc on sc.spot_id = os.id
where os.category_min = '유아숲체험원';
