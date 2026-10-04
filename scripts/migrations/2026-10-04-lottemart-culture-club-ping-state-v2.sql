-- [ping 비교 방식 재설계](2026-10-04 사용자 지시): "성인꺼는 데이터 가져온것에서
-- 빼고나서 우리꺼 기존에 적재된거랑 비교를 해야지 변화가 있는지를 알수 있어"
-- — 처음 설계(v1, 2026-10-04-lottemart-culture-club-ping-state.sql)는 지점별
-- pageInfo 버킷 3개(접수가능/온라인마감/접수마감) 합계를 저장해 비교했는데,
-- 이 합계가 target 필터 없이 받은 응답 그대로라 성인강좌 변동에도 오탐했다.
--
-- 재설계: ping이 받아온 행(row)들 중 성인강좌만 걸러내고, 남은 행을 매번
-- lottemart_culture_club_classes(이미 적재된 실제 데이터)와 직접 비교한다 —
-- 그래서 버킷 합계를 저장해 둘 필요가 없어졌다. 이 테이블은 "지점별로 마지막
-- 언제 확인했고 마지막으로 언제 변화가 있었는지"만 남기는 진단/관측용으로
-- 단순화한다(파워맘 정원제처럼 디버깅에 쓰는 관측값 — 접수대기 포착
-- 진단(registerWindowDiagnostic)과 같은 성격).
alter table public.lottemart_culture_club_store_ping_state
  drop column if exists accept_total_cnt,
  drop column if exists onln_close_total_cnt,
  drop column if exists accept_close_total_cnt;
