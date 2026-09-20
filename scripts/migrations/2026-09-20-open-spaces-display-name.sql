-- [OPEN_SPACES 노출 이름 수동 수정](2026-09-20 사용자 지시, "장우랑 놀이방" 사례):
-- 경기도 놀이방식당(gg-kidscafe-adapter.mjs) 원본 데이터의 BIZPLC_NM(사업자등록
-- 상호명)이 "장우랑 & 양주회센터"처럼 한 사업장 주소에 등록된 여러 상호가 합쳐진
-- 값으로 들어오는 경우가 있어, 노출용 이름을 관리자가 별도로 덮어쓸 수 있어야 한다.
--
-- open_spaces는 재수집 시 events처럼 안전 병합(upsertRowsSafeMerge)을 쓰지 않고
-- 매번 통째로 upsert하므로(scripts/ingest/lib/supabase-admin.mjs upsertRows, 성능
-- 목적 — 기존 값을 보존하지 않음) events.title처럼 원본 컬럼을 직접 고치는 방식은
-- 다음 재수집에서 되돌아간다. 그래서 events와 달리 원본 name과 별개인 새 컬럼이
-- 필요하다 — 재수집 파이프라인은 이 컬럼을 전혀 건드리지 않으므로(어떤 어댑터도
-- display_name을 쓰지 않음) 한 번 설정하면 안전하게 유지된다.
alter table public.open_spaces
  add column if not exists display_name text;

comment on column public.open_spaces.display_name is
  '관리자가 수동으로 지정한 노출용 이름. 원본 상호명(name)이 잘못됐거나 여러 상호가 합쳐져 들어온 경우 덮어쓰기 용도. NULL이면 화면에서 name을 그대로 사용한다.';
