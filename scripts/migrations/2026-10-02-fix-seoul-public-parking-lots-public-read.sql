-- [공영주차장 아코디언 — 공개 조회 안 됨 버그 수정](2026-10-02 사용자 실측 리포트):
-- "인사동 엔틱&아트페어 아직 안보이는데? 새로고침했는데? 그 주변 키즈친화식당만
-- 보이고..." — 실제로는 반경 500m 내 주차장 2곳이 DB에 있었는데도(서비스롤 키로
-- 직접 조회해 확인) 앱 화면에서는 안 보였다.
--
-- 원인: seoul_public_parking_lots 생성 시(2026-10-02-nearby-parking-and-
-- restaurant-amenities.sql) homeplus_lecture_list(관리자 전용 내부 데이터) RLS
-- 패턴을 그대로 복사해 service_role 전용 정책만 두었다. 하지만 이 테이블은
-- 관리자 전용이 아니라 상세 모달에서 anon 사용자가 직접(get_nearby_parking_lots
-- RPC 경유로) 읽어야 하는 공개 데이터다. 실측 확인: anon 키로 RPC를 직접 호출하면
-- 에러 없이 조용히 빈 배열이 반환됨(RLS가 행을 전부 필터링 — 권한 에러가 아니라
-- "보이는 행이 0개"로 처리되어 디버깅이 어려웠다).
--
-- open_spaces/events는 애초에 RLS 자체가 없는 구조(pg_policies 조회로 확인, 이
-- 두 테이블엔 정책이 하나도 없음)지만, 이 테이블은 이미 RLS를 켜둔 채로
-- "쓰기는 service_role만, 읽기는 전체 공개"가 더 안전한 설계라 RLS를 끄는
-- 대신 읽기 전용 공개 정책을 추가한다.
create policy "seoul_public_parking_lots_public_read" on public.seoul_public_parking_lots
  for select
  to anon, authenticated
  using (true);
