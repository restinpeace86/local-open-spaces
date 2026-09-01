# [개발 요청] 기상청 날씨 데이터 수집 3시간 주기 배치(Cron) 파이프라인 연동

## 구현 일시
2026-09-01

## 배경
직전 작업(`kma-weather-adapter.mjs` 구현)이 명시적으로 남긴 특이 사항 두 가지 —
"배치 오케스트레이션/GitHub Actions 워크플로는 아직 연결하지 않음", "`DEFAULT_
SPOT_LIMIT=2000`은 배치 오케스트레이션을 붙일 때 함께 결정 제안" — 를 이번 지시로
완료했다.

## 구현 내용

### 1. `kma-weather-adapter.mjs` — 전국 EXACT 스팟 전체를 기본 대상으로 전환
- **`fetchAllExactSpots(client)`**(신규): `dedupe-open-spaces.mjs`의
  `fetchAllOpenSpaces()`와 동일한 `.gt('id', lastId)` 커서 페이지네이션을 그대로
  재사용해, PostgREST 기본 응답 상한 없이 `open_spaces` EXACT 스팟 전체(실측
  142,024건)를 안전하게 다 가져온다.
- **"활성화된 스팟" 해석**: `open_spaces`에는 소프트 삭제/활성화 컬럼이 없어(직전
  작업에서 이미 확인한 사실), 요구사항의 "활성화된 모든 스팟"은 기존 관례와
  동일하게 "좌표가 확정된(`location_precision='EXACT'`) 스팟"으로 해석했다.
- **`run()` 기본 동작 변경**: `limit`을 넘기지 않으면(운영 시 기본 경로)
  `fetchAllExactSpots`로 전국 전체를 대상으로 하고, `limit`을 명시하면(CLI
  `--limit=N`, 실측 검증용) 기존처럼 소규모 조회로 제한한다 — 기존
  `DEFAULT_SPOT_LIMIT=2000` 안전장치는 이번 지시로 명확히 "전국 전체가 기본값"으로
  대체되어 제거했다. 격자 그룹핑이 이미 API 호출 수를 5km 격자 단위로 크게 줄여주므로
  (요구사항 2, 실측 시 142,024개 스팟이 훨씬 적은 수의 고유 격자로 그룹핑됨), 실제
  외부 API 호출 횟수는 스팟 수가 아니라 격자 수에 비례한다.
- **`collectWeatherForSpots()` 반환 형태 변경**: 요구사항 5 "실행 로깅: 총 처리된
  격자 수, 성공/실패 건수"를 위해 기존 `rows` 배열 단독 반환을 `{ rows, totalGroups,
  succeededGroups, failedGroups }` 객체로 바꿨다 — 기존 테스트 2건이 이 반환 형태를
  구조분해하도록 함께 수정.
- **env-precheck 추가**: `run-daily.mjs`/`run-monthly.mjs`가 2026-08-30 카스케이드
  실패 사고 이후 채택한 관례(필수 환경변수 누락을 시작 시점에 한 번에 검사)를 이
  배치에도 동일하게 적용했다(`NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
  `PUBLIC_DATA_API_KEY`) — 요구사항에 명시되지 않았지만, 이미 실제로 겪은 장애를
  예방하는 기존 패턴을 그대로 재사용한 것이라 임의 기능 추가로 보지 않았다.
- **로깅 강화**(요구사항 5): 배치 시작(dry-run 여부, 대상 범위), 대상 스팟 수, 격자
  처리 결과(총/성공/실패), 최종 upsert 건수, 소요 시간(초 단위)을 배치 시작부터
  끝까지 순서대로 콘솔에 남긴다.

### 2. GitHub Actions 워크플로 — `.github/workflows/ingest-weather.yml`(신규)
- **소스가 KMA 하나뿐이라 별도 오케스트레이터(`run-weather.mjs`) 없이 어댑터 CLI
  진입점을 직접 실행 대상으로 삼았다**(제5장 제4조 기존 구조 우선 — `run-daily.mjs`/
  `run-monthly.mjs`는 다중 소스를 순차 처리하는 이유로 존재하는데, 이 배치는 그럴
  필요가 없다).
- **Cron: `47 2,5,8,11,14,17,20,23 * * *`** — 요구사항이 제시한 값을 KST/UTC 조정
  없이 그대로 사용했다. 계산으로 확인한 근거: KST 오프셋(+9시간)이 발표 주기(3시간)의
  정확한 배수라서, `[2,5,8,11,14,17,20,23]`을 KST로 읽든 GitHub Actions가 실제로
  해석하는 UTC로 읽든 완전히 동일한 시(hour) 집합이 나온다(각 값 mod 3 = 2이고 9도
  3의 배수라 -9시간 이동이 나머지를 보존함 — daily/monthly 배치와 달리 이번 값
  집합은 예외적으로 조정이 불필요하다는 점을 코드 주석에도 명시).
