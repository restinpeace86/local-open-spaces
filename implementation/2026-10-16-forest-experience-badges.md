# 유아숲체험원 전용 뱃지 구성 (todo.md 개선사항2)

## 구현 대상
`implementation/todo.md` 개선사항2 — 유아숲체험원에 상시무료개방/주차가능/
화장실유무/유모차진입/숲체험프로그램운영 5개 뱃지 구성.

## 구현 일시
2026-10-16

## 실측으로 확인한 범위 조정
5개 중 데이터로 근거를 확인한 3개만 자동 태깅했다(제3장 제5조 추측 금지 —
근거 없이 지어내지 않음):
- **가능**: 상시 무료 개방(구조적 사실, 전체 일괄), 유모차 진입(raw_data의
  "접근성" 필드로 대체 — 사용자가 예시로 든 "무장애 나눔길" 같은 서술형
  텍스트는 실제로 없음), 숲체험 프로그램 운영(이벤트 매칭).
- **불가**: 주차 가능/화장실 유무 — 실측 확인(374건 중 372건이 SMART_SEOUL_MAP
  소스) 결과 이 데이터 소스에 그런 필드/텍스트가 전혀 없다(raw_data 전체
  키 나열로 확인: 주소/접근성 2개 필드뿐). 뱃지 항목만 만들고 자동 태깅은
  하지 않는다 — 관리자가 직접 방문 확인 후 수기로 체크(어린이도서관 config의
  미태깅 4개 뱃지와 동일 패턴).

## 변경 사항
### `src/lib/admin/curation-badges.ts`
'유아숲체험원'을 `GENERIC_CATEGORY_NAMES`(보편 임시 config)에서 빼고
`FOREST_EXPERIENCE_CONFIG` 전용 config로 승격. 5개 뱃지: `always_free_open`
(상시 무료 개방), `parking`(주차 가능, 기존 키 재사용), `restroom`(화장실
있음, 신규 키), `stroller`(유모차 진입 가능, 기존 키 재사용), `forest_program`
(숲체험 프로그램 운영, 신규 키). parking/restroom만 블로그 본문 키워드
매칭용 keywordGroups를 갖는다(관리자가 블로그를 붙여넣었을 때 보조
하이라이트용 — 자동 확정 아님).

### `scripts/migrations/2026-10-16-tag-forest-experience-badges.sql`(적용 완료)
3단계 INSERT ... ON CONFLICT(spot_id) 병합 업서트(기존 수기 체크 뱃지 보존,
`2026-09-28-tag-children-library-badges.mjs`와 동일한 합집합 원칙):
1. `category_min='유아숲체험원'` 전체(374건)에 `always_free_open` 일괄 추가.
2. `raw_data->>'COT_NAME_03' = '접근성'`(동일 컬럼 번호가 테마별로 다른 의미로
   쓰여 실제로 '접근성'을 가리키는 행만 — 일부는 "조성년도" 등 엉뚱한 값이
   들어있음을 실측 확인) `AND raw_data->>'COT_VALUE_03' ~ '^(매우)?(양호|좋음)'`
   인 292건에 `stroller` 추가(보통/null/깨진 값은 근거 불충분으로 제외).
3. 제목/장소명에 "유아숲체험" 포함된 활성 이벤트(33건 존재) 중 좌표 30m
   이내(기존 `match_events_to_open_spaces` RPC와 동일 반경 기준 재사용)인
   10건에 `forest_program` 추가 — `events.space_id` 자동 연결(일반 매칭기)이
   33건 중 3건만 돼 있어(실측 확인) 그대로 믿을 수 없어 직접 반경 매칭했다.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(330개 파일 3,295개 테스트,
  curation-badges.test.tsx에 forest_experience 전용 테스트 3개 추가) /
  `npm run build` 전부 통과.
- **실제 실행**: always_free_open 374건, stroller 292건, forest_program
  10건 태깅 확인. 기존 유일한 사전 큐레이션 행("베짱이 유아숲체험원",
  기존 `parking` 뱃지 보유)이 `always_free_open` 추가 후에도 `parking`을
  그대로 유지함을 확인(합집합 병합 정상 동작, 데이터 손실 없음).

## 특이 사항
- 374건 중 373건이 이번에 처음으로 `spot_curations` 행을 갖게 됐다(이전엔
  단 1건만 있었음) — `is_active`는 DB 기본값(true)으로 생성돼 정상 노출된다.
- "주차 가능"/"화장실 유무" 2개는 badgeOptions만 존재하고 어떤 스팟도 자동
  태깅되지 않은 상태다 — 관리자가 실제 방문/조사 후 직접 체크해야 한다.
