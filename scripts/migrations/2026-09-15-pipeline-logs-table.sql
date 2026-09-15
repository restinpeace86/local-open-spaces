-- [파이프라인 로그 DB화](2026-09-15 사용자 지시, implementation/todo.md [개선사항 3]):
-- "기존에 마크다운 파일(pipeline-log.md)에 기록하던 파이프라인 실행 로그 방식을
-- 폐기하고, 파이프라인 실행 결과를 데이터베이스에 구조화된 데이터로 직접 적재".
--
-- 컬럼 구성은 요청 원문이 제시한 예시를 그대로 따른다. status는 기존 코드베이스가
-- 이미 쓰고 있는 'OK'/'FAILED' 두 값을 그대로 쓴다(제5장 제4조 기존 구조 우선 —
-- 요청 예시의 'SUCCESS'로 임의 변경하지 않음, 구현 기록에 명시).
create table if not exists public.pipeline_logs (
  id bigint generated always as identity primary key,
  agent_name text not null,
  status text not null check (status in ('OK', 'FAILED')),
  executed_at timestamptz not null default now(),
  error_message text,
  meta_data jsonb,
  description text,
  period text check (period in ('daily', 'monthly') or period is null),
  updated_at timestamptz not null default now()
);

comment on table public.pipeline_logs is
  '데이터 수집/후처리 파이프라인의 실행 결과 로그. docs/pipeline-log.md(마크다운 파일
   append) 방식을 대체한다. todo.md [개선사항 3].';
comment on column public.pipeline_logs.agent_name is
  '실행한 에이전트/소스 식별자 — scripts/ingest의 sourceKey/label과 100% 동일한 값을
   쓴다(scripts/ingest/lib/pipeline-agent-registry.mjs가 단일 출처).';
comment on column public.pipeline_logs.meta_data is
  '수집/적재 건수, 테이블별 상세, 에러 원인별 건수 등 부가 정보(JSON, 스키마 없음 —
   에이전트마다 형태가 달라 유연하게 적재).';

-- 관리자 화면의 "현황판"은 에이전트별 최신 실행 1건만 보여준다 — 이 쿼리 패턴을
-- 서빙하는 인덱스.
create index if not exists idx_pipeline_logs_agent_executed
  on public.pipeline_logs (agent_name, executed_at desc);

alter table public.pipeline_logs enable row level security;

-- 서버(서비스 롤) 전용 쓰기/읽기 — 이 로그는 관리자 API 라우트(서비스 롤 클라이언트)를
-- 통해서만 조회하며, 일반 사용자/anon에게는 노출할 이유가 없는 내부 운영 데이터다.
create policy "pipeline_logs_service_role_all" on public.pipeline_logs
  for all
  to service_role
  using (true)
  with check (true);
