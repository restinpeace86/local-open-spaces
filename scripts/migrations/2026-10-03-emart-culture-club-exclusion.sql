-- [이마트 컬처클럽 수동 노출 제외](2026-10-03 사용자 지시): "화면에 노출 배제할꺼
-- 수동으로 체크할수 있어? 다른건 키즈꺼만 가져왔는데 Club Original은.. 섞여있어서
-- 어른께 더 많은편이야" — Club Originals(카테고리 코드 101)는 다른 4개 카테고리와
-- 달리 키즈 전용이 아니라 성인 강좌가 섞여있어, 관리자가 리뷰하면서 수동으로
-- 노출 제외를 체크할 수 있어야 한다.
alter table public.emart_culture_club_classes
  add column if not exists is_excluded boolean not null default false;

comment on column public.emart_culture_club_classes.is_excluded is
  '관리자가 수동으로 노출 제외 처리했는지 여부(예: Club Originals 카테고리에 섞인
   성인 전용 강좌). 목록/상세 배치가 재실행돼도 이 값은 덮어쓰지 않는다(upsert가
   이 컬럼을 건드리지 않음).';
