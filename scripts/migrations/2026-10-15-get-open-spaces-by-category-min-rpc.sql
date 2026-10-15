-- [네이버 플레이스 키즈친화 스크래핑 에이전트](todo.md 개선사항4, 2026-10-15 사용자 지시):
-- "표준 중분류가 기타 >> 식당인 것에 대하여 csv파일로 추출해줘" — 실측 확인 결과
-- "기타 >> 식당"은 open_spaces.category(ETC)가 아니라, 관리자 화면의 표준중분류
-- 그룹 드롭다운(category-min-groups.ts)에서 어떤 major 그룹의 minors 목록에도
-- 속하지 않아 자동으로 '기타' 버킷에 떨어지는 category_min 값을 가리킨다
-- ('식당' 자체는 '놀이방식당'/'키즈친화 식당(오케이존)'과 달리 그 어떤 정적 그룹에도
-- 없음 — buildCategoryMinGroups의 unassigned → '기타' 병합 로직). 즉 단순히
-- open_spaces.category_min = '식당'인 행 전체(1,612건, 실측)를 뜻한다.
--
-- 이름/주소/좌표만 뽑아 CSV로 내보내는 용도라 get_spots_by_service_category(2026-09-08)와
-- 동일한 반환 패턴(standard_name 우선, ST_X/ST_Y로 좌표 추출, dedup 대표만)을
-- category_min 기준으로 재사용한다(제5장 제4조 기존 구조 우선) — service_category_id
-- (노출중분류, 관리자가 수동 배정, 대부분 null)가 아니라 category_min(표준중분류,
-- 수집 파이프라인이 항상 채움) 기준이라 별도 함수가 필요하다.
create or replace function public.get_open_spaces_by_category_min(p_category_min text)
returns table(id uuid, name text, address text, lng double precision, lat double precision)
language sql
stable
as $function$
  select s.id, coalesce(s.standard_name, s.name) as name, s.address,
    st_x(s.location::geometry) as lng, st_y(s.location::geometry) as lat
  from public.open_spaces s
  where s.category_min = p_category_min
    and (s.group_id is null or s.is_dedup_representative = true)
  order by s.id
$function$;

grant execute on function public.get_open_spaces_by_category_min(text) to service_role;
