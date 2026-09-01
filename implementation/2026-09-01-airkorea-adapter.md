# [개발 요청] 에어코리아(한국환경공단) 시도별 실시간 대기질 API 연동 어댑터 구현 (실제 API 스펙 반영)

## 구현 일시
2026-09-01

## 배경
`spot_weather_caches` 스키마와 KMA 날씨 어댑터가 항상 null로 남겨뒀던 `pm10`/`pm25`/
`pm10_grade`/`pm25_grade` 컬럼을, 이번 지시로 에어코리아 대기오염정보 서비스
(`ArpltnInforInqireSvc`)와 연동해 채운다.

## 구현 내용

### 인증키 — 새 환경변수를 만들지 않음
이번 지시서가 제공한 "디코딩 키"를 URL-디코딩해 보니 KMA 어댑터가 이미 재사용 중인
`.env.local`의 `PUBLIC_DATA_API_KEY`와 정확히 일치했다(공공데이터포털은 여러 API에
동일한 포털 인증키를 공유하는 것이 일반적). 새 환경변수를 만들지 않았다.

### 신규 유틸: `scripts/ingest/lib/address-sido-lookup.mjs`
- **`extractSidoName(address)`**: `open_spaces.address`의 첫 토큰(시/도)을 AirKorea
  `sidoName` 파라미터가 받는 17개 약칭으로 변환한다.
- **실측 기반 표 구성(추측 금지)**: 실제 프로덕션 DB의 EXACT 스팟 142,024건 전체
  (325개 고유 첫 토큰)를 전수 스캔해, 공식 정식 명칭 + 이 프로젝트 데이터에서 실제로
  관측된 약칭/표기 변형(예: "경기", "충남", "제주특별자치시"(오탈자성 변형, 19건))만
  표에 포함했다 — 있을 법한 표기를 임의로 추가하지 않았다.
- **의도적으로 매핑하지 않은 값**:
  - `"전남광주통합특별시"`(실측 2,584건) — 17개 표준 시/도 어디에도 대응되지 않는
    표기라, 전라남도/광주광역시 중 어느 쪽을 의미하는지(또는 통합 신설 개체인지)
    확정할 근거가 없어 추측 매핑하지 않고 null로 둔다.
  - `"광주시"`(첫 토큰 단독) — `korea-region-lookup.mjs`의 `AMBIGUOUS_NAMES`가 이미
    문서화한 것과 동일한 이유(경기도 광주시의 "경기도" 생략 표기인지, 광주광역시
    약칭인지 구분 불가)로 제외했다.
  - 위 두 경우를 포함해 매핑 실패한 스팟은 대기질 갱신 대상에서 자연스럽게
    제외되며, 런타임 로그로 미매칭 건수를 투명하게 남긴다(`--limit=10` 실측에서
    2건 확인, 원인도 직접 대조 확인).

### 어댑터: `scripts/ingest/adapters/airkorea-adapter.mjs`
`kma-weather-adapter.mjs`와 동일하게 `BaseCollectorAdapter`를 상속하지 않는 함수
기반 모듈로 구현했다(제5장 제4조 기존 구조 우선).

- **시도별 순회 수집(요구사항 1)**: `SIDO_NAMES`(17개) 각각에 대해
  `/getCtprvnRltmMesureDnsty`를 호출한다. **개별 시/도 에러 격리(요구사항 4)**는
  `kma-weather-adapter.mjs`가 격자 격리에 쓰던 `settleGroupFetches`를 그대로
  재사용했다(제5장 제4조) — 한 시/도가 실패해도 나머지 16개는 계속 진행된다.
- **AirKorea 응답 구조 차이**: KMA는 `items.item`으로 한 번 더 감싸지만, 에어코리아
  JSON 응답은 `items`가 곧바로 배열이다(실제 API 응답으로 확인) — 파싱 코드에서
  이 차이를 명시적으로 반영했다.
- **파싱/방어(요구사항 2)**: `pm10Value`/`pm25Value`는 `'-'`/빈 문자열/비숫자 값을
  전부 null로 방어(`parseNumericOrNull`), `pm10Grade`/`pm25Grade`는 1~4 범위를 벗어난
  값도 null로 방어(`parseGradeCodeOrNull`)한 뒤, 요구사항이 명시한 공식 등급 코드표
  (1=좋음/2=보통/3=나쁨/4=매우나쁨)로 라벨을 번역한다(`kma-weather-adapter.mjs`의
  SKY 코드 번역과 동일한 관례).
