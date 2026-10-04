-- [롯데마트 문화센터 강좌 리스트 수집](2026-10-04 사용자 지시): "롯데마트 문화센터
-- 확인좀 해줘" 이후 실측 확인한 구조를 바탕으로 이마트 컬처클럽
-- (emart_culture_club_classes, 2026-10-03)과 동일한 "관리자 검토용 독립 테이블"
-- 패턴을 따른다. 다만 사용자 확인(2026-10-04): "각각을 우리 표준이나 ... 억지로
-- 표준화시키는게 아니고 각각에 맞는 형태내에서 ... 이 데이터 자체의 저장 틀을
-- 같은 규격으로 할 필요없을거같아" — 컬럼 구성은 이마트와 억지로 맞추지 않고
-- 롯데마트 실제 응답 구조를 그대로 반영한다(공유는 화면/찜 메커니즘 레벨에서만).
--
-- [실측으로 확인한 이마트와의 구조적 차이]
-- - 리스트 응답(searchList.do)에 썸네일 이미지가 전혀 없다(여러 지점/대상 조합
--   실측 확인 — <img> 태그 0건). 이미지 CDN을 찾을 필요 자체가 없다.
-- - 등록상태를 나타내는 별도 필터 파라미터가 없다 — 행(row)마다 버튼
--   텍스트/onclick으로 상태를 직접 판별해야 한다(바로신청/대기자 신청/
--   접수마감/전화문의). "접수대기"(아직 안 열림) 개념 자체가 보이지 않았다
--   (이마트의 register_start_at류 타임스탬프/알람 대상 컬럼은 해당 없음).
-- - 콤마로 여러 값을 묻는 배치 조회가 안 된다(실측 확인 — 빈 응답) — 지점×대상×
--   학기를 하나씩 순회해야 해서 이마트보다 요청 수가 훨씬 더 많다.
create table if not exists public.lottemart_culture_club_classes (
  id bigint generated always as identity primary key,
  class_id text not null unique,
  class_title text not null,
  store_code text not null,
  store_name text not null,
  main_category_name text,
  sub_category_name text,
  age_range_text text,
  instructor_name text,
  class_day text[],
  start_time text,
  end_time text,
  class_start_date text,
  session_count integer,
  class_original_fee integer,
  class_fee integer,
  class_material_fee integer,
  discount_badge_text text,
  is_closing_soon boolean not null default false,
  is_new boolean not null default false,
  like_count integer,
  -- [상태 — 실측 확인] 별도 상태 필터가 없어, 행마다 버튼 텍스트/onclick으로
  -- 직접 판별해 저장한다. 이마트처럼 접수마감을 기본 제외하지 않는다(사용자의
  -- 명시적 지시가 없었던 항목 — 추측으로 데이터를 버리지 않는다, 제3장 제5조).
  registration_status text not null check (
    registration_status in ('바로신청', '대기자신청', '접수마감', '전화문의')
  ),
  semester_code text not null,
  -- [대상 — 사용자 지시로 성인(1) 제외] 어린이/청소년(2), 유아(3), 엄마와 함께(4)만
  -- 수집한다("성인 1은 확실히 안가져와도돼").
  target_code text not null check (target_code in ('2', '3', '4')),
  target_name text not null,
  -- [관리자 수동 노출 배제] 이마트 is_excluded와 동일한 용도.
  is_excluded boolean not null default false,
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.lottemart_culture_club_classes is
  '롯데마트 문화센터 강좌 리스트(searchList.do HTML 파싱, 로그인 불필요). 관리자
   검토용 — emart_culture_club_classes와 동일하게 아직 공개 기능으로 노출되지
   않는다. 저장 구조는 롯데마트 실측 응답을 그대로 반영하며 이마트 테이블과
   스키마를 맞추지 않는다(2026-10-04 사용자 확인).';

create index if not exists idx_lottemart_culture_club_classes_collected_at
  on public.lottemart_culture_club_classes (collected_at desc);

alter table public.lottemart_culture_club_classes enable row level security;

create policy "lottemart_culture_club_classes_service_role_all" on public.lottemart_culture_club_classes
  for all
  to service_role
  using (true)
  with check (true);
