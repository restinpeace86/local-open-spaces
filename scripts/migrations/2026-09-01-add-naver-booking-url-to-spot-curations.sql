-- [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화(2026-09-01)
-- 섹션 1 "예약 및 링크 폴백 체인" 3순위: 공공예약/원본 링크(info_url)도 없지만 관리자가
-- 실제 네이버 예약이 연동된 민간 스팟임을 확인한 경우, 그 네이버 예약 링크로 안내한다.
-- open_spaces(공공데이터 원본)가 아니라 spot_curations(관리자 보강 정보)에 추가한다 —
-- 공공 API가 절대 제공하지 않는, 관리자가 수동으로 확인해 등록하는 값이기 때문이다.
alter table public.spot_curations add column if not exists naver_booking_url text;
