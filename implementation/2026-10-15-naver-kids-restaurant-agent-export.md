# 네이버 플레이스 키즈친화 스크래핑 에이전트 1단계: 식당 CSV 추출 (todo.md 개선사항4 선행작업)

## 구현 대상
`implementation/todo.md` 개선사항4 선행작업 — "나드리픽 앱에서 식당명 및
주소에 대하여 추출하여 csv파일로 특정경로에 넣음." 표준중분류(category_min)
='식당' 데이터를 `metadata/식당.csv`(명칭/주소/위도/경도)로 추출한다.
"표준 중분류 기타>>식당"의 실제 의미는 `project/decision-log.md` Decision
036 참고.

## 구현 일시
2026-10-15

## 변경 사항
### `scripts/migrations/2026-10-15-get-open-spaces-by-category-min-rpc.sql`(적용 완료)
`get_open_spaces_by_category_min(p_category_min text)` RPC 신규 —
`get_spots_by_service_category`(2026-09-08)와 동일 패턴(standard_name 우선,
`st_x`/`st_y`로 좌표 추출, `group_id is null or is_dedup_representative`로
중복 대표만)을 `category_min` 기준으로 재사용.

### `scripts/naver-kids-restaurant-agent/`(신규 디렉토리)
이 디렉토리 전체가 todo.md 개선사항4 원문("나드리픽 로직과 별도로 독립적으로
돌아갈 수 있도록")에 따라 `src/`를 import하지 않는다. 앞으로 이어질 2~6단계
(검색/매칭/스크래핑/LLM분석)도 이 디렉토리 안에 계속 추가한다.
- `export-restaurants.mjs` + 테스트(4개): `get_open_spaces_by_category_min`
  RPC를 호출해 명칭/주소/위도/경도 4컬럼 CSV를 쓴다.
- `lib/csv.mjs`: UTF-8 CSV 읽기(csv-parse 재사용)/쓰기(RFC4180 최소 구현
  — 쉼표/겹따옴표 포함 필드 안전 처리) 헬퍼. 이후 단계가 같은 CSV를
  읽고 컬럼을 추가해 다시 쓸 때 공용으로 쓴다.

### `implementation/todo.md`
개선사항4 선행작업 줄에 완료 표시 추가.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(320개 파일 3,228개 테스트) /
  `npm run build` 전부 통과.
- **실제 실행**: `metadata/식당.csv`에 1,594건 저장 확인(Node로 직접 읽어
  한글 인코딩 정상 확인, 쉼표 포함 주소("...로 1, 2층")가 겹따옴표로 올바르게
  감싸졌는지 확인).

## 특이 사항
- **실측 버그 발견/수정**: `get_open_spaces_by_category_min` RPC 호출도
  `get_spots_by_service_category`와 동일하게 PostgREST 기본 max-rows
  (1,000)에 걸려, `.range()` 없이 호출하면 1,612건 중 1,000건만 조용히
  잘렸다. `getSpotsByServiceCategory`(get-nearby.ts)와 동일한 페이지네이션
  루프를 적용해 수정했다(최종 1,594건 = 1,612건 − 대표 아닌 중복 18건).
- **Windows 경로 버그 발견/수정**: `import.meta.url === file://${process.argv[1]}`
  비교가 Windows에서 백슬래시/슬래시 불일치로 항상 false가 돼(에러 없이
  조용히) 스크립트를 직접 실행해도 `run()`이 호출되지 않았다 — 이 프로젝트의
  기존 관례(`pathToFileURL(process.argv[1]).href`, 예:
  `scripts/export-museum-name-address.mjs`)로 교체해 해결했다.
- 2~6단계(네이버 검색/주소 교차검증/LLM 보조 검색어/상세·리뷰 스크래핑/
  키즈친화 속성 추출)는 이어서 구현 중이다.
