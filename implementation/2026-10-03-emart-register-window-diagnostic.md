# 접수대기 포착 가능성 진단 계측 추가

## 구현 대상
사용자 지시(2026-10-03): "이거 파악되기전까지는 당일 등록+당일 오픈이거나
우리의 배치주기보다 짧아서 우리가 캐치못할수 있는지에 대하여 데이터
가져오면서 확인해.. 그리고 우리 1일 1배치인데 이런 상태변화 잡으려면 그
주기를 줄여야 하는지도" — 직전 대화에서 "찜+접수시작 알람" 기능이 실제로
작동할 수 있는지(우리가 접수대기 상태를 포착할 시간적 여유가 있는지)에
대한 우려가 제기됐다.

## 사전 실측 확인
- 현재 DB 전체 6,520건 중 접수대기 상태로 수집된 적은 **단 한 번도 없음**
  (전부 수집 당시 이미 접수중/정원마감, 최소 14.8시간 지난 뒤였음).
- 라이브로 전국(64개 지점 전체) 기준 접수대기 건수를 직접 조회해보니
  **현재 정확히 1건**(11월 강좌, 접수 시작까지 10일 남음)뿐이었다.
- 다만 `created_at`/`collected_at`/`updated_at`이 전부 2026-10-02 한
  시점으로 동일한 것을 발견 — **지금까지 실제로는 최초 1회 수집만
  있었고, 두 번째 날짜 배치 실행이 아직 없었다**. 즉 "매일 배치가 신규
  강좌를 접수대기로 포착할 기회가 실제로 얼마나 되는지"를 판단할 날짜별
  비교 데이터가 아직 없다 — 사용자 지시대로 앞으로 쌓이는 데이터로
  확인해야 한다.

## 변경 사항 — `scripts/ingest/emart-culture-club.mjs`
### 1. `fetchExistingClassIds(client)`(신규)
업서트 전에 현재 DB에 이미 있는 class_id 전체를 `.range()` 페이지네이션으로
가져온다(1000행 캡 회피 — 이 프로젝트에서 여러 번 걸렸던 동일 패턴).

### 2. `diagnoseRegisterWindowCapture(rows, existingClassIds, now)`(신규, export)
이번 실행에서 받은 행 중 "기존에 없던(= 오늘 처음 발견한) 강좌"만 골라:
- `register_start_at`이 이미 지난 경우 → **접수대기로 포착할 기회조차
  없었던 것**으로 집계(`missedWindowCount`, 샘플 class_id 10개까지 기록).
- 아직 안 지난 경우 → 리드타임(시간 단위, 최소/중앙값)을 계산해 알람이
  실제로 작동할 여유가 얼마나 되는지 기록.

`created_at`은 기존 관례대로(`transform()`의 upsert payload에 포함된 적
없음) upsert 시 재작성되지 않고 "최초 수집 시각"을 그대로 보존한다 — 이
값과 `existingClassIds` 비교만으로 "신규 발견"을 정확히 판별할 수 있다.

### 3. `run()`에 계측 연결
업서트 직전에 진단을 실행하고 콘솔에 요약을 출력, dry-run/실제 실행 모두
반환값(`registerWindowDiagnostic`)에 포함하며, 실제 실행 시
`pipeline_logs.meta_data.registerWindowDiagnostic`에도 기록한다 — 매일
GitHub Actions가 돌 때마다 자동으로 쌓여, 며칠 뒤
`pipeline_logs`(agent_name='EMART_CULTURE_CLUB')를 조회하면 "하루짜리
배치 주기가 충분한지"를 날짜별 추세로 판단할 수 있다.

## 검증
- `scripts/ingest/emart-culture-club.test.mjs`에 `diagnoseRegisterWindowCapture`
  단위 테스트 4개 추가(신규+이미 지남=놓침 집계, 신규+안 지남=리드타임 계산,
  기존 강좌는 제외, register_start_at 없는 경우 처리).
- `npx tsc --noEmit` / `npm run test`(263개 파일 2,754개) / `npm run build`
  전부 통과.

## 특이 사항 — 배치 주기 변경은 보류
사용자가 "주기를 줄여야 하는지도" 확인해달라고 했지만, 이번 커밋에서는
**계측만 추가하고 주기(현재 매일 04:00 KST, `.github/workflows/emart-
culture-club-batch.yml`)는 바꾸지 않았다** — 아직 실제 날짜별 비교 데이터가
없어 추측으로 바꾸지 않는다(제3장 제5조). 며칠 뒤 `pipeline_logs`에 쌓인
`registerWindowDiagnostic`을 실제로 확인한 뒤, 놓친 건이 유의미하게
많다면 그때 주기 단축(예: 하루 2~3회)을 검토한다.
