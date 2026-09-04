-- [개선사항9] 에어코리아 초미세먼지 '주간예보' 연동(2026-09-04 todo.md) — 신규 테이블 생성.
--
-- 실측 확인(공공데이터포털 실제 호출, PUBLIC_DATA_API_KEY로 직접 테스트): 이 API
-- (`/getMinuDustWeekFrcstDspth`)의 실제 응답 필드명은 지시서 원문(informData/
-- informCode/informOverall)과 다르다 — `InformCode=PM10`/`PM25`를 명시적으로 넘겨도
-- 응답이 완전히 동일해, 이 엔드포인트는 PM10/PM2.5를 구분하지 않고 "미세먼지" 통합
-- 주간 전망 1건만 발표한다(추측이 아니라 실제 호출로 확인). 실제 응답 구조:
--   presnatnDt   : 예보 발표일자 (YYYY-MM-DD)
--   gwthcnd      : 종합 안내문(총평 텍스트, 발표 1건당 하나 — 4일 전체를 아우름)
--   frcstOneDt/frcstOneCn   : 발표 후 1일째 대상일자 + "지역명 : 등급, ..., 신뢰도 : 등급" 텍스트
--   frcstTwoDt/frcstTwoCn   : 2일째
--   frcstThreeDt/frcstThreeCn : 3일째
--   frcstFourDt/frcstFourCn : 4일째
-- (project/decision-log.md 기존 관례: "지시서 필드명과 실측 필드명이 다르면 실측값을
-- 따르고 차이를 구현 기록에 명시" — 그대로 따른다.)
--
-- 모델링 방향: 발표 1건(presnatnDt) 당 4개 대상일(forecast_date)이 나오므로, "대상일
-- 1건 = 행 1건"으로 정규화한다(하나의 발표문을 그대로 하나의 JSON덩어리로 두면 특정
-- 날짜의 예보만 조회하기 어려워짐 — 제5장 제5조 데이터 중심 구현). "지역명 : 등급"
-- 텍스트는 어댑터가 파싱해 region_grades(jsonb 배열)로 구조화해 저장하고, 텍스트 끝의
-- "신뢰도 : 등급"은 지역이 아니므로 별도 reliability 컬럼으로 분리한다. 파싱이 혹시
-- 실패하더라도 원본 텍스트(raw_forecast_text)를 그대로 보존해 데이터 손실이 없게 한다.
--
-- spot_weather_caches와 별개 테이블인 이유: 그 테이블은 스팟마다 "지금 시점 스냅샷
-- 1건만" 유지하는 캐시 모델(스팟당 1행, upsert)이라 "여러 날짜의 지역별 예보"를
-- 저장할 여지가 구조적으로 없다 — 이 데이터는 스팟과 무관하게 전국 공통으로 발표되는
-- 예보문이라 스팟 단위 캐시에 억지로 끼워 넣지 않고 별도 테이블로 새로 만든다.
create table if not exists public.air_quality_week_forecasts (
  id uuid primary key default gen_random_uuid(),
  announced_date date not null,   -- presnatnDt: 이 예보가 발표된 날짜
  forecast_date date not null,    -- frcstOneDt~frcstFourDt 중 하나: 예보 대상일
  summary text,                   -- gwthcnd: 종합 안내문(총평, 같은 발표의 4개 행이 동일한 값을 공유)
  region_grades jsonb not null default '[]'::jsonb, -- [{ "region": "서울", "grade": "낮음" }, ...]
  reliability text,               -- "신뢰도 : 높음" 등에서 파싱한 값
  raw_forecast_text text,         -- frcstXxxCn 원본 전체 텍스트(파싱 실패 대비 보존)
  created_at timestamptz not null default now(),

  -- 같은 발표(announced_date)가 같은 대상일(forecast_date)에 대해 중복 적재되지 않도록
  -- 강제한다 — 배치가 재실행돼도 upsert(ON CONFLICT)로 안전하게 갱신 가능.
  unique (announced_date, forecast_date)
);

-- "오늘 이후 대상일의 최신 예보"를 조회하는 것이 이 테이블의 주 조회 패턴이라
-- forecast_date에 인덱스를 둔다.
create index if not exists idx_air_quality_week_forecasts_forecast_date
  on public.air_quality_week_forecasts (forecast_date);

alter table public.air_quality_week_forecasts enable row level security;
-- spot_weather_caches/curated_items 등과 동일한 프로젝트 전역 패턴(제5장 제4조 기존
-- 구조 우선) — 의도적으로 정책을 추가하지 않는다(anon/authenticated 완전 차단,
-- service_role만 접근). 공개 노출이 필요해지면 별도 서버 API 라우트로 노출한다.
