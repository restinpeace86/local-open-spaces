# [개발 종합 요청] 스팟픽 MVP 스마트 폴백, 관리자 큐레이션 및 배치 안정화 고도화 — 섹션 3(관리자 Lazy Loading) + 섹션 4(배치 안정성)

## 구현 일시
2026-08-30 ~ 2026-09-01

## 배경
`implementation/todo.md`에 등록된 대형 종합 지시서를 4개 섹션으로 나눠 순차 구현하기로
했다. 이 기록은 그중 섹션 3(관리자 Lazy Loading)/섹션 4(배치 안정성) 완료분이다.
섹션 1(프론트엔드 폴백)/섹션 2(관리자 스팟 큐레이션 탭)는 별도 기록으로 이어서 진행한다.

## 섹션 4: 외부 공공 API 배치 수집 안정성 고도화

### ① 그룹 루프 내 개별 API 격리
`TourApiV4AreaBasedAdapter`(`scripts/ingest/adapters/lib/tour-api-v4-area-based-adapter.mjs`
— KorTour/KorWithTour/KorPetTour 3개 어댑터가 공유하는 베이스)의 `fetch()`가
contentTypeId(12=관광지/14=문화시설/28=레포츠)별로 순차 `await`만 하고 있어, 하나가
타임아웃 등으로 실패하면 그 순간 `fetch()` 전체가 throw되어 나머지 contentType은
아예 시도조차 되지 않았다 — 서로 완전히 독립된 API 호출인데 그룹 루프 안에서
격리가 안 돼 있던 실제 사례다. 각 contentTypeId를 개별 try-catch로 감싸 하나가
실패해도 나머지는 계속 진행하고, 전부 실패했을 때만 예외를 던지도록 고쳤다(부분
실패는 경고 로그만 남기고 정상 반환).

### ② 30초 타임아웃 + 재시도 백오프 조정
- `scripts/ingest/lib/fetch-with-timeout.mjs` 신규: 기존에는 어댑터의 `fetch(url)`
  호출에 애플리케이션 레벨 타임아웃이 전혀 없었다(실측 확인) — AbortController로
  30초(`30000ms`) 타임아웃을 건다. `tour-api-v4-area-based-adapter.mjs`의 두
  호출부(목록/상세 조회)에 적용했다(다른 어댑터들은 이번 범위에서 다루지 못했다 —
  아래 특이 사항 참고).
- `scripts/ingest/lib/retry.mjs`: 기존 백오프(2s→6s→18s, ×3배)를 사용자가 예시로 준
  "1차 실패 후 5초, 2차 실패 후 10초"(×2배)에 맞춰 baseDelayMs=5000/배수 2로
  조정했다. 재시도 횟수(retries=3, 총 4회 시도)는 "총 3회까지 재시도"라는 문구를
  그대로 유지했다.

### ③ Stale Data 방어 — 이미 충족(코드 변경 없음)
`BaseCollectorAdapter.run()`이 이미 `upsertRowsSafeMerge()`(COALESCE 기반 안전
병합, 기존 값이 있으면 새 값이 NULL이어도 덮어쓰지 않음)만 쓰고 있고, 수집이
실패하면 `catch`에서 로그만 남기고 그대로 throw할 뿐 기존 행을 지우거나 비우는
코드 경로가 전혀 없다(하드 삭제는 `dedupe-open-spaces.mjs`의 명시적 교차출처
중복 정제 후처리 하나뿐이며 이번 요구사항과 무관). 실측 확인 후 문서화만 했다.

### ④ 관리자 수동 개별 재수집
- `run-daily.mjs`/`run-monthly.mjs`가 이미 갖고 있던 `STEPS` 배열을 export하고,
  `runSingleDailySource(sourceKey)`/`runSingleMonthlySource(sourceKey)`를 신규
  추가했다 — 전체 배치(후처리 단계 포함)를 다시 돌리지 않고 지정한 소스 하나만
  즉시 재실행한다. CLI에서 `node scripts/ingest/run-daily.mjs --only=SEOUL_YEYAK`
  형태로 바로 쓸 수 있다.
- `POST /api/admin/ingest/rerun`(`{ batch: 'daily'|'monthly', sourceKey }`) 신규
  — 위 함수를 그대로 재사용한다(cross-directory 동적 import, 실제 build로 정상
  번들됨을 확인). 라이브 서버로 잘못된 batch/누락된 sourceKey/존재하지 않는
  sourceKey 3가지 에러 케이스를 실측 검증했다.

### ⑤ Cron 정각 회피 — 이미 충족(코드 변경 없음)
`.github/workflows/ingest-daily.yml`(`cron: '7 18 * * *'` = KST 03:07)/
`ingest-monthly.yml`(`cron: '13 18 28-31 * *'` = KST 03:13)이 2026-08-28
"cron 정각 트리거 회피" 작업에서 이미 분 단위를 임의로 어긋나게 설정해뒀다 —
요구사항의 "3시 43분" 예시와 정확히 같은 숫자는 아니지만 "정각이 아닌 애매한
분"이라는 취지는 이미 충족돼 있어 추가 변경 없이 문서화만 했다.