- **`docs/pipeline-log.md`에는 기록하지 않음**(의도적 설계 결정): 기존
  `recordBatchRun()`/`splitTableCounts()`는 "외부 카탈로그를 훑어 events/
  open_spaces에 신규 행을 upsert"하는 배치를 위한 표 포맷(RAW 수신 vs 테이블별
  적재 vs 드롭 검증)이라, `spot_weather_caches`(격자 단위 날씨 캐시 갱신)와 데이터
  모델이 근본적으로 달라 억지로 끼워 맞추면 "open_spaces 적재 건수" 칸에 날씨 캐시
  건수가 찍혀 오히려 오해를 부른다. 요구사항 5가 "콘솔 또는 시스템 로거"를 명시적으로
  허용하므로, 어댑터가 남기는 구조화된 콘솔 로그를 GitHub Actions 자체 실행 로그로
  남기는 것으로 충분하다고 판단했다 — 8회/일 주기로 매번 리포지토리에 로그를
  커밋하면(daily/monthly 대비 8배 빈도) 불필요한 git 노이즈만 커진다는 점도 함께
  고려했다.
- **워크플로 레벨 재시도 없음**(의도적 설계 결정): daily/monthly는 "하루/한달에 한
  번"이라 실패 시 15분 대기 후 1회 재시도하는 안전장치를 뒀지만, 이 배치는 3시간마다
  자동으로 다시 돌아 한 번 실패해도 최대 3시간 뒤 다음 주기가 스스로 복구하므로
  재시도 로직은 불필요한 복잡도로 판단해 넣지 않았다.
- 나머지(Node 22 설정 이유, `permissions` 등)는 `ingest-daily.yml`/
  `ingest-monthly.yml`과 동일한 관례를 따름.

## 검증

### 코드 검증
- `npx tsc --noEmit`/`npm run test`(78파일 801건 — `kma-weather-adapter.test.mjs`에
  `fetchAllExactSpots` 페이지네이션 테스트 2건 + `collectWeatherForSpots` 빈 입력
  테스트 1건 신규, 기존 2건은 새 반환 형태에 맞춰 수정)/`npm run build` 통과.

### 실측 검증(실제 기상청 API, 프로덕션 DB — 테스트 데이터는 검증 직후 전량 삭제)
- `--dry-run --limit=5` → 실제 기상청 API가 정상 응답(기온 22~26℃, 습도 90~95%,
  "흐림")하고 새 로깅 포맷(총 격자 5개, 성공 5/실패 0, 소요 시간)이 올바르게
  출력됨을 확인.
- `--limit=5`(실제 upsert) → `spot_weather_caches`에 실제로 5개 행이 upsert됨을
  DB에서 직접 확인.
- `fetchAllExactSpots(client)`를 실제 프로덕션 DB로 직접 호출 → 전국 EXACT 스팟
  142,024건 전체를 커서 페이지네이션으로 누락 없이 수집함을 확인(소요 99초, 이는
  DB 조회 단계만의 시간이며 배치 자체의 격자 API 호출/upsert 시간은 별도).
- 필수 환경변수(`PUBLIC_DATA_API_KEY`) 삭제 후 `run()` 호출 → env-precheck가
  올바르게 감지해 `{failed: true, ...}`를 반환하고 명확한 에러 메시지를 남김을 확인.
- 검증에 사용한 5건의 `spot_weather_caches` 테스트 행은 검증 직후 전량 삭제해 DB를
  원상 복구했다.

## 특이 사항
- 이번 지시서 범위는 "기상청(KMA) 단일 소스의 3시간 주기 배치"까지다 — 에어코리아
  (대기질) 연동은 여전히 범위 밖이라 `pm10`/`pm25`/`pm10_grade`/`pm25_grade`는
  이 어댑터가 항상 null로 둔다(직전 작업과 동일).
- GitHub Actions 스케줄이 실제로 3시간마다 트리거되는지는 코드/로컬 실행으로는
  검증할 수 없는 영역이라(GitHub 인프라 스케줄러 동작 자체), 병합 후 실제 운영
  환경에서 1~2 주기 관찰이 필요하다 — daily/monthly 배치 때도 동일한 한계가 있었고,
  그때와 마찬가지로 `workflow_dispatch`로 언제든 수동 트리거해 즉시 확인할 수 있다.
