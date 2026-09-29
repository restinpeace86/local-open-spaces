# 노출중분류 '어린이도서관' 전체 데이터 CSV 내보내기

## 구현 대상
사용자 지시(2026-09-29): "노출중분류 '어린이도서관' 관련하여 전체 데이터
csv파일로 뽑아줘 이름하고 주소, 그리고 뱃지들, 그리고 휴관일들 관련..
지금 이름은 DB에 있지만 csv가 적은 지역과 실제 주소 지역이 서로 다르다고
해서 이것들 추려서 내가 다시한번 확인할테니" — CSV 뱃지 반영 작업에서
지역 불일치로 스킵된 항목들을 사용자가 직접 재검토할 수 있도록, 노출중분류
(service_category_id) 기준 전체 대표 스팟의 명칭/주소/뱃지/정기휴무를
한 파일로 모은다.

## 변경 사항
### `scripts/export-children-library-full-data.mjs` (신규)
- 대상: `service_category_id`가 '어린이 도서관'인 대표 행 전체(요청 원문이
  "노출중분류"를 명시했으므로 category_min이 아니라 service_category_id로
  필터 — batch1/batch6 뱃지 반영이 대상으로 삼았던 범위와 정확히 일치).
- 컬럼: 명칭(standard_name → display_name → name 우선순위, 기존 화면 표시
  로직과 동일), 주소, 뱃지(`spot_curations.curation_badges` 키를 한글
  라벨로 변환 — `curation-badges.ts`의 `CHILDREN_LIBRARY_CONFIG.badgeOptions`
  와 동일한 매핑을 옮겨왔다, 제5장 제4조), 정기휴무요일(MON/TUE 등 코드를
  월/화 등 한글로 변환), 정기휴무N번째요일("2-SAT" → "매월 2번째
  토요일").
- 중복 스팟은 대표 행만 추출(기존 export-museum-name-address.mjs와 동일한
  필터 재사용).

### `scripts/export-children-library-full-data.test.mjs` (신규)
- 명칭 우선순위(standard_name → display_name → name) 검증(1).
- 뱃지/정기휴무 한글 변환 검증(1).
- 큐레이션/정기휴무 값이 없는 스팟은 해당 컬럼이 빈 값으로 남는지 검증(1).

## 실행 결과
```
node scripts/export-children-library-full-data.mjs
```
`어린이도서관_전체데이터.csv` — 128건 저장.

## 검증
- `npx vitest run scripts/export-children-library-full-data.test.mjs` — 3개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 221개 파일 2,503개) / `npm run build` 모두 통과.
- 실제 실행: CSV 파일 생성 확인(프로젝트 루트, 128행).

## 특이 사항
생성된 CSV는 실행 결과물(재생성 가능한 산출물)이라 커밋 대상에 포함하지
않았다 — 스크립트 자체만 커밋한다.