## 섹션 3: 관리자 페이지 Lazy Loading

`src/components/admin/data-grid-client.tsx`(open_spaces/events/raw_ingest_data
공유 탭)와 `src/components/admin/curated-items-panel.tsx`(curated_items 자기완결
패널, 별도 컴포넌트라 별도 게이트 필요) 모두 마운트 시 또는 탭 전환 시 즉시
`fetch()`가 나가고 있었다. 두 곳 모두 `hasLoaded` 플래그(전자는 탭별
`Record<AdminTable, boolean>`, 후자는 단일 boolean)를 추가해 그 플래그가 true일
때만 실제 fetch effect가 실행되도록 게이트를 걸었다. 탭 전환 시 해당 탭의 플래그를
다시 false로 리셋한다(문구 "탭을 누르는 순간 자동으로 조회하지 않음"을 그대로
지키기 위해 이전 조회 결과를 캐시해두지 않음). 플래그가 false인 동안은 빈
뼈대(필터 UI + "📥 불러오기" 버튼)만 보여준다 — 기존에 이미 있던 "🔍 조회하기"
(중분류/타겟 연령 체크박스 pending→applied 반영용) 버튼과 문구가 겹치지 않도록
새 버튼은 "📥 불러오기"로 이름을 다르게 붙였다. `raw_ingest_data` 탭은 이 공통
게이트가 그대로 적용되어 "대용량 로데이터입니다. 필요할 때만 불러와 주세요"
안내와 함께 명시적 트리거를 요구한다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(71파일 725건 — `retry.test.mjs` 신규 1건(5s/10s 백오프 확인,
  가짜 타이머), `data-grid-client.test.tsx`/`curated-items-panel.test.tsx` 기존
  테스트를 "불러오기 버튼 클릭 후 검증"으로 갱신) 통과. 이 과정에서 이전
  작업(2026-08-30 이벤트 카드 비율 수정)에서 추가한 `event-card.test.tsx`의
  날짜 계산이 `toISOString().slice(0,10)`(UTC 달력 날짜)를 써서 KST 등 UTC보다
  앞선 시간대에서 로컬 자정~오전 시간대에 실제로 실패하는 잠재 결함을 이번
  실행 중 실측으로 발견해 로컬 달력 날짜 기준 헬퍼로 교체했다(부수 수정,
  구현 기록 본문 참고).
- `npm run build` 통과. `/api/admin/ingest/rerun`이 라우트 목록에 정상 등록됨을
  확인.

### 실측 검증(로컬 개발 서버)
`POST /api/admin/ingest/rerun`에 (1) 잘못된 batch 값 (2) sourceKey 누락 (3) 존재
하지 않는 sourceKey 3가지 케이스를 실제로 호출해 각각 명확한 에러 메시지를
반환함을 확인했다 — 특히 (3)에서 daily 배치의 `STEPS` 배열을 정상적으로
동적 import해 읽어온 뒤 그 목록으로 유효성 검증을 수행함을 확인해, Next.js
서버 런타임에서 `scripts/` 밖 `.mjs` 모듈을 상대 경로로 동적 import하는 것이
실제로 동작함(빌드 시점뿐 아니라 런타임에도)을 검증했다. 실제 소스 하나를
성공적으로 재수집하는 것까지는 실제 외부 API 호출/실제 DB 쓰기를 유발하므로
이번 검증 범위에서는 실행하지 않았다 — `runSingleDailySource`/
`runSingleMonthlySource`가 호출하는 `step.run()`은 기존 배치가 이미 매일/매월
검증해온 것과 완전히 같은 함수다.

## 특이 사항 — 이번 범위에서 다루지 못한 부분
- **30초 타임아웃 적용 범위**: `tour-api-v4-area-based-adapter.mjs`(3개 어댑터가
  공유) 한 곳에만 적용했다. 나머지 20여 개 개별 어댑터 파일 각각의 raw `fetch()`
  호출부에도 동일하게 적용하는 것이 이상적이나, 파일 수가 많아 이번 세션
  범위에서 전부 마치지 못했다 — `fetchWithTimeout` 유틸은 이미 공유 위치에
  있으니 후속 작업에서 `import { fetchWithTimeout } from '../lib/fetch-with-
  timeout.mjs'`로 각 어댑터의 `fetch(url)`을 교체하면 된다.
- **관리자 UI 재수집 버튼**: API 라우트(`/api/admin/ingest/rerun`)는 완성했지만,
  이를 호출하는 관리자 화면 버튼/패널은 섹션 2(관리자 스팟 큐레이션 탭) 작업과
  함께 이어서 붙일 예정이다(현재는 API만 완성, curl로 직접 호출 가능).
- Vercel 서버리스 함수 실행 시간 제한 안에서 대형 소스(수만 건 규모 페이지네이션)
  재수집이 끝나지 않을 수 있다는 점을 라우트 파일 상단 주석에 명시해뒀다 — 더
  근본적인 해결(GitHub Actions `workflow_dispatch` 위임)은 새 PAT 시크릿 발급이
  필요해 이 세션이 직접 처리할 수 없다.
