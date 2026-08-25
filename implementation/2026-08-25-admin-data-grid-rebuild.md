# /admin/data-grid 데이터 검증 전용 어드민 그리드 개편

## 구현 대상
- 사용자 지시([신규 구현/개편], 2026-08-25): Decision 017 및 RAW/Service ETL로 DB에 전수
  적재된 원천 데이터(events, open_spaces, raw_ingest_data)를 관리자가 웹 화면에서 건수 집계/
  카테고리 필터링/NULL값 스캐닝할 수 있는 `/admin/data-grid` 페이지로 개편
- 요약 메트릭 카드, 3개 탭(open_spaces/events/raw_ingest_data), 필터/검색 바, 페이지 크기
  선택, 상세 Drawer/Modal

## 구현 일시
2026-08-25

## 변경 사항

### DB
- `scripts/migrations/2026-08-25-admin-data-grid-rpcs.sql`: `get_open_spaces_category_options`
  (source_type/category), `get_open_spaces_seoul_yeyak_options`(source/MINCLASSNM/SVCSTATNM,
  `source IS NOT NULL`로 사전 필터), `get_events_filter_options`, `get_raw_ingest_data_filter_options`
  4개 RPC 신설(`get_sigungu_options()`와 동일한 DISTINCT-목록 RPC 패턴 재사용).
- `scripts/migrations/2026-08-25-admin-data-grid-perf-indexes.sql`: `idx_open_spaces_created_at`/
  `idx_events_created_at`(`created_at DESC NULLS LAST`) 인덱스 신설 — 상세 원인은 아래 "실측
  중 발견한 인프라 문제" 참고.
- `npm run gen:types`로 `src/types/database.types.ts` 재생성(신규 RPC/컬럼 반영).

### 백엔드
- `src/app/api/admin/data-grid/route.ts` 전면 재작성: `table` 쿼리 파라미터로 open_spaces/
  events/raw_ingest_data 3개 테이블 분기. 테이블별 SELECT 컬럼/검색 대상 컬럼/필터를 개별
  정의(추상화 대신 명시적 분기 — 기존 코드 스타일 유지). 페이지 크기는 50/100/200만 허용.
  `min_class_name`/`svc_stat_nm`(raw_data JSONB 경로) 필터가 걸리면 open_spaces는 특수 경로로
  처리 — 아래 성능 이슈 참고.
- `src/app/api/admin/data-grid/summary/route.ts`(신규): 요약 메트릭 10종을 네이티브
  `count:'exact', head:true` 쿼리로 개별 조회(4개씩 배치). 개별 쿼리 실패는 그 지표만 `null`로
  응답해(요약 패널에 "집계 지연" 표시) 전체 페이지가 죽지 않게 한다(제5장 제11조 무중단 원칙).
- `src/app/admin/data-grid/page.tsx`: 4개 필터-옵션 RPC를 병렬 호출하되 개별 실패를 허용(빈
  배열로 대체) — 하나가 실패해도 페이지 전체가 에러 화면으로 떨어지지 않는다.

### 프론트엔드
- `src/components/admin/data-grid-client.tsx` 전면 재작성: 3개 탭, 요약 메트릭 카드(클라이언트
  비동기 로드), 탭별 필터(출처 source_type/source, 카테고리, 원천 중분류 MINCLASSNM 드롭다운,
  접수상태 SVCSTATNM 드롭다운, 4개 tri-state 뱃지, NULL 퀵 체크박스 2종), 통합 검색, 50/100/200
  페이지 크기 선택기, 행 클릭 시 상세 모달.
- `src/components/admin/raw-data-modal.tsx` 일반화: open_spaces/events/raw_ingest_data 3개
  행 형태에 맞춰 제목/부제/원문 JSON 필드를 분기하고, 구조화된 전체 컬럼 목록도 함께 표시(기존
  raw_data만 보여주던 것에서 확장).

## 실측 중 발견한 인프라 문제 (전부 그 자리에서 해결)

1. **커스텀 RPC 함수가 네이티브 PostgREST 카운트보다 훨씬 느리고 불안정함**: 처음에는
   요약 메트릭도 `get_admin_data_grid_summary()` RPC(단일 패스 조건부 집계)로 만들었으나,
   실측 결과 open_spaces(12만 건) 대상 호출이 4.8초~8초 초과(타임아웃) 사이를 반복적으로
   오갔다(PostgREST RPC 경로의 8초 `statement_timeout` 확인). 반면 동일 조건의 네이티브
   `.select('*', {count:'exact', head:true}).is(...)` 호출은 개별 0.1~1.5초로 훨씬 빠르고
   안정적이었다. 커스텀 RPC를 폐기하고 요약 메트릭은 네이티브 쿼리 여러 개로 재구현했다.
2. **`raw_data->>'MINCLASSNM'` 등 JSONB 경로 필터가 옵티마이저를 오도함**: open_spaces에
   `idx_open_spaces_source` 인덱스가 있음에도, `WHERE source IS NOT NULL AND raw_data->>'...'`
   조합 조건에서는 옵티마이저가 인덱스 대신 전체 시퀀셜 스캔을 선택해 8초 타임아웃을 넘겼다
   (EXPLAIN ANALYZE로 확인). MINCLASSNM/SVCSTATNM 필터가 걸리면 `source IS NOT NULL`로만 먼저
   좁힌 작은 결과 집합(현재 ~1,300건)을 통째로 가져와 나머지 모든 필터/검색/페이지네이션을
   애플리케이션 코드(Node)에서 처리하도록 우회했다.
