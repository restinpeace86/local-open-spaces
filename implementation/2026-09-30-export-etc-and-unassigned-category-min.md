# 표준중분류 '기타'/미지정(NULL) 명칭·주소 CSV 내보내기

## 구현 대상
사용자 지시(2026-09-30): "기타(대분류) >> 기타(중분류) 항목을 DB에서 데이터
읽어서 기타.csv로 추출해줘. 표준중분류가 미지정(NULL)인것도 미지정.csv로
추출해줘."

## 변경 사항
### `scripts/export-etc-and-unassigned-category-min.mjs` (신규)
- `export-museum-name-address.mjs`와 동일한 관례(명칭+주소, 중복 스팟은
  대표 행만 추출, Supabase 기본 조회 상한 1,000건 대비 페이지네이션).
- 두 카테고리를 각각 독립적으로 조회해 별도 CSV로 저장:
  - `category_min='기타'` → `기타.csv`
  - `category_min IS NULL` → `미지정.csv`

### `scripts/export-etc-and-unassigned-category-min.test.mjs` (신규)
- 두 카테고리가 각각 별도 CSV로 저장되는지 검증(1).
- display_name이 있으면 원본 name 대신 그걸 쓰는지 검증(1).
- 1,000건 초과 시 페이지네이션으로 전량 조회하는지 검증(1).

## 실행 결과
```
node scripts/export-etc-and-unassigned-category-min.mjs
```
| 파일 | 저장 건수 |
| --- | --- |
| 기타.csv | 20,465 |
| 미지정.csv | 2,164 |

## 검증
- `npx vitest run scripts/export-etc-and-unassigned-category-min.test.mjs` — 3개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 227개 파일 2,527개) / `npm run build` 모두 통과.
- 실제 실행: 2개 CSV 파일 생성 확인(프로젝트 루트, 20,465행 + 2,164행).

## 특이 사항
생성된 CSV 2개는 실행 결과물(재생성 가능한 산출물)이라 커밋 대상에
포함하지 않았다 — 스크립트 자체만 커밋한다.
