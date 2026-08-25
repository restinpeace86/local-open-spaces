-- [긴급 아키텍처 개편] RAW 레이어(원천 JSONB 적재) 신설.
-- 목적: 현재 각 어댑터가 fetch() → transform()에서 유효성 검증에 실패한 행을 즉시 드롭하는
-- 단일 파이프라인 방식은 (1) 원본 API 응답이 유실되어 재가공이 불가능하고, (2) 파서 로직을
-- 고칠 때마다 원본 API를 다시 호출해야 하는 문제가 있다. 이 테이블은 원본 응답을 어떠한
-- 필터링/가공 없이 100% 그대로 보존해 위 문제를 해결한다.
create table if not exists public.raw_ingest_data (
  source varchar(100) not null,
  source_id varchar(200) not null,
  fetched_at timestamptz not null default now(),
  raw_payload jsonb not null,
  primary key (source, source_id)
);

create index if not exists idx_raw_ingest_data_source on public.raw_ingest_data (source);
create index if not exists idx_raw_ingest_data_fetched_at on public.raw_ingest_data (fetched_at);

comment on table public.raw_ingest_data is
  '수집 어댑터가 원본 API 응답을 무오염 보존하는 RAW 레이어. (source, source_id) 복합키로 ON CONFLICT DO UPDATE 적재되며, 서비스 표준 테이블(events/open_spaces) 매핑과 분리된 별도 단계다.';
