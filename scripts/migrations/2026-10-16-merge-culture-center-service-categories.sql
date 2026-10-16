-- [노출중분류 통합](todo.md 개선사항1, 2026-10-16 사용자 지시): "노출중분류 :
-- '문화시설 > 백화점문화센터' / '문화시설 > 대형마트문화센터' / '문화시설 > 쇼핑몰문화센터' /
-- '문화시설 > 아울렛문화센터' 이렇게 4개에 대하여 '문화시설 > 백화점·마트 문센' 하나로
-- 병합할 것. 기존 상기 4개의 노출중분류 매핑되었던 스팟들에 대하여 통합된
-- '문화시설 > 백화점·마트 문센'로 재매핑할 것." 실측 확인: 4개 노출중분류에 매핑된
-- open_spaces 201건(대형마트 137 + 백화점 56 + 아울렛 5 + 쇼핑몰 3). spot_dedup_groups는
-- 이 4개 id를 참조하는 행이 0건(실측 확인) — open_spaces만 재매핑하면 된다.

do $$
declare
  v_new_id uuid;
  v_old_ids uuid[] := array[
    'ad36cf12-821e-4cca-929d-c7e6242a8a4f', -- 대형마트문화센터
    'a013c3f9-4c71-4a23-8441-d202533e5319', -- 백화점문화센터
    '4e412074-868b-41de-acd8-6b7b965d15e4', -- 쇼핑몰문화센터
    'aede4ded-c5a7-46d7-ab9b-c078ed8c20a6'  -- 아울렛문화센터
  ];
begin
  insert into service_categories (parent_category, category_name)
  values ('문화시설', '백화점·마트 문센')
  returning id into v_new_id;

  update open_spaces
  set service_category_id = v_new_id
  where service_category_id = any(v_old_ids);

  delete from service_categories where id = any(v_old_ids);

  raise notice '병합 완료: 신규 service_category_id = %', v_new_id;
end $$;

select id, parent_category, category_name,
  (select count(*) from open_spaces where service_category_id = service_categories.id) as mapped_count
from service_categories
where category_name = '백화점·마트 문센';
