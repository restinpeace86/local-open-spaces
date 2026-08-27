# [1단계 중분류(Category Min) 본 데이터 UPDATE 마이그레이션 실행] 결과

- **작성일**: 2026-08-27
- **성격**: 실제 DB UPDATE 반영 (Dry-run 아님).
- **실행 스크립트**: `scripts/migrations/category_min_update.mjs` (`node scripts/migrations/category_min_update.mjs`)
- **대상**: `public.events`의 `is_active = true`이면서 `category_min IS NULL`인 행만 (기존
  RAW/RULE/MANUAL로 채워진 행은 `.is('category_min', null)` 가드로 절대 덮어쓰지 않음).
- **전제**: `docs/category-mid-rawfield-dryrun-report.md`(2026-08-27 Dry-run) 6절 대표 승인
  요청 3건에 대해 `implementation/todo.md`에 대표 승인 완료로 기재된 내용을 그대로 반영했다.

## 반영 내역

| 승인 항목 | 대상 소스 | 스캔 | 반영 | 잔여(NULL 유지) |
| :--- | :--- | ---: | ---: | ---: |
| 1. `MINCLASSNM` 0순위 RAW 재적용 | `seoul_public_reservation` | 1,096건 | 1,096건 (100%) | 0건 |
| 2. `CODENAME` 제안 매핑 확정 | `seoul_public_culture` | 278건 | 270건 | 8건(`CODENAME='기타'`, 매핑표에 없어 의도적으로 NULL 유지) |
| 3. 매핑 보류 확정 | `gg_public` / `tourapi_4.0` | - | 변경 없음 | 36건 / 9건 |

두 항목 모두 `docs/category-mid-rawfield-dryrun-report.md`의 시뮬레이션 예측 수치(1,096건,
270건)와 실제 반영 건수가 정확히 일치함을 확인했다.

## 검증

- `is_active = true` 전체(3,560건) 기준 `category_min` NULL 잔여: **93건 (2.61%)** —
  Dry-run 리포트 5절 예측치(93건, 2.61%)와 정확히 일치.
- `npx tsc --noEmit`: 통과 (오류 없음)
- `npm run test`: 44 test files / 470 tests 전체 통과
- `npm run build`: 프로덕션 빌드 성공

## 범위 밖 (임의 반영하지 않음)

- `gg_public`(`CATEGORY_NM` 4종, 정보량 부족)과 `tourapi_4.0`(`cat1~3`/`lclsSystm1~3`, 공식
  코드-한글명 매핑표 미확보)은 Dry-run 리포트의 "보류" 권고 그대로 이번에도 매핑을 시도하지
  않았다. 향후 진행 시 TourAPI 공식 분류 코드표 확보가 선행되어야 한다.
- `source=(null)` 잔존 행(raw_data 자체 없음)은 구조적으로 원천 필드 매핑이 불가능해 대상에서
  제외했다(기존 known gap).
