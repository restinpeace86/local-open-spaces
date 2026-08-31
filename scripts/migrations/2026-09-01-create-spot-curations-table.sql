-- [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
-- 섹션 2: 관리자 전용 "스팟 큐레이션" 테이블. open_spaces(공공데이터 기본 뼈대)와 1:1로
-- 연결되어, 관리자가 수동으로 보강한 "풍성한" 상세 정보(대표 이미지, 구조화된 영업시간,
-- 메뉴)와 노출 제어(is_active)를 담당한다.
--
-- curated_items(범용 제휴 상품, booking_url 외부 링크가 핵심)와는 목적이 다르다 — 이
-- 테이블은 특정 open_spaces 행 하나를 "더 풍성하게 보여주기 위한" 부가 정보 저장소라
-- spot_id로 1:1 연결한다(제5장 제4조 기존 구조 우선의 취지는 "동일 목적 중복 방지"이지
-- "다른 목적을 억지로 통합"이 아니라고 판단 — curated_items/deals를 분리했던 것과 동일한
-- 근거).
--
-- 영업시간은 원문(operating_hours_raw)과 구조화 결과(open_time/close_time/break_start/
-- break_end/last_order)를 함께 저장한다 — 스마트 파서가 못 뽑아낸 항목이 있어도 원문은
-- 그대로 보존해 관리자가 나중에 수동으로 보정할 수 있게 한다(Null-safe 원본 보존 원칙,
-- 기존 raw_ingest_data 설계와 동일한 철학).
--
-- menu_items는 [{ name, price }] 형태의 JSONB 배열로 저장한다(메뉴 항목 수가 가변적이라
-- 별도 테이블로 정규화하기보다 이 MVP 단계에서는 JSONB로 충분하다고 판단).
--
-- 보안: curated_items/deals와 동일하게 RLS를 켜고 정책을 하나도 추가하지 않는다 —
-- service_role(createAdminClient())만 접근 가능. 공개 조회(DetailModal View Fallback)와
-- 어드민 조회/등록/수정 모두 서버 API 라우트를 통해서만 이뤄진다.
create table if not exists public.spot_curations (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null unique references public.open_spaces(id) on delete cascade,
  is_active boolean not null default true,
  image_url text,
  operating_hours_raw text,
  open_time text,
  close_time text,
  break_start text,
  break_end text,
  last_order text,
  menu_items jsonb not null default '[]'::jsonb,
  curation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_spot_curations_spot_id on public.spot_curations (spot_id);
create index if not exists idx_spot_curations_is_active on public.spot_curations (is_active);

alter table public.spot_curations enable row level security;
-- 의도적으로 아무 정책도 추가하지 않는다 — curated_items/deals와 동일 패턴.
