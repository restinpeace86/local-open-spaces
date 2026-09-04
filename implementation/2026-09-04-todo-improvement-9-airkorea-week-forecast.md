# [개선사항9] 에어코리아 초미세먼지 '주간예보' 엔드포인트 신규 연동

## 구현 대상
`implementation/todo.md` [개선사항9]:
1. 공공데이터포털 에어코리아 주간예보통보 조회 API(`/getMinuDustWeekFrcstDspth`) 연동.
2. 기존 단기(실시간) 예보 저장 방식을 참고해 DB에 안전하게 적재.
3. 기존 대기질 API 연동 코드의 구조/에러 처리/네이밍 컨벤션 유지.

## 구현 일시
2026-09-04

## 실측 확인 — 지시서 필드명과 실제 응답이 다름
지시서 원문은 "informData, informCode, informOverall, 권역별 등급"을 언급했지만,
`PUBLIC_DATA_API_KEY`로 이 엔드포인트를 직접 호출해 확인한 결과 그런 필드는
존재하지 않았다(project/decision-log.md의 기존 관례대로 실측값을 따르고 차이를
여기 명시한다). 실제 응답 구조:
- `presnatnDt`: 예보 발표일자
- `gwthcnd`: 종합 안내문(총평, 발표 1건당 하나 — 4일 전체를 아우름)
- `frcstOneDt`/`frcstOneCn` ~ `frcstFourDt`/`frcstFourCn`: 1~4일째 대상일자 +
  "지역명 : 등급, ..., 신뢰도 : 등급" 텍스트

또한 `InformCode=PM10`/`PM25`를 명시적으로 넘겨도 응답이 완전히 동일함을 확인했다 —
이 엔드포인트는 PM10/PM2.5를 구분하지 않고 "미세먼지" 통합 주간 전망 1건만
발표한다. 그래서 지시서가 언급한 `informCode` 컬럼은 만들지 않았다(존재하지 않는
구분을 있는 것처럼 지어내지 않음).

## 변경 사항
### 1. 신규 테이블 (`scripts/migrations/2026-09-04-create-air-quality-week-forecasts-table.sql`)
`air_quality_week_forecasts`를 새로 만들었다(실제 라이브 DB에 적용 완료, 컬럼
확인함). `spot_weather_caches`(스팟당 "지금" 스냅샷 1건만 유지하는 캐시 모델)와는
근본적으로 다른 데이터(스팟과 무관한 전국 공통 예보, 여러 날짜)라 별도 테이블로
분리했다. "발표 1건 = 대상일 4건"을 "대상일 1건 = 행 1건"으로 정규화하고,
"지역명 : 등급" 텍스트는 어댑터가 `region_grades`(jsonb 배열)로 구조화해 저장,
"신뢰도"는 별도 컬럼으로 분리, 원본 텍스트는 `raw_forecast_text`에 그대로 보존해
파싱 실패 시에도 데이터 손실이 없게 했다. `(announced_date, forecast_date)` unique
제약으로 재실행 시 안전하게 upsert된다. RLS는 기존 프로젝트 전역 관례(정책 없이
enable만 — service_role만 접근)를 그대로 따랐다.

### 2. 신규 어댑터 (`scripts/ingest/adapters/airkorea-week-forecast-adapter.mjs`)
기존 `airkorea-adapter.mjs`(시/도별 실시간 대기질)와 같은 API 그룹
(`ArpltnInforInqireSvc`)이라 인증키 처리/HTTP 호출/JSON 파싱/에러 판별 로직
(`fetchAirKoreaItems`)을 그 파일에서 export해 그대로 재사용했다(제5장 제4조 기존
구조 우선 — 복붙하지 않음). 재시도(2회, `withRetry`)/배치 upsert(500건,
`kma-weather-adapter.mjs`의 `upsertWeatherCaches`와 동일한 관례)/환경변수 사전
점검(`getMissingEnvVars`)/CLI 진입점 가드까지 기존 대기질 어댑터들과 동일한 구조를
그대로 따랐다. 이 엔드포인트는 시/도별로 여러 번 호출하는 구조가 아니라 발표문
1건을 한 번만 조회하므로, `settleGroupFetches`(개별 그룹 격리)는 적용 대상이
없어 쓰지 않았다 — API 실패는 배치 전체 실패로 정직하게 보고한다.

### 3. 검증 (실제 라이브 API + DB로 직접 확인)
- `--dry-run`으로 실제 API를 호출해 파싱 결과(발표 1건 → 대상일 4건, 지역 19개
  + 신뢰도)를 확인했다.
- 실제 실행(dry-run 아님)으로 `air_quality_week_forecasts`에 4건이 정상 upsert됨을
  SQL로 직접 재확인했다(announced_date/forecast_date/region_grades 배열 길이 19/
  reliability 모두 기대값과 일치).
- 단위 테스트(`airkorea-week-forecast-adapter.test.mjs`, 신규 8개): 지역/등급 텍스트
  파싱, 발표문→대상일 4건 정규화(날짜 필드 없는 날은 행을 만들지 않음), API 호출/
  에러 응답 처리, upsert onConflict 지정을 검증했다.

## 특이 사항
- 이 어댑터는 기존 `airkorea-adapter.mjs`/`kma-weather-adapter.mjs`와 동일하게
  `run-daily.mjs`/`run-monthly.mjs`에 등록돼 있지 않고, package.json에도 전용 npm
  스크립트가 없다(둘 다 실측 확인 — 두 기존 대기질 어댑터도 마찬가지로 등록/스크립트가
  없다) — 이 프로젝트의 기존 관례(별도 스케줄링 메커니즘에서 `node scripts/ingest/
  adapters/<file>.mjs`로 직접 실행)를 그대로 따라 새로 등록하지 않았다.
- 이번 지시 범위는 "엔드포인트 연동 + DB 적재"까지다 — 이 데이터를 화면에 노출하는
  소비 UI는 지시서에 없어 만들지 않았다(제7장 제4조 미래 기능 구현 금지).
- 검증: `npx tsc --noEmit` 통과, `npm run test`(100개 파일/1067개 테스트, 기존
  1059개 + 신규 8개) 전체 통과, `npm run build` 프로덕션 빌드 통과.
