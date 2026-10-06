-- [이마트 찜한 강좌 상태 감시](2026-10-06 todo.md 개선사항 1): "찜했을경우 5분마다
-- 찜한 이벤트에 대하여서도 ... 이마트 한정" — 롯데마트 status-watch(5분 주기,
-- 찜한 강좌만 재조회)와 동일한 메커니즘을 이마트에도 만든다.
--
-- 메인 배치(emart-culture-club.mjs)는 접수대기/접수중/정원마감 3개 버킷만
-- 수집한다(접수마감은 사용자 지시로 애초에 제외 — "데이터가 너무 많다").
-- status-watch가 찜한 class_id를 이 3개 버킷에 대해 다시 조회했을 때 전부
-- 빠지면, 그 강좌는 (메인 배치가 애초에 추적하지 않는) 네 번째 상태인
-- '접수마감'으로 넘어갔다고 봐도 추측이 아니다 — 메인 배치가 다루는 버킷이
-- 정확히 이 3개뿐이라고 구조적으로 보장되기 때문(제3장 제5조 추측 금지와
-- 충돌하지 않음 — 롯데마트의 '접수불가'와 달리 여기선 정확한 상태를 특정할
-- 수 있다).
alter table public.emart_culture_club_classes
  drop constraint emart_culture_club_classes_filter_status_check;

alter table public.emart_culture_club_classes
  add constraint emart_culture_club_classes_filter_status_check
  check (filter_status in ('접수대기', '접수중', '정원마감', '접수마감'));
