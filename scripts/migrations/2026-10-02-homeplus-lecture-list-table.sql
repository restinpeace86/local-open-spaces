-- [홈플러스 문화센터 강좌 리스트 수집 — 관리자 화면 노출용 테이블](2026-10-02
-- 사용자 지시): "LectureMasterID 가져오기 전단계로 이 리스트 관련 우리쪽
-- 관리자 화면에서 볼수 있게해줘" — pipeline_logs와 동일한 패턴(서비스롤
-- 전용 RLS)의 단순 읽기 전용 테이블. 파이썬 스크립트(scripts/python/
-- homeplus-collect-lecture-list.py)가 Supabase REST API로 직접 insert한다
-- (이 프로젝트 최초의 Python→Supabase 직접 연동, 기존 Node 수집기와는
-- 완전히 별도 — 제5장 제4조와 무관하게 새 경로).
--
-- LectureMasterID는 이번 지시 범위가 아니라 컬럼에 포함하지 않는다(제5장
-- 제7조 — 당장 쓰지 않을 확장 컬럼을 미리 만들지 않음). raw_text를 항상
-- 같이 저장해 구조화 추출(store_name/date_range_text)이 틀리거나 부족해도
-- 원본 텍스트로 확인할 수 있게 한다.
create table if not exists public.homeplus_lecture_list (
  id bigint generated always as identity primary key,
  -- 1차: Kids/Baby 전체 + 서울/인천·부천/수원·화성/경기/대전·세종/충청/광주·전라/강원 전체(8개 지역)
  -- 2차: Kids/Baby 전체 + 대구/울산/경북/경남/부산 전체(5개 지역)
  -- (한 번에 선택 가능한 검색조건이 최대 10개라 지역을 2그룹으로 나눠 검색)
  search_batch smallint not null check (search_batch in (1, 2)),
  store_name text,
  date_range_text text,
  is_closed boolean not null,
  raw_text text not null,
  collected_at timestamptz not null default now()
);

comment on table public.homeplus_lecture_list is '홈플러스 문화센터(mschool.homeplus.co.kr) 강좌 검색 결과 수집본 — Kids/Baby 전체 지역 검색, 관리자 검토용';
comment on column public.homeplus_lecture_list.search_batch is '1=서울/인천·부천/수원·화성/경기/대전·세종/충청/광주·전라/강원, 2=대구/울산/경북/경남/부산';
comment on column public.homeplus_lecture_list.is_closed is '검색 결과 카드의 장바구니 버튼이 disabled + "마감" 표시였는지 여부';
comment on column public.homeplus_lecture_list.raw_text is '카드 전체 텍스트 원본(구조화 추출이 틀리거나 부족할 때 대조용)';

create index if not exists idx_homeplus_lecture_list_collected_at
  on public.homeplus_lecture_list (collected_at desc);

alter table public.homeplus_lecture_list enable row level security;

create policy "homeplus_lecture_list_service_role_all" on public.homeplus_lecture_list
  for all
  to service_role
  using (true)
  with check (true);
