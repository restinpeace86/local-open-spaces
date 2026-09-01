# [개발 요청] 기상청 단기예보 조회서비스 연동 어댑터 구현 (실제 API 스펙 반영)

## 구현 일시
2026-09-01

## 배경
직전 작업(`spot_weather_caches` 스키마 생성)에 이어, 실제로 그 테이블을 채우는
기상청 단기예보 어댑터를 구현했다.

## 구현 내용

### 인증키 — 새 환경변수를 만들지 않음
사용자가 제공한 "디코딩 키"를 URL-디코딩(`%2B`→`+`, `%3D%3D`→`==`)해 보니 기존
`.env.local`의 `PUBLIC_DATA_API_KEY`와 정확히 일치했다(길이/값 모두 확인, 실제
값은 로그에 남기지 않음). 새 환경변수를 만들지 않고 그대로 재사용한다 —
`tour-api-festival.mjs`가 이미 겪은 "디코딩된 키에 encodeURIComponent를 정확히
한 번만 적용해야 한다(이중 인코딩 시 인증 실패)"는 관례를 그대로 따랐다.

### 신규 유틸(재사용 가능하도록 분리)
- **`scripts/ingest/lib/kma-grid.mjs`**: 위경도(WGS84) → 기상청 5km 격자(nx, ny)
  변환. 기상청이 공개한 LCC(Lambert Conformal Conic) 표준 공식/상수를 그대로
  구현했다 — 서울시청(37.5665, 126.978)→(60,127), 부산시청→(98,76), 제주시→
  (53,38) 등 잘 알려진 기준점과 정확히 일치함을 실측으로 확인했다(최초 구현 시
  반올림 상수를 잘못 써서 (nx+1, ny+1)로 어긋난 것을 이 기준값 비교로 바로
  잡았다).
- **`scripts/ingest/lib/kma-base-time.mjs`**: `getVilageFcst`(하루 8회, 02/05/08/
  11/14/17/20/23시 KST 발표)와 `getUltraSrtNcst`(매시 정각 관측) 각각의 발표
  스케줄에 맞춰 "지금 요청 가능한 가장 최신 base_date/base_time"을 계산한다.
  발표 직후 API 반영까지의 10분 지연을 안전 마진으로 뒀다. 실행 환경의 로컬
  타임존과 무관하게 항상 같은 결과를 내도록 UTC epoch 산술로 KST 벽시계 시각을
  직접 계산한다(GitHub Actions 러너는 UTC, 로컬 개발 환경은 임의의 타임존일 수
  있음).

### 어댑터: `scripts/ingest/adapters/kma-weather-adapter.mjs`
`BaseCollectorAdapter`를 상속하지 않는다 — 다른 어댑터들은 "외부 카탈로그를 한 번
훑어 open_spaces/events에 신규 행을 upsert"하는 모델인데, 이 어댑터는 "이미 존재
하는 스팟마다" 좌표 기준 날씨를 조회해 별도 1:1 캐시 테이블에 채우는 것이 목적이라
데이터 모델 자체가 다르다 — `tour-api-festival.mjs`/`seoul-culture-events.mjs`와
같은 함수 기반 모듈로 구현했다(제5장 제4조 기존 구조 우선 — 안 맞는 틀에 억지로
끼워맞추지 않음).

- **격자 그룹핑(신규 최적화, 요구사항에 없었지만 필요성이 명백해 추가)**:
  open_spaces가 141,980행 규모라(2026-08-30 실측) 스팟마다 개별 API 호출을 하면
  같은 5km 격자를 공유하는 스팟들이 완전히 동일한 날씨를 반복 조회하게 되어 API
  호출이 크게 낭비된다. `groupSpotsByGrid()`로 좌표를 먼저 격자로 변환해 그룹핑한
  뒤, 격자당 API를 정확히 1회만 호출하고 그 결과를 소속된 모든 스팟에 복사한다.
- **개별 에러 격리**: 격자 하나의 API 호출이 실패해도 다른 격자는 계속 진행하도록
  2026-09-01에 이미 구축한 `settleGroupFetches`를 그대로 재사용했다(제5장 제4조).
- **30초 타임아웃 + 재시도**: 역시 이미 구축한 `fetchWithTimeout`(30초)과
  `withRetry`(5초→10초 백오프)를 재사용하되, 이번 요구사항이 명시한 "최대 2회
  재시도"에 맞춰 `retries: 2`로 지정했다.
