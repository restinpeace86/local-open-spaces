# [/admin/data-grid 필터 UI 단순화]

## 구현 대상
`/admin/data-grid` 화면에서 상단 요약 집계 카드 전체와, 무료/주차/유모차/키즈친화 등 편의시설
필터(및 같은 블록의 주소·좌표/요금 NULL 체크박스, 원천 중분류 옆 접수/이용 상태 셀렉트)를
제거하고, 표준 중분류/원천 중분류/타겟 연령 3종만 남긴다.

## 구현 일시
2026-08-27

## 변경 사항 (`src/components/admin/data-grid-client.tsx`)
- 상단 요약 메트릭 카드 6종(open_spaces/events/raw_ingest_data 총 건수, 위치·주소·요금·URL
  NULL) 전체 제거 — `summary` 상태, `/api/admin/data-grid/summary` 호출 `useEffect`,
  `MetricCard` 컴포넌트, `SummaryMetrics` 타입까지 함께 제거(더 이상 쓰이지 않는 죽은 코드를
  남기지 않기 위함).
- 편의시설 필터 4종(무료/🅿️주차/👶유모차/🛝키즈친화 `TriStateToggle`) 및 같은 블록의 "주소/좌표
  NULL만 보기"/"요금 NULL만 보기" 체크박스 전체 제거 — 관련 상태(`isFree`/`hasParking`/
  `strollerAccessible`/`isKidsFriendly`/`missingLocation`/`missingFee`)와 `resetFilters`/
  fetch effect 의존성/쿼리 파라미터 빌드 코드에서도 함께 정리.
- "원천 중분류" 셀렉트 옆에 있던 "접수/이용 상태"(`svcStatNm`) 셀렉트 제거(사용자가 최종
  유지 목록에서 명시적으로 제외) — 관련 상태와 파라미터도 함께 정리.
- 최종적으로 남는 필터: 검색어, 출처(source_type/source), 카테고리, **표준 중분류
  (category_min, 체크박스)**, **원천 중분류(min_class_name, 셀렉트)**, **타겟 연령
  (target_audience, 체크박스, events 탭)**, 활성 상태(is_active, events 탭), 조회하기 버튼.
  ※ 검색어/출처/카테고리/활성 상태 필터는 이번 지시(무료/주차/유모차/키즈친화 등)에
  해당하지 않아 그대로 유지했다.
- 서버(`/api/admin/data-grid/route.ts`, `/api/admin/data-grid/summary/route.ts`)와
  `FilterOptions` 타입은 변경하지 않았다 — 화면에서만 걷어냈을 뿐 데이터 자체나 API 계약을
  바꾸는 지시가 아니었기 때문(제5장 제3조 임의 판단 금지, 요청 범위 내로 한정).

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 44 파일 473건 전체 통과(UI 전용 변경이라 회귀 없음).
- `npm run build`: 성공.
- `npm run dev` 로컬 서버로 `/admin/data-grid`(200)와 `/api/admin/data-grid?table=events`
  (200) 정상 응답 확인.
