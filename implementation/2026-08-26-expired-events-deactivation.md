# [0순위 우선 요청] 만료 데이터 자동 비활성화 배치 프로세스 반영, 어드민 날짜 필드 추가 및 시뮬레이션 보고

## 구현 대상
- `events.end_date < CURRENT_DATE - INTERVAL '2 DAY'`인 행을 `is_active = false`로 전환하는
  자동 비활성화 로직을 매일 새벽 배치(`run-daily.mjs`)에 반영
- `/admin/data-grid`에 `start_date`/`end_date`(행사 기간) 필드 노출, 기본 조회 조건에
  `is_active = true` 적용
- 실제 DB 반영 전 읽기 전용 시뮬레이션 보고

## 구현 일시
2026-08-26

## 사전 준수 확인
지시사항에 명시된 순서를 그대로 따랐다 — "실제 DB 데이터를 수정/업데이트하기 전에... 시뮬레이션
분석 결과 보고서부터 제출"에 따라, 시뮬레이션(읽기 전용 COUNT 쿼리)을 먼저 실행해
`docs/category-mapping-keywords-draft.md` 4절에 결과를 기록한 뒤 코드 구현을 진행했다.
**이번 세션에서 실제 `UPDATE events SET is_active = false`는 직접 실행하지 않았다** — 배치
코드에는 반영해 커밋·배포했으므로, 기존 스케줄(GitHub Actions `ingest-daily.yml`, 매일
03:00 KST)의 다음 정기 실행부터 자동으로 적용되기 시작한다.

## 시뮬레이션 결과 (실측, 2026-08-26 기준일, DB 변경 없음)

| 항목 | 건수 |
| :--- | ---: |
| 1) 전체 events 데이터 수량 | 26,404건 |
| 2) 새로 비활성화될 만료 데이터 수량 | 21,523건 (81.5%) |
| 3) 최종적으로 남는 유효(is_active=true) 데이터 수량 | 3,560건 |
| (참고) 이미 is_active=false인 행 | 1,321건(이 중 169건은 만료 사유와도 일치, 1,152건은 다른 사유) |

상세 표/해석은 `docs/category-mapping-keywords-draft.md` 4.2절 참고.

## 추가 구현 및 실제 실행 (2026-08-26, [만료 데이터 일괄 비활성화 실행] 지시에 따라 진행)

대표 지시에 따라 시뮬레이션과 동일한 로직(`scripts/ingest/lib/deactivate-expired-events.mjs`의
`deactivateExpiredEvents()`)을 단독 실행 스크립트로 호출해 실제 `UPDATE`를 수행했다(전체
일간 배치를 다시 돌리지 않고 이 단계만 실행 — 불필요한 외부 API 재호출 방지).

**실행 결과(DB 직조회, 실측)**:

| 항목 | 건수 | 시뮬레이션 예측과 비교 |
| :--- | ---: | :--- |
| 실제로 비활성화된 행 | 21,523건 | 예측(21,523건)과 정확히 일치 |
| 실행 후 전체 events | 26,404건 | 변동 없음(행 삭제 아님) |
| 실행 후 `is_active=true`(최종 유효) | 3,560건 | 예측(3,560건)과 정확히 일치 |
| 실행 후 `is_active=false`(비활성) | 22,844건 | 기존 1,321건 + 신규 21,523건 = 22,844건, 정확히 일치 |

시뮬레이션 예측과 실제 실행 결과가 1건의 오차도 없이 일치했다 — 시뮬레이션 쿼리와 실제
`UPDATE` 쿼리가 동일한 컷오프 계산(`computeExpiryCutoffDate`)과 조건을 공유하도록 구현한
설계가 의도대로 동작함을 실측으로 재확인했다.

검증: 실행 전후 `npx tsc --noEmit`(clean)과 `npm run build`(성공) 재확인 — 이 단계는 코드
변경이 아니라 실행이라 원칙적으로 영향이 없지만, 지시대로 재검증했다.

## 변경 사항

### 1. 배치 로직 (`scripts/ingest/lib/deactivate-expired-events.mjs`, 신규)
- `computeExpiryCutoffDate(now)`: UTC 기준 오늘에서 2일을 뺀 날짜 문자열 반환(이 프로젝트가
  전반적으로 쓰는 `new Date().toISOString().slice(0,10)` 관례와 동일 — Supabase Postgres도
  기본 UTC라 `CURRENT_DATE`와 같은 날짜를 가리킴).
