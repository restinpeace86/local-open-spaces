-- [롯데백화점 문화센터 7번째 브랜드 추가](2026-10-09 사용자 지시):
-- "이거 롯데마트꺼랑 다른거가?" → 조사 후 "상세꺼가 중요해.. 상세데이터도
-- 확인해보자" → 투자 결과 설명 후 구현 진행 — culture.lotteshopping.com은
-- culture.lottemart.com(이미 수집 중인 롯데마트)과 완전히 다른 시스템
-- (다른 도메인, 다른 회사 조직 — 백화점 vs 대형마트)이다. Decision 028은
-- 5개, 2026-10-09 AK플라자/스타필드로 6개까지 확장했었고 이번이 7번째다.
alter table public.culture_club_classes drop constraint culture_club_classes_brand_check;
alter table public.culture_club_classes add constraint culture_club_classes_brand_check
  check (brand in ('emart', 'lottemart', 'ak_plaza', 'shinsegae', 'hyundai', 'starfield', 'lotte_department'));

-- [카테고리 — 백화점문화센터 재사용](실측 확인) 롯데백화점은 현대백화점/
-- 신세계/AK플라자와 동일하게 진짜 "백화점"이라(스타필드처럼 쇼핑몰이
-- 아님) 기존 '백화점문화센터' category_min을 그대로 재사용한다 — 새
-- category/RPC 변경 불필요(이미 get_culture_club_store_coordinates()가
-- 포함하고 있음).
