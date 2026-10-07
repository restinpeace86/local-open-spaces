# 문화센터 collected_at(마지막 업데이트)이 매일 갱신되지 않던 버그 수정

## 구현 대상
사용자 지적: "왜 이마트꺼 수집일자가 10/3이지? 10/6이 아니고? 왜 수집일자가
어제꺼없어?" — 매일 자동으로 돌고 있는 이마트 배치(Windows 작업 스케줄러,
09:00)가 실제로는 정상 작동 중인데도 화면/관리자 패널에 보이는 "수집일자/
마지막 업데이트"(`collected_at`)가 최초 수집 시점(10/3 무렵)에 멈춰 있는
원인을 찾아 고친다.

## 구현 일시
2026-10-07

## 원인 (실측으로 확인)
- `emart_culture_club_classes`/`lottemart_culture_club_classes`/통합
  `culture_club_classes` 테이블 모두 `collected_at`이
  `timestamptz not null default now()`로, INSERT 시점에만 값이 매겨진다.
- 이마트 `transform()`/롯데마트 `parseRow()`는 `collected_at`을 돌려주지
  않는다(의도적으로 순수 함수로 유지돼 있었음) — 그래서 매일 도는 배치의
  upsert payload에 이 컬럼이 전혀 없었다.
- `ON CONFLICT ... DO UPDATE`는 payload에 없는 컬럼은 건드리지 않으므로,
  이미 존재하는 강좌는 가격/상태 등 다른 필드는 매일 최신으로 갱신되는데도
  `collected_at`만 최초 수집 시각에 영원히 고정돼 있었다.
- 실측(수정 전): `culture_club_classes`에서 `brand='emart'`인 6,546건 중
  `collected_at >= 10/4`인 행은 26건뿐이었다(나머지는 모두 최초 수집 시점
  그대로). `pipeline_logs`를 확인해 배치 자체는 10/6, 10/7에 정상(OK) 실행
  됐음을 함께 확인했다 — 배치가 안 돈 게 아니라, 돌아도 이 컬럼만 안 바뀐
  것이었다.
- `collected_at`은 화면(`culture-club-tab-view.tsx`의 "⏱ 마지막 업데이트")과
  관리자 패널(`culture-club-panel.tsx`)의 정렬/표시에만 쓰이고, 다른 비즈니스
  로직(신규 강좌 판별은 `fetchExistingClassIds`로 `class_id` 집합을 별도
  추적)은 이 컬럼에 의존하지 않는다 — 매번 갱신해도 안전함을 확인했다.

## 변경 사항
- `scripts/ingest/lib/culture-club-common.mjs`: `stampCollectedAt(rows,
  collectedAt)` 공유 함수 추가 — 모든 행에 같은 실행 시각을 덧붙인다.
  이마트/롯데마트가 같은 버그를 갖고 있어 공유 함수로 둔다.
- `scripts/ingest/emart-culture-club.mjs`, `scripts/ingest/lottemart-
  culture-club.mjs`: 중복 제거된 `rows`에 `stampCollectedAt()`으로 실행
  시각을 찍은 뒤 upsert한다. `toUnifiedEmartRow`/`toUnifiedLottemartRow`가
  `row.collected_at`을 그대로 복사하므로 통합 테이블에도 같은 값이 전파된다.
- `scripts/ingest/lib/culture-club-unified-row.mjs`: `collected_at`이 더는
  "항상 비어있는 키"가 아님을 반영해 상단 설명 주석을 갱신(동작 자체는
  변경 없음 — `omitUndefinedKeys`는 `created_at`/`updated_at`/
  `detail_fetched_at`을 위해 그대로 유지).

## 검증
- `npx tsc --noEmit` / `npm run test`(279개 파일 2,885개) / `npm run build`
  전부 통과.
- `node scripts/ingest/emart-culture-club.mjs`(실제 실행, dry-run 아님)로
  지금 당장 데이터를 갱신했다 — 실행 전후로 실측: `brand='emart'` 6,563건
  중 오늘(10/7) `collected_at`을 가진 행이 5,808건으로 늘었고, 이는 이번
  실행이 실제로 수신한 건수(접수중 5,099 + 정원마감 709 = 5,808)와 정확히
  일치한다. 나머지 755건은 이 배치가 원래 수집 대상으로 삼지 않는 상태
  (접수마감 등)라 그대로 과거 값을 유지하는 게 맞다.
- 롯데마트는 같은 코드 수정을 적용했지만(지점×대상×학기 360개 조합이라
  실행이 훨씬 오래 걸림), 지금 당장 수동으로 돌리지는 않았다 — 기존
  작업 스케줄러의 다음 정기 실행부터 자동으로 적용된다.
