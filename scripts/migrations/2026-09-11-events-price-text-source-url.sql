-- [가격 정보 파싱 고도화](2026-09-11 사용자 지시, implementation/todo.md 개선사항7-1):
-- "이벤트 원천 데이터의 텍스트(Description) 설명에서 가격 정보를 우선적으로 파싱...
-- 가격에 대하여 15000원 이런식으로 되어있을 수 있고 성인 15000원 어린이 10000원
-- 이런식으로 되어있을 수도 있음.. DB에 데이터는 유연하게 적재할 수 있도록".
--
-- 구조화된 가격 컬럼(정가/할인가 등) 대신 자유 텍스트 하나로 둔다 — 요구사항 원문이
-- 명시적으로 "유연한 적재"를 요구했고, 실측 조사 결과 소스마다 가격 표기 형식이
-- 완전히 달라(단일 금액/복수 대상 요금/할인 조건 병기 등) 구조화하면 오히려 정보
-- 손실이 생긴다.
alter table public.events
  add column if not exists price_text text;

comment on column public.events.price_text is
  '가격 정보(자유 텍스트, 예: "15,000원", "성인 15,000원 어린이 10,000원"). 원본 API의
   가격 필드를 그대로 쓰거나(USE_FEE/PARTCPT_EXPN_INFO), 설명 텍스트에서 라벨+금액
   패턴을 파싱한 값. 확인 불가하면 NULL(추측 금지). todo.md 개선사항7-1.';

-- [소스 원문 URL] "원천 URL(source_url)이 존재하는 경우" 요구사항 — 가격 크롤링의
-- 대상 URL이자, 그 자체로도 유저/관리자가 원본 상세 페이지로 이동할 수 있는 유용한
-- 링크다. seoul_public_reservation은 이미 reservation_url이 사실상 동일한 값이라
-- (SVCURL) 중복 저장하지 않는다(어댑터 주석 참고).
alter table public.events
  add column if not exists source_url text;

comment on column public.events.source_url is
  '이벤트 원천 상세 페이지/공식 홈페이지 URL(소스별 실제 필드명이 제각각이라 정규화해
   저장 — ORG_LINK/HMPG_ADDR/HMPG_URL/homepage 등). todo.md 개선사항7-1.';
