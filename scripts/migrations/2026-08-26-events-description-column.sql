-- [수집기 본문(Contents) 필드 적재 보강](2026-08-26)
--
-- 실측 확인(읽기 전용 조사): seoul_public_culture(18,951건)/gg_public(2,955건)/tourapi_4.0
-- (240건) 세 소스 — 전체 events의 83.9% — 는 events.raw_data가 완전히 빈 값(null)이었다.
-- 원인은 각 어댑터의 events 행 빌더가 원본 item을 raw_data로 전달하지 않았기 때문(코드
-- 버그, 이번 작업에서 함께 수정). 다만 raw_ingest_data(RAW 레이어) 테이블에는 이미 원본이
-- 대부분 보존돼 있어(seoul_public_culture 19,479건/gg_public 3,428건/tourapi_4.0 240건),
-- 재수집(외부 API 재호출) 없이 DB 안에서 백필이 가능함을 확인했다.
--
-- events.raw_data(JSONB, 원본 그대로 무손실 보존)와 별도로, target_audience 등 텍스트 스캔
-- 로직이 소스마다 다른 JSONB 키(PROGRAM/ETC_DESC/DTCONT/overview)를 매번 찾아 헤매지 않도록
-- "정제된 단일 설명 텍스트" 전용 컬럼을 신설한다(사용자 지시 "전용 설명 컬럼" 요구사항).
alter table public.events
  add column if not exists description text;
