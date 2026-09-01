-- [개발 요청] 스팟별 날씨 및 대기질(미세먼지) 캐시 테이블 스키마 생성(2026-09-01)
--
-- 스팟픽(open_spaces)의 개별 스팟에 대해 기상청 단기예보 API + 한국환경공단 에어코리아
-- API에서 수집한 값을 저장하는 캐시 테이블. "캐시"라는 성격상 원본 API를 다시 호출하면
-- 언제든 재생성 가능한 파생 데이터라, 배치가 주기적으로 upsert(ON CONFLICT (spot_id) DO
-- UPDATE)해 항상 최신 한 건만 유지한다(스냅샷 이력을 쌓는 테이블이 아니다).
--
-- 지시서는 FK 대상을 "spots 테이블"로 표기했으나, 이 프로젝트의 실제 공간 테이블명은
-- open_spaces다(project/database_schema.md 3.1, 이미 spot_curations이 동일하게 참조
-- 중) — 프로젝트 컨벤션에 맞춰 그대로 대응했다.
--
-- 1:1 관계: spot_id에 UNIQUE 제약을 걸어 스팟 하나당 캐시 행이 항상 하나만 존재하도록
-- 강제한다(spot_curations과 동일한 모델링 — 별도 id를 PK로 두고 spot_id는 UNIQUE FK,
-- 제5장 제4조 기존 구조 우선). UNIQUE 제약은 그 자체로 조회용 인덱스도 겸하므로 spot_id
-- 단독 조회는 이미 빠르다.
--
-- 퍼센트 값(precipitation_prob/humidity)은 의미가 명확한 0~100 범위라 CHECK 제약으로
-- 방어한다 — 특정 API의 실제 응답 포맷을 추측한 것이 아니라 "퍼센트"라는 값 자체의
-- 정의에서 오는 구조적 제약이다.
--
-- 보안: 이 앱은 아직 로그인/세션 인증이 없다(known gap, curated_items/spot_curations/
-- deals와 동일한 상황). 지시서는 예시로 "인증된 유저는 읽기 가능"을 들었으나, 이 앱에는
-- "인증된 유저" 역할이 실제로 존재하지 않아(어디에도 로그인 플로우가 없음) 그 정책을
-- 그대로 추가하면 실질적으로 아무도 못 쓰는 죽은 정책이 된다 — 대신 이미 확립된
-- 프로젝트 전역 패턴(RLS 켜고 정책 없음, service_role만 접근, 공개 조회는 서버 API
-- 라우트가 대신 앞단에서 필터링)을 그대로 따른다. 날씨/대기질 데이터를 실제로 화면에
-- 공개하려면 spot_curations처럼 별도 공개 GET 라우트(/api/spot-weather 등)를 서비스
-- 롤로 만들면 된다 — 이번 지시서 범위는 스키마 생성까지다.
create table if not exists public.spot_weather_caches (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null unique references public.open_spaces(id) on delete cascade,

  -- 기상청 단기예보(getVilageFcst) 매핑
  temperature numeric,                 -- TMP: 기온(℃)
  precipitation_prob integer check (precipitation_prob between 0 and 100), -- POP: 강수확률(%)
  sky_status text,                     -- SKY: 하늘상태(원본 코드 또는 번역 라벨 — 수집기 구현 시 결정)
  humidity integer check (humidity between 0 and 100), -- REH: 습도(%)

  -- 한국환경공단 에어코리아(getMsrstnAcctoRltmMesureDnsty) 매핑
  pm10 numeric,                        -- pm10Value: 미세먼지 농도(㎍/㎥)
  pm25 numeric,                        -- pm25Value: 초미세먼지 농도(㎍/㎥)
  pm10_grade text,                     -- pm10Grade: 등급(원본 코드 또는 "좋음/보통/나쁨/매우나쁨" 라벨)
  pm25_grade text,                     -- pm25Grade: 등급

  updated_at timestamptz not null default now()
);

-- "캐시" 테이블 특유의 조회 패턴(오래된 캐시 골라내기/TTL 만료 판정)을 위한 인덱스.
-- spot_id 조회는 위 unique 제약이 이미 인덱스를 겸해 별도 인덱스가 필요 없다.
create index if not exists idx_spot_weather_caches_updated_at on public.spot_weather_caches (updated_at);

alter table public.spot_weather_caches enable row level security;
-- 의도적으로 정책을 추가하지 않는다 — curated_items/spot_curations/deals와 동일 패턴
-- (anon/authenticated는 완전히 차단, service_role만 접근 가능). 공개 조회가 필요해지면
-- 별도 서버 API 라우트(createAdminClient 사용)를 통해서만 노출한다.