- `deactivateExpiredEvents(client, now)`: `events` 테이블에서 `end_date < cutoff AND
  is_active = true`인 행만 `is_active = false`로 UPDATE하고, `.select('id')`로 실제로 바뀐
  행 수를 정확히 센다(추정치 아님). `end_date IS NULL`인 행은 비교 자체가 성립하지 않아
  자동으로 대상에서 제외되고, 이미 `is_active = false`인 행은 조건에 안 걸려 건드리지 않는다
  (멱등적).

### 2. `run-daily.mjs` 연동
- 기존 `CATEGORY_RULES_APPLICATION` 단계 뒤에 `DEACTIVATE_EXPIRED_EVENTS` 단계 추가(동일한
  "신규 적재 아닌 후처리" 패턴, `excludeFromVerification: true`로 배치 리포트 드롭 검증에서
  제외). "적재 시" 신규 수집분과 "이미 적재된" 기존 데이터 모두 이 매일 1회 실행으로 함께
  커버된다 — `end_date` 조건만으로 판단하므로 수집 시점/소스와 무관하게 동일 적용.
- dry-run 모드에서는 실제 UPDATE를 실행하지 않고 스킵 메시지만 남긴다.

### 3. Admin API (`/api/admin/data-grid`)
- `queryEvents`에 `is_active` 필터 파라미터 추가. 다른 tri-state 필터(`parseBoolFilter`,
  파라미터 없으면 '전체')와 다르게, 이 필터(`parseIsActiveFilter`)는 파라미터가 없거나
  `'true'`면 활성만, `'false'`면 비활성만, `'all'`이어야만 전체 조회로 필터가 해제된다 —
  "기본 조회 조건에 WHERE is_active = true 적용" 요구사항을 서버 쪽 기본값으로 강제했다.

### 4. Admin UI (`/admin/data-grid`)
- `events` 탭 전용 "✅ 활성 상태(is_active)" tri-state 토글 추가(기본값 `'true'` — 다른
  토글은 기본값이 `'all'`이라 이 토글만 다르게 설정, 필터 초기화 시에도 `'true'`로 복귀).
- 그리드 목록에 "행사기간(start~end)" 컬럼 신규 추가(events 탭 전용, 비활성 행은 뱃지 표시).
- 상세 모달(`RawDataModal`) 부제에 행사 기간(`📅 start_date ~ end_date`)과 비활성 여부를
  곧바로 노출(기존에는 "전체 컬럼" 목록에 다른 필드들과 섞여 있어 눈에 잘 안 띔).

### 5. 문서
- `docs/category-mapping-keywords-draft.md`에 "4. [0순위 우선 요청]..." 절 신규 추가(적용
  기준, 시뮬레이션 표, 코드 반영 사항 요약).

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 40 파일 414건 통과(신규 4건: `deactivate-expired-events.test.mjs` —
  컷오프 날짜 계산 2건 + 실제 비활성화 대상 판별 2건).
- `npm run build`: 성공.
- 실제 화면/API 확인(dev 서버, 읽기 전용 조회만 수행):
  - `GET /api/admin/data-grid?table=events`(파라미터 없음) → `total: 25083`(현재
    `is_active=true`인 건수와 정확히 일치, 기본 필터 적용 확인) + 응답에 `start_date`/
    `end_date` 필드 정상 포함.
  - `GET /api/admin/data-grid?table=events&is_active=all` → `total: 26404`(전체, 필터
    해제 확인).
- `node scripts/ingest/run-daily.mjs --dry-run` 재실행으로 `DEACTIVATE_EXPIRED_EVENTS`
  단계가 배치에 정상 통합됨을 확인(dry-run이라 실제 UPDATE는 실행되지 않음).

## 특이 사항
- 시뮬레이션 결과(만료 대상 81.5%)는 이 서비스가 `events` 데이터에 대해 지금까지 정기적인
  만료 정리 로직이 없었음을 보여준다. 이번 배치 반영 이후 첫 실행(다음 새벽 03:00 KST 정기
  배치)에서 약 21,523건이 한 번에 `is_active=false`로 전환될 것으로 예상된다 — 어드민
  그리드나 프론트엔드 화면에서 갑작스러운 노출 건수 감소로 보일 수 있으나, 이는 의도된
  정리이며 이미 종료된 지 2일이 넘은 행사이므로 사용자 노출 관점에서는 오히려 정확해지는
  변화다.
- 이번 작업은 `is_active` 컬럼 자체를 새로 만들지 않았다(기존에 이미 존재하던 컬럼을
  기준으로 한 신규 로직 추가일 뿐) — 별도 스키마 마이그레이션이 필요 없었다.
