-- [관리자화면 재차 지연 진단](2026-09-12 사용자 지시): "나드리픽 관리자화면 느려졌어..
-- VACUUM을 하던 원인 확인하고 조치해줘 배큠해야하는지 인덱싱이 문제인지".
--
-- 실측 결과: open_spaces/events/raw_ingest_data 3개 테이블 모두 dead tuple 1~2%로
-- 건강했고(2026-09-05/06 조치한 autovacuum_scale_factor=0.05가 계속 잘 작동 중,
-- VACUUM 문제 아님) get_events_filter_options() RPC만 8초 statement_timeout에
-- 걸려 실패하고 있었다. EXPLAIN (analyze, buffers)로 확인한 원인: 이 함수가
-- source/event_type/raw_data->>'MINCLASSNM'/raw_data->>'SVCSTATNM' 4개 값을 하나의
-- SELECT로 한 번에 집계하는데, raw_data가 JSONB(seoul_public_reservation 소스는
-- 평균 3.9KB, 최대 80KB)라 매 행 TOAST 압축 해제가 필요해 인덱스 스캔을 쓰더라도
-- 결국 전체 힙을 다시 읽어야 했다(buffers hit=94306, table은 79MB=~10,122
-- 페이지뿐인데 이보다 훨씬 많은 버퍼 접근 — TOAST 청크를 행마다 반복 조회한 결과).
--
-- 조치: (1) raw_data->>'MINCLASSNM'/'SVCSTATNM' 표현식 인덱스를 추가해 이 두
-- 값만 필요한 조회는 raw_data 본문을 전혀 건드리지 않고 인덱스만으로 끝낼 수
-- 있게 하고, (2) 함수를 4개의 독립된 스칼라 서브쿼리로 재작성해 옵티마이저가
-- 각 값을 별도로(그리고 가능하면 Index Only Scan으로) 계산하게 한다 — 기존처럼
-- 하나의 스캔에서 4개 값을 한꺼번에 뽑으면 옵티마이저가 어차피 raw_data가 필요한
-- 스캔 하나로 묶어버려 인덱스 이점이 사라진다.

create index if not exists idx_events_raw_data_minclassnm
  on public.events ((raw_data->>'MINCLASSNM'));

create index if not exists idx_events_raw_data_svcstatnm
  on public.events ((raw_data->>'SVCSTATNM'));

create or replace function public.get_events_filter_options()
returns table(sources text[], event_types text[], min_class_names text[], svc_stat_nms text[])
language sql
stable
as $$
  select
    (select array_agg(distinct source order by source) from public.events where source is not null),
    (select array_agg(distinct event_type order by event_type) from public.events where event_type is not null),
    (select array_agg(distinct raw_data->>'MINCLASSNM' order by raw_data->>'MINCLASSNM')
       from public.events where raw_data->>'MINCLASSNM' is not null),
    (select array_agg(distinct raw_data->>'SVCSTATNM' order by raw_data->>'SVCSTATNM')
       from public.events where raw_data->>'SVCSTATNM' is not null);
$$;
