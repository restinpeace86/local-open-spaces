-- [events.updated_at 컬럼 + 자동 갱신 트리거](2026-09-12 사용자 지시): "updated_at 어 이거
-- 추가해.. 자동 갱신 트리거도 하고" — 직전 대화에서 "오늘 등록건"(created_at 기준) 필터로는
-- 이미 존재하던 이벤트(예: 서울형 키즈카페처럼 external_id가 안정적인 소스)가 오늘 실제로
-- UPDATE(예약 회차 갱신)됐어도 절대 잡히지 않는다는 한계를 확인했다 — created_at은 최초
-- 생성 시각이라 UPDATE로는 바뀌지 않기 때문. open_spaces에는 이미 updated_at 컬럼이
-- 있지만(관리자가 노출 중분류/카테고리를 수동으로 고칠 때만 JS에서 명시적으로 채워주는
-- 방식 — DB 트리거 아님), events에는 컬럼 자체가 없었다.
--
-- 이번엔 "자동 갱신 트리거"를 명시적으로 요청받았으므로, 매번 API 라우트가 갱신을
-- 잊지 않도록 매번 값을 채워주는 JS 관례 대신 DB 트리거로 만든다 — 정기 배치의
-- upsert(대량 UPDATE)를 포함해 이 테이블에 대한 모든 UPDATE 경로(관리자 API, 배치
-- upsert 등 앞으로 추가될 경로까지)가 예외 없이 자동으로 최신 시각을 반영한다.
--
-- 재사용 가능한 범용 트리거 함수로 만든다(제5장 제4조/제6조) — 이 DB에 아직 이런 범용
-- "updated_at 자동 갱신" 함수가 없어(실측 확인: information_schema.routines에 없음)
-- events 전용으로 좁게 짓지 않고 이름을 general하게 둬, 다른 테이블(예: open_spaces를
-- 나중에 트리거 기반으로 전환)에도 그대로 재사용할 수 있게 한다.
--
-- [실제로 값이 바뀔 때만 갱신] 매일 배치의 upsert(ON CONFLICT DO UPDATE)는 내용이
-- 하나도 안 바뀐 행도 매번 "UPDATE 문"을 실행한다 — 단순히 "UPDATE가 실행됐는지"만
-- 보면 매일 재수집되는 거의 모든 행이 영원히 "오늘 갱신됨"으로 보여 필터가 무의미해진다
-- (애초에 이 컬럼을 만드는 이유가 "실제로 내용이 바뀐 것"을 찾기 위함이었음). 그래서
-- 행 전체를 비교하되, updated_at(자기 자신, 비교해도 무의미) + raw_data(원본 API가
-- 내용은 그대로인데 부가 메타데이터만 매번 살짝 다르게 내려줄 수 있어 잡음이 될
-- 위험이 큼 — 실제 노출되는 컬럼(start_date 등)이 바뀌면 어차피 함께 잡힌다)는
-- 비교에서 제외한다. 컬럼이 늘어나도(스키마 진화) 하드코딩된 목록을 매번 고칠
-- 필요 없이 자동으로 반영되도록 jsonb 차집합으로 비교한다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'raw_data') is distinct from (to_jsonb(old) - 'updated_at' - 'raw_data') then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

alter table public.events add column if not exists updated_at timestamptz not null default now();

-- 기존 행은 컬럼 추가 시점의 기본값(now())으로 일괄 채워지므로, 실제 마지막 수정
-- 시각을 알 수 없는 과거 데이터에 "방금 갱신됨"이라는 오해를 주지 않도록 created_at으로
-- 되돌린다(이 컬럼이 없던 동안의 실제 수정 이력은 알 방법이 없어 최선의 근사치).
update public.events set updated_at = created_at;

drop trigger if exists trg_events_set_updated_at on public.events;
create trigger trg_events_set_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();
