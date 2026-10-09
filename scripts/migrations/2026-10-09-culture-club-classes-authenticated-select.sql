-- [찜 버튼 눌러도 반응 없음 — RLS가 조회 자체를 막고 있었음](2026-10-09
-- 사용자 지적: "찜눌렀는데 반응이없는거같아.. 색깔 칠이 안되는데 ? 눌러도 ?")
--
-- [실측으로 확인한 원인] culture_club_classes는 RLS가 켜져 있고
-- (2026-10-06-culture-club-classes-unified.sql) 정책이 단 하나,
-- service_role 전용("culture_club_classes_service_role_all")뿐이다.
-- src/lib/community/bookmarks.ts의 addBookmark/removeBookmark는 브라우저의
-- createClient()(= authenticated 롤)로 culture_club_classes를 먼저 조회해
-- source_class_id → surrogate id를 알아내는데(resolveCultureClubClassId),
-- authenticated 롤에 SELECT 권한이 전혀 없어 이 조회가 매번 0건으로
-- 막히고 .single()이 에러를 던진다. bookmark-button.tsx의 catch가 이
-- 에러(BookmarkCapExceededError가 아닌 일반 에러)를 조용히 삼키게 되어
-- 있어(제5장 제11조 — 서비스 중단 금지 취지) 찜 토글 state가 절대 안
-- 바뀌고, 사용자 입장에서는 "눌러도 색이 안 칠해지는" 것처럼 보였다.
--
-- [고치는 범위] 이 데이터는 이미 /api/culture-club/search가 공개로
-- 노출하는 동일한 데이터라 민감하지 않다 — 로그인 사용자(authenticated)
-- 에게 읽기(SELECT)만 열어준다. 쓰기(INSERT/UPDATE/DELETE)는 여전히
-- service_role 전용(기존 수집 배치 전용 경로)만 가능하게 그대로 둔다.
create policy "culture_club_classes_authenticated_select" on public.culture_club_classes
  for select
  to authenticated
  using (true);
