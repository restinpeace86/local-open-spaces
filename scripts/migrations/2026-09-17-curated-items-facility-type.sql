-- [실내/야외 분류 LLM 파이프라인](2026-09-17 사용자 지시): "공공데이터 및 외부
-- 제휴 API에서 수집된 아이와 함께 가기 좋은 나들이/체험 상품 데이터를 분석하여
-- 환경 속성을 자동으로 분류" — 제휴 상품 등록 폼에도 이 분류 결과를 저장할
-- 컬럼이 필요하다. events.facility_type과 달리 curated_items는 신규 테이블이라
-- NOT NULL 기본값 없이 nullable로 둔다(모든 제휴 상품이 실내/야외 판단이
-- 필요한 건 아님 — 예: coupang 카테고리 커머스 상품).
alter table public.curated_items
  add column if not exists facility_type text;
