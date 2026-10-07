-- [롯데마트 상세 썸네일 이미지](2026-10-07 사용자 지적): "이거 관련해서 왜
-- 이미지가 없지? 접수페이지로 가기 해서 ... 여기 가니깐 이미지 있는데?" —
-- 목록 API(searchList.do)엔 썸네일이 없지만(실측 확인, 2026-10-04) 상세
-- 페이지(courseview.do)의 `.lct-visual img`에는 있다. 이마트의 main_image_*
-- 컬럼과 달리 롯데마트는 bucket/region/key 분리가 없고 이미 완전한 절대
-- URL이라 컬럼 하나면 충분하다.
alter table public.lottemart_culture_club_classes
  add column if not exists main_image_url text;