- **시/도 단위 대표값 집계(신규 구현 판단, 요구사항에 미명시)**: `/getCtprvnRltmMesureDnsty`가
  위경도 없이 시/도 전체의 측정소 목록만 반환하는 API 설계 한계상, 측정소별 정밀
  매칭이 불가능하다 — 한 시/도 안의 여러 측정소 값을 평균해 대표값 하나로 요약한다
  (등급은 원본 코드를 평균한 뒤 반올림해 다시 라벨로 번역). 요구사항이 집계 방식을
  지정하지 않아 내린 구현 판단이며, 구현 기록에 이렇게 명시적으로 남긴다.
- **30초 타임아웃 + 재시도(요구사항 4)**: `fetchWithTimeout`(30초)/`withRetry`
  (5초→10초 백오프, `retries: 2`) 재사용 — 실측 중 실제로 부산/경남 측정소 API가
  일시적 504(SERVICETIMEOUT_ERROR)를 반환했고, 재시도로 정상 복구됨을 직접 확인했다.
- **스팟 조회**: `kma-weather-adapter.mjs`의 `fetchAllExactSpots`와 동일한 커서
  페이지네이션이지만 select 컬럼만 다른(`address` 필요) `fetchAllExactSpotsWithAddress`
  를 이 어댑터 안에 별도로 뒀다 — 두 어댑터 파일 간 직접 import로 묶기보다, 이
  프로젝트가 이미 채택한 "같은 목적의 작은 헬퍼를 파일별로 각자 유지"하는 관례
  (`korea-region-lookup.ts`/`.mjs` 미러 등)를 따랐다.
- **env-precheck**: `run-daily.mjs`/`kma-weather-adapter.mjs`와 동일한 관례로 필수
  환경변수(`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`PUBLIC_DATA_API_KEY`)
  를 시작 시점에 검사한다.
- **업서트(요구사항 3)**: `kma-weather-adapter.mjs`가 이미 구축한 `upsertWeatherCaches`
  를 그대로 재사용했다(중복 구현 없음, 제5장 제4조) — payload에 `pm10`/`pm25`/
  `pm10_grade`/`pm25_grade`만 담아 KMA가 채운 `temperature`/`precipitation_prob`/
  `sky_status`/`humidity`는 건드리지 않는다(Supabase upsert는 payload에 없는 컬럼을
  덮어쓰지 않는 것을 실측으로 직접 확인).
- **CLI**: `node scripts/ingest/adapters/airkorea-adapter.mjs [--dry-run] [--limit=N]`.

## 검증

### 코드 검증
- `npx tsc --noEmit`/`npm run test`(80파일 818건 — `address-sido-lookup.test.mjs` 7건
  + `airkorea-adapter.test.mjs` 10건 신규)/`npm run build` 통과.

### 실측 검증(실제 에어코리아 API, 프로덕션 DB — 테스트 데이터는 검증 직후 전량 삭제)
- 실제 스팟 10건으로 `--dry-run` 실행 → 17개 시/도 모두 성공(부산/경남은 첫 시도
  504 타임아웃 후 재시도로 정상 복구되는 것을 로그로 직접 확인), 10건 중 8건 매핑
  성공(합리적인 실제 값: PM10 10~17㎍/㎥·PM2.5 3~8㎍/㎥·"좋음" 등급 — 오늘 실제
  대기질과 부합), 2건은 `"전남광주통합특별시"` 주소라 의도대로 미매칭됨을 직접 대조
  확인.
- `--dry-run` 없이 실행 → `spot_weather_caches`에 실제로 8개 행이 pm10/pm25/등급만
  채워지고 temperature 등은 null로 upsert됨을 DB에서 직접 확인.
- 같은 10개 스팟에 KMA 날씨 어댑터를 재실행 → temperature/sky_status가 채워지면서도
  기존 pm10/pm25/pm10_grade 값이 전혀 손상되지 않고 그대로 유지됨을 DB에서 직접
  확인(두 어댑터의 부분 컬럼 upsert가 서로 안전하게 공존함을 실증).
- 검증에 사용한 10건의 `spot_weather_caches` 테스트 행은 검증 직후 전량 삭제해 DB를
  원상 복구했다.

## 특이 사항
- 이번 지시서 범위는 "에어코리아 어댑터 모듈 구현"까지다 — 3시간 주기 배치(Cron)
  파이프라인 연동은 KMA 때와 마찬가지로 별도 지시로 진행 가능하다(현재
  `ingest-weather.yml`은 KMA만 실행 대상으로 하고 있음).
- 시/도 단위 대표값 집계이므로, KMA의 5km 격자 매칭보다 훨씬 거친 정밀도다(같은
  시/도 안의 모든 스팟이 동일한 pm10/pm25 값을 공유) — 이는 요구사항이 지정한
  `/getCtprvnRltmMesureDnsty` API 자체의 설계 한계이며, 더 정밀한 측정소별 매칭이
  필요하면 측정소 위경도를 함께 제공하는 다른 엔드포인트(`getMsrstnAcctoRltmMesureDnsty`
  등) 연동이 별도로 필요하다.