- **파싱**: `getVilageFcst`는 여러 발표 시각(fcstDate/fcstTime)에 걸친 예보를
  한꺼번에 내려준다 — `spot_weather_caches`는 스팟당 "현재" 스냅샷 한 건만
  저장하므로, 가장 이른(=지금과 가장 가까운) 예보 시각 하나만 골라 그 시각의
  TMP/POP/SKY/REH를 추출한다. SKY 코드(1/3/4)는 기상청 공식 코드표대로 "맑음/
  구름많음/흐림"으로 번역하고, 모르는 코드는 원본 값을 그대로 둔다(추측 금지).
- **getUltraSrtNcst(선택적 적용)**: `useUltraSrtNcst: true`를 넘기면 T1H(기온)/
  REH(습도) 실황으로 temperature/humidity를 보강 시도한다 — 실패해도 예보값을
  그대로 쓰고 전체를 실패시키지 않는다(요구사항이 "선택적"이라고 명시한 부가
  기능이라 필수 경로의 안정성보다 우선할 수 없다고 판단).
- **업서트**: `spot_weather_caches`는 "캐시"라 open_spaces/events의
  `upsertRowsSafeMerge`(NULL 병합, 기존 값 보존)와 다르게 최신값으로 완전히
  덮어써야 한다 — 전용 `upsertWeatherCaches()`가 일반 `upsert(onConflict: 'spot_id')`
  를 쓴다.
- **CLI**: `node scripts/ingest/adapters/kma-weather-adapter.mjs [--dry-run]
  [--limit=N] [--with-ultra-srt-ncst]`로 단독 실행 가능.

## 검증

### 코드 검증
- `npx tsc --noEmit`/`npm run test`(78파일 798건 — `kma-grid.test.mjs` 5건,
  `kma-base-time.test.mjs` 9건, `kma-weather-adapter.test.mjs` 15건 신규)/
  `npm run build` 통과.

### 실측 검증(로컬 개발 서버, 실제 기상청 API, 프로덕션 DB — 테스트 데이터는
검증 직후 전량 삭제)
- 실제 스팟 5건으로 `--dry-run` 실행 → 실제 기상청 API가 정상 응답(기온 22~26℃,
  습도 90~95%, "흐림" — 오늘 실제 날씨와 부합하는 합리적인 값)해 5/5건 확보됨을
  확인.
- `--dry-run` 없이 실행 → `spot_weather_caches`에 실제로 5개 행이 upsert됨을
  DB에서 직접 확인(pm10/pm25는 이번 범위(대기질 API는 별도 지시서) 밖이라 계획대로
  null).
- `--with-ultra-srt-ncst` 플래그로 재실행 → 여전히 정확히 5행(중복 생성 없음,
  같은 `spot_id`에 upsert가 정상적으로 덮어씀)을 확인.
- 격자 그룹핑/에러 격리는 실제 API에서 인위적으로 실패를 재현하기 어려워
  `kma-weather-adapter.test.mjs`의 목(mock) 기반 테스트로 정확히 검증했다(한
  격자 실패 시 다른 격자는 정상 처리, 같은 격자 공유 스팟은 API 1회만 호출).

## 특이 사항
- 이번 지시서는 "어댑터 모듈 구현"까지가 범위라, `run-daily.mjs`/`run-monthly.mjs`
  배치 오케스트레이션이나 별도 GitHub Actions 워크플로/cron 스케줄에는 아직
  연결하지 않았다 — 별도 지시로 진행 가능하다.
- `DEFAULT_SPOT_LIMIT=2000`(안전장치, `run()`의 `limit` 옵션으로 조정 가능)으로
  기본값을 뒀다 — 격자 그룹핑으로 API 호출 수는 크게 줄어들지만, 141,980건 전체를
  한 회차에 조회/upsert하면 실행 시간이 과도해질 수 있어 보수적으로 잡았다.
  실제 운영 규모는 배치 오케스트레이션을 붙일 때 함께 결정하는 것을 제안한다.
- 대기질(에어코리아) 연동은 이번 지시서 범위 밖이다(요구사항이 기상청 단기예보만
  명시) — `pm10`/`pm25`/`pm10_grade`/`pm25_grade`는 이 어댑터가 항상 null로 둔다.
