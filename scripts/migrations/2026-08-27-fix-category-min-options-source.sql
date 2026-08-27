-- [/admin/data-grid "표준 중분류" 필터 옵션이 실제 데이터와 불일치](2026-08-27)
--
-- 실측 확인: get_category_min_options()는 실제 events/open_spaces.category_min이 아니라
-- category_rules(키워드 규칙 관리 테이블)에서 distinct 값을 뽑고 있었다(2026-08-26 도입 시
-- 의도: "실제 데이터에 아직 한 건도 없는 카테고리도 필터 옵션에 노출"). 그런데 그 이후 여러
-- 차례의 분류 체계 개편(7대 대분류, 36종 중분류, FACILITY 10대 타겟 재배정, MINCLASSNM
-- 0순위 RAW 직접 매핑 등)이 category_rules 테이블은 갱신하지 않은 채 events/open_spaces의
-- 실제 category_min 값만 바꿔 두 테이블이 어긋났다. 실측 결과:
-- - events: category_rules에는 있지만 실제 0건인 값 1개("서울형키즈카페", 구 이름) — 선택하면
--   0건이 나오는 원인.
-- - events: 실제 데이터엔 있지만 category_rules엔 없어 필터 목록에서 아예 빠진 값 33개
--   (공공키즈카페/어린이실내놀이터/기타/각종 FACILITY류 등) — "표준 중분류 목록에 이 값들이
--   다 빠졌다"는 지적의 원인.
-- - open_spaces: 2개 누락("민원 등 기타" 등).
--
-- category_rules는 "키워드 규칙 관리"(재분류 자동화) 용도로는 계속 유효하지만, 어드민 필터
-- 옵션의 근거로는 더 이상 신뢰할 수 없다 — 화면보다 데이터를 우선한다(제5장 제5조)는 원칙에
-- 따라 실제 category_min 컬럼에서 직접 distinct를 뽑도록 되돌린다. plpgsql로 target_table별
-- 분기해 관련 없는 테이블(예: events 조회 시 open_spaces 12만 건)을 불필요하게 스캔하지
-- 않도록 한다.
create or replace function public.get_category_min_options(p_target_table text)
returns table (category_min text) as $$
begin
  if p_target_table = 'events' then
    return query
      select distinct e.category_min
      from public.events e
      where e.category_min is not null
      order by e.category_min;
  elsif p_target_table = 'open_spaces' then
    return query
      select distinct o.category_min
      from public.open_spaces o
      where o.category_min is not null
      order by o.category_min;
  end if;
end;
$$ language plpgsql stable;
