# [/admin/data-grid 매일 배치 신규 데이터 모니터링]

## 요구사항
관리자가 매일 배치로 수집/업데이트되는 이벤트픽(events) 데이터를 모니터링할 수 있도록
`/admin/data-grid`에 다음을 추가:
0. 현재 구조로 "신규"/"업데이트" 건수를 구분해낼 수 있는지 확인.
1. 상단에 "오늘 반영 현황" 요약 카드.
2. [오늘 등록건 보기]/[최근 3일건 보기] 단축 필터 + 달력 기간 조회.
3. 그리드 내 `[NEW]`/`[UPDATED]` 뱃지 시각적 구분.
4. 백엔드 API `created_at`/`updated_at` 기준 파라미터 확장.

## 구현 일시
2026-08-28

## 0. 구조 확인 결과 (실측)
- `events` 테이블: `updated_at` 컬럼이 **아예 존재하지 않는다**(`created_at`만 있음).
- `open_spaces` 테이블: `updated_at` 컬럼은 존재하지만, 1,000건 샘플 전수 확인 결과 단
  한 건도 `created_at`과 값이 다르지 않았다 — 이를 실제로 갱신하는 DB 트리거나 어댑터
  코드가 없어 사실상 죽어있는 컬럼이다(항상 최초 insert 시각과 동일).
- `created_at`은 두 테이블 모두 어댑터가 upsert payload에 포함시키지 않아, 최초 삽입
  이후 재적재(upsert)되어도 값이 바뀌지 않는다 — "오늘 신규 생성" 판별에는 안전하게
  쓸 수 있음을 확인했다.
- **결론**: 현재 구조로 "신규(오늘 생성)"는 정확히 집계 가능하지만, "내용이 갱신된
  건수"는 판단할 근거가 없다. 이를 만들려면 `events`에 `updated_at` 컬럼 추가 +
  두 테이블 모두 자동 갱신 트리거 신설이 필요한데, 이는 데이터 구조 변경(제5장 제3조
  임의 판단 금지 대상)이라 사용자에게 확인 후 이번 범위에서는 **신규 집계만 구현**하고
  업데이트 집계는 보류하기로 결정했다(2026-08-28 확인).

## 변경 사항

### 백엔드
- `src/app/api/admin/data-grid/summary/route.ts`: `open_spaces_created_today`,
  `events_created_today` 지표 추가(`created_at >= 오늘 00:00 UTC`). 기존 배치 처리/개별
  실패 시 null 폴백 관례를 그대로 따른다.
- `src/app/api/admin/data-grid/route.ts`: `created_from`/`created_to`(`YYYY-MM-DD`) 쿼리
  파라미터 신규. `parseDateFilter`로 형식 검증 후 `applyCreatedAtRange`로
  `created_at >= from AND created_at < (to+1일)` 조건을 적용한다(to 날짜를 포함하도록
  다음날 미만으로 변환). `queryOpenSpaces`/`queryEvents`(SQL 쿼리 빌더 경로)와
  `queryOpenSpacesViaSourceSubset`(MINCLASSNM/SVCSTATNM용 JS 필터 경로) 양쪽 모두에
  동일하게 적용해, 어떤 경로로 조회하든 날짜 필터가 일관되게 동작하도록 했다.
  `raw_ingest_data` 탭은 `created_at`이 아니라 `fetched_at` 기준 별개 개념이라 이번
  범위에서 제외했다(기존 정렬 기준도 그대로 유지).

### 프론트엔드
- `src/components/admin/data-grid-client.tsx`:
  - `TodayBatchSummary` 컴포넌트 신규: `/api/admin/data-grid/summary`를 호출해
    "📅 오늘 신규 반영: Total N건(open_spaces N건 / events N건)"을 상단에 표시. "내용
    갱신 건수는 현재 스키마로 집계 불가"라는 안내 문구를 함께 노출해, 항상 0으로
    보이는 지표를 만들지 않고 왜 없는지 명시했다(추측 금지 — 없는 데이터를 0으로
    표시하면 "오늘 갱신이 없었다"는 오해를 줌).
  - `created_from`/`created_to` state + [오늘 등록건 보기]/[최근 3일건 보기] 버튼 +
    `<input type="date">` 기간 직접 선택(브라우저 기본 달력) + 초기화 버튼을
    `raw_ingest_data`를 제외한 두 탭에 추가. 값이 바뀌면 다른 즉시반영 필터(검색어/칩)와
    동일하게 바로 쿼리가 나간다(중분류/타겟 연령 체크박스만 예외적으로 [조회하기]
    2단계 — 날짜는 오조작 빈도가 낮아 그대로 즉시 반영).
  - 그리드 행에 `[NEW]` 뱃지 추가: `created_at`의 날짜 부분이 오늘과 같으면 제목 셀
    앞에 초록색 뱃지 표시. `[UPDATED]` 뱃지는 0번 항목의 구조적 한계로 이번에는
    구현하지 않았다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 48개 파일 517건 통과(기존 테스트 전부 유지, 회귀 없음). 이 프로젝트는
  `src/app/api/**/route.ts` API 라우트 핸들러 자체는 단위 테스트를 두지 않는 기존 관례를
  그대로 따랐다(실측 스모크 테스트로 검증).
- `npm run build`: 성공, 라우트 목록에 변화 없음(신규 페이지/라우트 없이 기존 라우트만
  확장).
- 로컬 서버(`npm run dev`) 실측:
  - `/api/admin/data-grid/summary` → `open_spaces_created_today: 0`,
    `events_created_today: 0`(2026-08-25 이후 신규 생성분 없음 — 실제 최신
    `events.created_at`이 2026-08-25인 것과 일치 확인).
  - `/api/admin/data-grid?table=events&created_from=2026-08-25&created_to=2026-08-25&is_active=all`
    → 1,269건(날짜 필터 정상 동작).
  - `/api/admin/data-grid?table=events&created_from=2020-01-01&created_to=2020-01-02` →
    0건(과거 범위 정상 배제).
  - `/api/admin/data-grid?table=open_spaces&min_class_name=...&created_from=...` (JS 필터
    경로)에도 날짜 필터가 정상 반영됨을 확인.
  - `/admin/data-grid` 페이지 200 응답 확인.

## 특이 사항
- `[UPDATED]` 뱃지와 "내용 updates 건수"는 이번 작업 범위에서 의도적으로 제외했다.
  실제로 추적하려면 `events.updated_at` 컬럼 추가와 두 테이블의 자동 갱신 트리거 신설이
  필요하며, 이는 별도 Decision/Spec 승인 후 진행해야 한다.
- 요약 카드의 "오늘"은 이 프로젝트 전역 관례(`new Date().toISOString().slice(0, 10)`,
  UTC 기준, KST 미변환)를 그대로 따랐다 — get-home-feed.ts 등 기존 코드와 일관성 유지.
