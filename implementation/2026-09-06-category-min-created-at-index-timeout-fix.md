# 키즈/놀이시설 > 어린이놀이시설(실내) 뒤쪽 페이지 데이터 없음 — 원인/수정

## 구현 대상
사용자 지시: "내가 키즈/놀이시설의 어린이 놀이시설(실내) 했는데 .. 총 1900건
38페이지로 나와... 근데 뒤에쪽보면 33페이지부터 38페이지까지는 데이터가
아예없는데?"

## 구현 일시
2026-09-06

## 원인 (실측)
1. **총 건수(1900건) 자체가 부정확했다.** open_spaces는 `count: 'estimated'`
   (planner 통계 기반 추정치)를 쓴다(성능을 위한 기존 설계, 소폭 오차는 이미
   용인된 트레이드오프). 그런데 바로 직전에 실행한 재분류 마이그레이션
   ([[2026-09-06-daycare-kindergarten-category]] 참고, `어린이놀이시설(실내)`에서
   293건을 `어린이집`/`유치원`으로 이동)이 이 카테고리의 실제 행 수를 크게
   줄였는데, autovacuum이 아직 통계를 갱신하지 않아(`n_mod_since_analyze`가
   autoanalyze 임계치에 못 미침) 추정치가 옛 값(1900)에 머물러 있었다.
   `VACUUM (ANALYZE) open_spaces;`를 별도 실행해 추정치를 1900 → 1364로
   실측치(1482)에 근접하게 보정했다.
2. **진짜 원인은 인덱스 누락이었다.** EXPLAIN (analyze, buffers)로 실제 쿼리
   (`category_min = '어린이놀이시설(실내)' order by created_at desc limit 50`)를
   확인한 결과, open_spaces에는 `category_min` 단독 인덱스와 `category_min +
   created_at`의 "부분" 인덱스(`idx_open_spaces_category_min_created_at_unmapped`,
   `service_category_id IS NULL` 조건부, 2026-09-06 어제 추가분)만 있고, 이
   화면이 실제로 쓰는 일반 케이스(`only_unmapped`/`only_mapped` 필터가 없는
   기본 조회)에 맞는 복합 인덱스가 없었다. 플래너가 `idx_open_spaces_created_at`
   (created_at 단독)을 선택해 정렬 순서대로 훑으며 일치하지 않는 행을 최대
   68,575건 걸러내다 **18초**가 걸렸다 — admin API의 statement timeout을
   넘겨 "canceling statement due to statement timeout" 오류가 났고, 이게
   사용자 화면에는 "뒤쪽 페이지에 데이터가 아예 없음"으로 보였다(빈 데이터가
   아니라 타임아웃으로 빈 응답이 온 것).

## 변경 사항
`scripts/migrations/2026-09-06-open-spaces-category-min-created-at-general-index.sql`
(적용 완료): `create index idx_open_spaces_category_min_created_at on
open_spaces (category_min, created_at desc nulls last);` — `only_unmapped`/
`only_mapped` 여부와 무관하게 category_min으로 필터링하는 모든 open_spaces
관리자 그리드 조회에 공통으로 적용되는 일반 복합 인덱스다.

코드 변경 없음(순수 DB 인덱스 추가) — API 쿼리 로직(`src/app/api/admin/
data-grid/route.ts`)은 이미 올바르게 `category_min` 필터 + `created_at desc`
정렬을 쓰고 있었고, 문제는 인덱스 부재였다.

## 검증
- EXPLAIN (analyze, buffers) 실측: `limit 50 offset 0` 18,014ms → **11ms**.
  `limit 50 offset 1400`(뒤쪽 페이지) → 361ms로 정상 응답.
- 실제 운영 API(`https://local-open-spaces.vercel.app/api/admin/data-grid?
  table=open_spaces&category_min=어린이놀이시설(실내)&page=1&page_size=50`)
  재호출로 확인: 타임아웃 없이 200 응답, `total: 1364, rows: 50`.
- 코드 변경이 없어 `npx tsc --noEmit` / `npm run test` / `npm run build`는
  기존 기준으로 이미 통과 상태(어린이집/유치원 재분류 작업과 같은 커밋
  검증 사이클에 포함).

## 특이 사항
- `count: 'estimated'`의 잔여 오차(실측 1482건 vs 표시 1364건, 약 8% 과소)는
  이 프로젝트에서 이미 성능 목적으로 받아들인 기존 트레이드오프라 이번에는
  손대지 않았다(다른 화면의 [[2026-09-06-spot-curations-service-category-filter]]
  에서도 동일한 특성의 오차를 "기존에 이미 용인된 부정확성"으로 문서화한
  바 있다). 이번 작업의 핵심은 "데이터가 존재하는데 안 보이는" 심각한 문제
  (타임아웃)를 없앤 것이고, 추정 카운트의 소폭 오차 자체를 없애는 것은
  이번 요청 범위 밖이다.
- 재분류처럼 특정 category_min 값의 행 수를 크게 바꾸는 마이그레이션을 실행한
  뒤에는 관련 카테고리에 대해 `VACUUM (ANALYZE) open_spaces;`를 함께
  실행하는 것이 안전하다는 교훈을 얻었다 — 이번엔 그 단계를 건너뛰어 문제가
  드러났다.
