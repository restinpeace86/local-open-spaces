# events 안 쓰이는 인덱스 2개 삭제

## 구현 대상
사용자 지시(2026-09-13):
> 안쓰이는 인덱스에 대하여 정리하게 인덱스의 여태까지 사용 비율같은거랑
> 어디에 사용되는지를 조사해서 알려줘

→ 조사 결과 보고 후 사용자 승인:
> 어 그래 2개 삭제해줘

## 구현 일시
2026-09-13

## 조사(Supabase Management API 실측 + 코드 전수 조사)
`events` 테이블의 인덱스 21개 전부를 `pg_stat_user_indexes`로 조회해 크기/
idx_scan/idx_tup_read/idx_tup_fetch를 확인하고, 사용량이 낮은 인덱스마다
해당 컬럼이 `src/lib`/`src/app/api` 전체에서 실제로 어떻게 쓰이는지
grep으로 대조했다. 전체 결과는 사용자에게 표로 보고했고(🔴 삭제 유력/
🟡 애매/🟢 최근 추가/✅ 확실히 사용 중 4단계 분류), 사용자는 🔴(삭제 유력)
2건만 승인했다.

## 삭제한 인덱스

### 1. `idx_events_description_trgm`
- 29MB(21개 인덱스 중 최대), `idx_scan=2`, `idx_tup_read=4`, `idx_tup_fetch=0`.
- `get-home-feed.ts`가 title/description/venue_name을 `.or(ilike)`로 함께
  검색하지만, 실측상 planner가 이 인덱스를 사실상 선택하지 않는다(같은
  방식으로 만들어진 title_trgm=145회/venue_name_trgm=127회와 뚜렷이 대비).
- events.updated_at 자동 갱신 트리거(2026-09-12)와 맞물려 하루 여러 번
  벌어지는 대량 재적재 upsert마다 이 29MB짜리 인덱스도 함께 유지비용을
  냈다 — 2026-09-13 events upsert statement timeout 진단
  (`implementation/2026-09-13-events-upsert-timeout-fix.md`)에서 이미 원인
  중 하나로 지목된 인덱스다.

### 2. `idx_events_category_maj`
- 672KB, `idx_scan=10`.
- `category_maj` 컬럼은 `src/app/api/admin/data-grid/migrate-to-event/route.ts`
  (INSERT)와 관리자 그리드 표시(SELECT)에만 쓰인다 — `.eq('category_maj', ...)`/
  `.in('category_maj', ...)` 같은 필터·정렬 조건으로 쓰이는 곳이 코드 전체에
  단 한 곳도 없음을 확인했다(`/api/events/{ongoing,today,reservation-open}`가
  받는 `category_maj` 쿼리 파라미터는 로컬 상수 테이블에서 `category_min`
  목록으로 변환한 뒤 그 `category_min`으로만 DB를 필터한다 — `category_maj`
  컬럼 자체는 필터에 전혀 안 쓰임). 10회의 idx_scan은 상시 애플리케이션
  경로가 아닌 산발적 조회로 추정된다.

## 적용
`scripts/migrations/2026-09-13-drop-unused-events-indexes.sql` 작성 →
Supabase Management API(`scripts/tmp-run-sql-full.mjs`)로 프로덕션에 직접
적용 → `pg_indexes`를 재조회해 두 인덱스가 실제로 사라졌음을 확인했다.
`CONCURRENTLY`는 쓰지 않았다 — 3.3만 행 규모의 테이블에서 DROP INDEX 자체는
짧은 락으로 즉시 끝나는 가벼운 작업이라, 트랜잭션 밖에서만 허용되는
`CONCURRENTLY`로 복잡도를 늘릴 필요가 없다고 판단했다. 되돌리기용 원래 정의도
마이그레이션 파일 주석에 남겨뒀다(값 손실 없이 재생성 가능).

## 검증
- `npx tsc --noEmit`/`npm run test -- --run`(142 파일, 1674건)/`npm run
  build`: 전부 통과 — 인덱스는 애플리케이션 코드에서 직접 참조하지 않는
  순수 스키마 요소라 애플리케이션 코드 변경은 없었고, 회귀가 없음을
  재확인하는 차원에서 실행했다.
- `pg_indexes` 재조회로 두 인덱스가 삭제됐음을 직접 확인했다.

## 특이 사항
- 함께 보고했던 "애매한 후보"(`idx_events_target_audience`,
  `idx_events_reservation`)는 사용자가 승인하지 않아 그대로 남겨뒀다 —
  `idx_events_target_audience`는 코드에서 실제로 자주 필터 조건에 쓰이지만
  더 구체적인 복합 인덱스(`idx_events_display_filter`)에 가려져 단독으로는
  적게 선택되는 것으로 보이고, `idx_events_reservation`은 `.or()` 조건 안에
  있어 planner가 잘 안 고르는 것으로 보인다 — 둘 다 삭제해도 안전한지
  확신이 덜해 이번엔 손대지 않았다(제3장 제5조 추측 금지, 사용자도 이
  둘까지 삭제해 달라고 명시하지 않음).
