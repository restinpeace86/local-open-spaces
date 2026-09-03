-- [챗봇 개선](2026-09-04 사용자 지시) 3: "위치 시군구 목록에서 선택 시 목록조회 실패 —
-- 타임아웃으로. 전국 시군구라 그런 것 같은데 도→시→구 순서로 불러오는 건 어떨까?" 실측
-- 확인한 진짜 원인: get_sigungu_options()가 open_spaces(140,248건)+events(22,615건)를
-- 매번 통째로 Seq Scan한 뒤 162,863행을 외부 병합 정렬(디스크 스필, 8.4MB)해 368개
-- distinct sigungu_name을 뽑았다 — EXPLAIN ANALYZE 실측 17.68초, PostgREST 8초
-- statement_timeout을 2배 넘겨 사실상 항상 실패했다. sigungu_name 단독 인덱스를
-- 추가해봤지만(이 마이그레이션에서 나중에 제거) 플래너가 여전히 Seq Scan을 선택했다 —
-- 거의 모든 행(140,248/142,111)이 sigungu_name IS NOT NULL이라 인덱스로 걸러도
-- 대부분의 힙을 어차피 다시 읽어야 해서 이득이 없었다.
--
-- 근본 원인은 "매 요청마다 16만 행을 다시 집계한다"는 것 자체다 — 시/군/구 목록은
-- 한국 행정구역 특성상 사실상 거의 바뀌지 않는 참조 데이터라, 요청마다 재계산할
-- 필요가 없다. materialized view로 한 번만 계산해 캐싱하고, RPC는 그 캐시를 읽기만
-- 하게 바꾼다(함수 시그니처는 그대로라 프런트엔드 코드 변경 없음). 실측 검증:
-- 17.68초 → 4.7ms(약 3,700배 개선).
--
-- (참고) "도→시→구 단계별 로딩" UI 자체는 이번엔 적용하지 않았다 — sigungu_name이
-- DB에 "경기도 성남시"처럼 하나의 합쳐진 문자열로만 저장돼 있어(별도 시/도 컬럼 없음)
-- 단계별 로딩을 만들려면 프런트엔드에서 이미 하고 있는 것처럼(location-onboarding-
-- modal.tsx groupedSigunguOptions) 첫 단어로 그룹핑하는 정도가 최선이고, 진짜 병목은
-- "전체를 한 번에 느리게 가져오는 것"이었지 "한 번에 다 보여주는 UI" 자체가 아니었다.
-- 이 캐시로 조회 자체가 4.7ms까지 빨라진 이상 단계별 네트워크 왕복을 추가로 만드는
-- 것은 오히려 불필요한 복잡도라고 판단했다(제5장 제4조 기존 구조 우선 — 이미 있는
-- 시/도 그룹핑 UI를 그대로 활용).
create materialized view if not exists public.sigungu_options_cache as
select distinct on (combined.sigungu_name)
  combined.sigungu_name,
  st_x(combined.location) as lng,
  st_y(combined.location) as lat
from (
  select sigungu_name, location from public.open_spaces where sigungu_name is not null
  union all
  select sigungu_name, location from public.events where sigungu_name is not null
) as combined
order by combined.sigungu_name;

-- REFRESH MATERIALIZED VIEW CONCURRENTLY에 필요(락 없이 갱신하려면 고유 인덱스 필수).
create unique index if not exists idx_sigungu_options_cache_name on public.sigungu_options_cache (sigungu_name);

create or replace function public.get_sigungu_options()
returns table(sigungu_name text, lng double precision, lat double precision) as $$
  select sigungu_name, lng, lat from public.sigungu_options_cache order by sigungu_name;
$$ language sql stable;

-- 이 참조 데이터는 새 지역이 처음 수집되거나 sigungu_name 정규화가 바뀔 때만 달라진다
-- (거의 없음) — 실시간 최신성이 필요 없으므로, scripts/ingest/run-daily.mjs의 마지막
-- 후처리 단계(REFRESH_SIGUNGU_OPTIONS_CACHE)에서 매일 배치 끝에 한 번씩 갱신한다.
create or replace function public.refresh_sigungu_options_cache()
returns void as $$
begin
  refresh materialized view concurrently public.sigungu_options_cache;
end;
$$ language plpgsql;
