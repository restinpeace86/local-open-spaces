# [개선사항 4] 관리자 대시보드 '오늘 반영 현황' 타임존 버그 및 집계 속도 개선

## 구현 대상
`implementation/todo.md` [개선사항 4] — "오늘 반영 현황" 건수가 특정 타이밍에 0건으로
튀는 버그, 집계 속도 저하, 프론트 로딩 상태 방어.

## 구현 일시
2026-09-15

## 원인 진단 (추정이 아니라 코드 실측 확인)
- `src/app/api/admin/data-grid/summary/route.ts`의 `todayStartIso()`가
  `new Date().toISOString().slice(0,10)`(UTC 달력 날짜)로 "오늘 00:00"을 계산했다.
  Vercel 서버리스 함수는 항상 UTC로 동작하므로, 매일 **KST 00:00~09:00 사이에는
  "오늘 UTC 자정"이 아직 오지 않아** 이미 KST로는 오늘 생성/갱신된 행이 "오늘" 집계에서
  누락된다(실측 재현: `kst-date-range.test.ts`).
- `src/app/api/admin/data-grid/route.ts`의 `applyDateRange()`도 관리자가 넘긴 날짜
  문자열(`created_from`/`created_to` 등)을 `${dateStr}T00:00:00.000Z`(UTC 자정)로
  해석해 동일한 9시간 어긋남이 있었다 — "오늘 등록건 보기"/"최근 3일건 보기" 단축 필터가
  이 함수를 공유하므로 함께 영향받는다.
- `src/components/admin/data-grid-client.tsx`의 `todayDateStr()`/`daysAgoDateStr()`도
  같은 이유(UTC 기준 계산)로 KST 새벽 시간대에 "어제" 날짜 문자열을 반환했다 — 사용자가
  지적한 "하기 리스트 조회도 오늘 건수 조회하기가... 그 후로는 0건으로 나옴"의 실제
  원인.
- 집계 속도: `events.updated_at`에 인덱스가 전혀 없었다(`pg_indexes` 조회로 확인 —
  "오늘 갱신" 카드가 매번 전체 테이블 스캔). `created_at` 계열은 이미
  `idx_open_spaces_created_at`/`idx_events_created_at`(2026-08-25)가 있어 문제없었다.

## 변경 사항
### 1) `src/lib/admin/kst-date-range.ts` (신규)
서버 전용 KST 날짜 계산 유틸. `todayKstDateString()`/`kstDateStringToUtcIso()`/
`todayStartIsoKst()`. 서버는 "한국에 있는 시각" 개념이 없어(항상 UTC) 명시적으로
9시간을 더한 뒤 UTC getter로 읽는 방식(기존 `pipeline-log.mjs`의
`formatKstTimestamp`와 동일한 패턴)을 쓴다. 단위 테스트로 KST 새벽 시간대 재현 케이스를
직접 검증했다.

### 2) 서버 쪽 적용
- `summary/route.ts`: `todayStartIso()` → `todayStartIsoKst()`.
- `data-grid/route.ts`: `applyDateRange()`가 날짜 문자열을 `kstDateStringToUtcIso()`로
  변환하도록 수정(from/to 둘 다).

### 3) 프론트엔드 적용
`data-grid-client.tsx`의 `todayDateStr()`/`daysAgoDateStr()`을 UTC(`toISOString`) 대신
브라우저 로컬 Date 컴포넌트(`getFullYear`/`getMonth`/`getDate`) 기준으로 변경했다 —
이 화면은 관리자가 실제로 한국 시간대에서 접속하는 내부 운영 도구라 브라우저 로컬
시각이 이미 KST이므로(서버와 달리 명시적 +9시간 보정이 필요 없다), 서버 유틸을 그대로
재사용하지 않고 더 단순한 로컬 포맷 함수(`toLocalDateStr`)를 추가했다. `[NEW]` 뱃지
판정(`isNewToday`)도 `created_at`을 `Date`로 파싱해 로컬 날짜로 비교하도록 함께 고쳤다
(기존에는 UTC ISO 문자열을 `.slice(0,10)`로 직접 잘라 비교해 동일한 버그가 있었다).

### 4) `idx_events_updated_at` 인덱스 추가
`scripts/migrations/2026-09-15-events-updated-at-index.sql` —
`(updated_at desc nulls last)`. 운영 DB에 직접 적용 후 `pg_indexes`로 생성 확인.

### 5) 프론트 로딩/에러 상태 방어
`TodayBatchSummary`가 개별 지표(open_spaces/events 오늘 생성, events 오늘 갱신) 중
하나라도 서버에서 null(개별 쿼리 실패, `summary/route.ts`의 job 단위 에러 격리)을
받으면 그 지표를 "0건"으로 합산하지 않고 "조회 실패"로 명시한다 — 기존에는
`(openToday ?? 0) + (eventsToday ?? 0)` 방식이라 "일부 지표 조회 실패"와 "오늘 실제로
0건"을 구분할 수 없어 사용자가 보고한 "갑자기 0으로 튀는" 증상과 동일하게 보였다.

## 왜 집계 쿼리를 GROUP BY 단일 쿼리로 재작성하지 않았는가
요청 원문은 "COUNT(*)를 여러 번 파편화하지 말고 GROUP BY로 최적화"를 제안했지만,
`summary/route.ts` 상단 주석(2026-08-25)에 이미 이 방식을 실측 비교한 기록이 있다:
커스텀 RPC(단일 패스 조건부 집계)는 PostgREST RPC 경로의 8초 statement_timeout을
넘나들며 불안정했고, 지금처럼 개별 네이티브 count 쿼리를 배치(4개씩 병렬)로 나눠
호출하는 방식이 더 빠르고 안정적이었다. 이번 조사에서도 진짜 병목은 쿼리 구조가 아니라
`events.updated_at` 인덱스 부재였다 — 인덱스를 추가하고 나면 기존 배치 방식으로 충분히
빠르다. GROUP BY RPC로 되돌리면 이미 해결됐던 timeout 문제를 다시 불러올 위험이 있어
의도적으로 손대지 않았다(제5장 제4조 기존 구조 우선).

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1704개, 신규 4개 포함), `npm run build` 모두
  통과.
- `kst-date-range.test.ts`에서 KST 새벽 2시(UTC 전날 17시) 시나리오를 직접 재현해
  기존 버그가 고쳐졌음을 단위 테스트로 증명(시간을 기다릴 필요 없이 결정적으로 검증).
- 로컬 개발 서버로 `/api/admin/data-grid/summary`, `/api/admin/data-grid?created_from=
  오늘&created_to=오늘`을 직접 호출해 오늘 날짜 기준 실제 데이터가 정상 반환됨을 확인.
- 운영 DB에 `idx_events_updated_at` 인덱스가 실제로 생성됐음을 `pg_indexes`로 확인.
