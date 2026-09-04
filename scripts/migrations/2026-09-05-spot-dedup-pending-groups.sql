-- [중복 스팟 검수 — 진행 상태 임시 저장](2026-09-05 사용자 지시): "geohash 정렬로 그룹핑된
-- 것에 대하여 현재 나오는 것들.. 따로 저장해주는 테이블 신규 생성하던가 아니면 해당 묶인것
-- 기준으로 하여 상태 변경중이라던가 status 구분자로 진행중해놓던가... 임시테이블로써..."
--
-- 문제: 지금까지는 geohash 스캔으로 찾은 "중복 의심 그룹"이 전부 브라우저 세션 메모리
-- (candidates 클라이언트 상태)에만 있었다 — 관리자가 그룹을 열어 검수를 시작했다가 탭을
-- 닫거나 새로고침하면 그 진행 상황이 전부 사라지고, 다음에 다시 처음부터 스캔해야 했다.
-- 또한 "이건 중복이 아니다"라고 판단해 넘긴 그룹도 기록이 남지 않아 다음 스캔에서 똑같이
-- 다시 나타나 반복 검토하게 됐다.
--
-- 해결: 그룹이 "검수 시작"(진행중, in_progress) 또는 "중복 아님으로 확인"(무시, ignored)
-- 상태로 바뀌는 시점에만 이 임시 테이블에 적재한다 — 모든 스캔 결과를 다 저장하지 않고
-- 관리자가 실제로 손댄 그룹만 남긴다(불필요한 데이터 증식 방지). 최종적으로 그룹을
-- "저장 및 일괄 적용"하면(POST /api/admin/spot-dedup/apply) 그 그룹의 진짜 결과가
-- open_spaces/spot_dedup_groups(영구 이력 테이블)에 반영됨과 동시에 이 임시 테이블에서는
-- 해당 행이 삭제된다 — 사용자 지시 그대로 "수정 다하고 등록하면 임시테이블에서 진짜
-- 테이블로 옮겨가고 임시테이블에서는 삭제".
--
-- group_key는 그룹 구성원 id를 정렬해 이어붙인 결정적 문자열(src/lib/admin/spot-dedup-
-- pending-key.ts 참고) — DedupGroup.groupKey(유니온파인드 루트 id, 스캔마다 달라질 수 있음)를
-- 그대로 쓰면 재조회 때마다 값이 바뀌어 같은 그룹을 다시 찾을 수 없다. member_spot_ids로
-- 정렬해 만든 이 키는 같은 구성원 집합이면 스캔 순서와 무관하게 항상 동일하다.
create table if not exists public.spot_dedup_pending_groups (
  id uuid primary key default gen_random_uuid(),
  group_key text not null unique,
  member_spot_ids uuid[] not null,
  -- in_progress: 검수를 시작해 모달을 열어둔 상태. ignored: 검토 결과 중복이 아니라고
  -- 판단해 다음 스캔부터 다시 보이지 않도록 명시적으로 넘긴 상태.
  status text not null default 'in_progress' check (status in ('in_progress', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.spot_dedup_pending_groups is
  '중복 스팟 검수 도구의 진행 중/무시 상태 임시 저장 — 확정되면(apply) 삭제됨(2026-09-05)';

create index if not exists idx_spot_dedup_pending_groups_status
  on public.spot_dedup_pending_groups (status);
