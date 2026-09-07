-- [카테고리별 뱃지/룰 완전 독립 Config 구조 도입에 따른 데이터 초기화](2026-09-07
-- 사용자 지시): "기존 17건의 키즈카페 큐레이션? 아.. 그냥 초기화해.. 17건의
-- 키즈카페 식당용 뱃지"
--
-- 실측 확인: service_category_id='fdb7161b-744c-45a2-b43d-c8556b82bada'
-- ("키즈카페 / 실내놀이터")로 이미 큐레이션된 17건이, 카테고리 독립 뱃지 구조
-- 도입 전에는 유일한 전역 뱃지 목록(식당 기준 — 좌식/온돌, 키즈 메뉴 등)만 보고
-- 체크됐다. 이 뱃지 키들은 새 키즈카페 전용 config(kc_* 접두)에 존재하지 않아
-- 그대로 두면 화면에 아무것도 표시되지 않는 죽은 값으로 남는다 — 사용자 지시대로
-- 전부 초기화해 관리자가 새 키즈카페 전용 뱃지로 다시 체크하게 한다.
update public.spot_curations
set curation_badges = '{}'
where spot_id in (
  select o.id from public.open_spaces o
  where o.service_category_id = 'fdb7161b-744c-45a2-b43d-c8556b82bada'
);