3. **`source` 컬럼의 planner 통계가 완전히 잘못됨(근본 원인, 해결)**: 위 2번 우회 경로 자체도
   처음엔 9초까지 걸려 타임아웃했다 — EXPLAIN ANALYZE로 확인한 결과, `source IS NOT NULL`의
   추정 매칭 행 수가 119,812건(실제는 1,282건)으로 완전히 틀려 있었다. `source` 컬럼을 오늘
   이 세션에서 막 추가·백필했는데 `ANALYZE`가 그 이후 한 번도 돌지 않아 통계가 없었던 것이
   원인이었다. `ANALYZE public.open_spaces;` 실행 한 번으로 동일 쿼리가 9.3초 → 19ms로
   개선됐다(약 500배).
4. **`ORDER BY created_at DESC NULLS LAST`가 인덱스를 전혀 못 씀(근본 원인, 해결)**: 관리자
   그리드의 기본 정렬(최신순)이 매번 12만 건 전체를 정렬해야 해서(Gather Merge + Sort, 실측
   3.9~4.3초) 메인 그리드 조회 자체가 간헐적으로 타임아웃했다. `CREATE INDEX ... (created_at
   DESC)`만으로는 기본 널 정렬이 `NULLS FIRST`가 되어 쿼리의 `NULLS LAST`와 어긋나 인덱스가
   전혀 선택되지 않았다 — 인덱스 정의에 `NULLS LAST`까지 명시해야 정확히 일치해 Index Scan으로
   즉시 처리됨을 확인했다(실측: 4.3초 → 5ms, 약 800배).

이 4가지는 전부 `/admin/data-grid` 개편 작업 중 실측으로 처음 발견한 것들이며, 3·4번은 근본
원인을 고쳐 완전히 해결했고, 1·2번은 애플리케이션 레벨 우회로 안정적으로 동작하게 만들었다.

## 검증 결과 (실제 API/DB 호출, 개발 서버 기동 후)
- `npx tsc --noEmit` / `npm run test`(36파일 384건) / `npm run build`: 모두 통과.
- `GET /admin/data-grid`: 200, 필터 옵션 정상 렌더(3.2~3.4초, 4개 RPC 병렬 호출 포함).
- `GET /api/admin/data-grid?table=open_spaces`: 200, 1.7초(수정 전에는 500 타임아웃).
- `GET /api/admin/data-grid?table=events` / `table=raw_ingest_data`: 200, 각각 0.4초 내외.
- `GET /api/admin/data-grid?table=open_spaces&min_class_name=체육관`: 200, 실제 매칭 행 반환
  (수정 전에는 500 타임아웃).
- `is_free=true` 필터: 반환된 행 전부 `is_free === true` 확인. 페이지네이션(2페이지) 정상.
- `GET /api/admin/data-grid/summary`: 200, 8건 중 6건 실제 숫자 반환, 2건(주소/URL NULL 진단
  — 이 두 조건만 매칭 비율이 70~92%로 대다수 행에 해당해 인덱스 효과가 없음)은 여전히 간헐적
  타임아웃하며 `null`로 정상 폴백(UI에 "집계 지연" 표시, 페이지 전체는 정상 동작) — 아래
  특이사항 참고.

## 특이 사항
- **요약 메트릭 2종(주소 NULL/URL NULL)은 인프라 한계로 완전히 안정화하지 못했다**: 이
  두 진단은 매칭 행 비율이 70~92%로 대다수라 인덱스로 선택도를 개선할 수 없다(부분 인덱스가
  거의 전체 테이블 크기가 되어 효과가 없음). PostgREST RPC/REST 경로의 8초 `statement_timeout`
  경계에 걸쳐 있어 간헐적으로 실패하지만, `summary/route.ts`가 개별 쿼리 실패를 `null`로
  폴백 처리해 페이지/다른 지표에는 영향이 없다. 완전히 해결하려면 별도의 구체화 뷰(materialized
  view)나 정기 배치 집계가 필요해 이번 범위를 벗어난다고 판단해 보류했다.
- **사용자 지시문의 `use_pay`/`payatnm`/`svcurl` 필드명은 원천 API 필드명이라 실제 DB 컬럼과
  다르다**: 요금은 `is_free`(boolean), 예약/정보 URL은 `reservation_url`(events)/`info_url`
  (open_spaces) 컬럼으로 매핑돼 저장되므로 이 실제 컬럼 기준으로 구현했다(신규 컬럼 생성 없음).
- **"원천 중분류"/"접수상태" 필터는 open_spaces/events 모두 raw_data JSONB에서 추출**하며,
  현재는 SEOUL_YEYAK(source가 채워진) 데이터에만 실질적으로 값이 있다. 다른 소스가 Decision
  017 패턴으로 편입되면(아직 미착수) 자동으로 필터 옵션에 추가된다.
- **개발 서버(`npm run dev`)로 실제 화면 렌더 확인은 curl 기반 API/HTML 응답 검증으로
  수행**했다(이 환경에는 브라우저 자동화 도구가 없음) — 페이지가 200을 반환하고 에러 텍스트가
  없음, 각 탭의 API가 올바른 스키마의 JSON을 반환함을 확인했으나 실제 브라우저 렌더링/클릭
  상호작용(모달 열기 등)은 육안으로 재확인하지 못했다.
