# 유아숲체험원 네이버 플레이스 ID DB 반영

## 구현 대상
`metadata/유아숲체험원.csv`에서 매칭 완료된 네이버 플레이스 ID를
`open_spaces.naver_place_id` 컬럼에 반영.

## 구현 일시
2026-10-17

## 변경 사항
- `scripts/naver-kids-restaurant-agent/write-back-naver-place-id.mjs`(신규):
  CSV를 읽어 숫자 ID가 있는 행만 대상으로, `get_open_spaces_by_category_min`
  RPC로 다시 조회한 DB 행과 **명칭+위도+경도** 복합키로 매칭 후
  `open_spaces.naver_place_id`를 UPDATE.
  - 매칭 키로 명칭+위도+경도를 쓴 이유: CSV의 주소 컬럼은 이름이 정확히
    일치할 때 `search-and-match.mjs`가 네이버 주소로 보정할 수 있어
    신뢰할 수 있는 키가 아님. 명칭/위도/경도 3개는 이전 어떤 스크립트도
    건드리지 않음.
  - DB 쪽에서 같은 키(명칭+위도+경도)가 중복되는 경우는 매칭 근거 불충분으로
    제외(이론상 거의 불가능 — 좌표까지 완전히 같아야 함).
- `scripts/naver-kids-restaurant-agent/write-back-naver-place-id.test.mjs`(신규):
  4개 테스트(숫자ID만 반영/미매칭 집계/중복키 제외/DB 오류 시 failed 집계
  후 계속 진행).

## 실행 결과
```
totalCsvRows: 330, withNaverId: 139, updated: 78, unmatched: 0, failed: 61
```
DB 직접 쿼리로 재확인: `category_min='유아숲체험원'` 374건 중
`naver_place_id` 보유 78건(스크립트 보고치와 일치).

## 실패 61건의 원인 (추측이 아닌 실측 확인)
"인왕산 유아숲체험원", "봉화산 유아숲체험원" 등 56개 이름이 실제로는
서로 다른 좌표/주소를 가진 여러 DB 행(총 168건, 같은 산/공원 아래 물리적으로
다른 지점)인데, 네이버 플레이스에는 그 이름으로 단 하나의 장소만 존재한다.
이름 검색 결과 유일한(unique) 매칭이라 CSV의 각 행이 모두 같은 네이버 ID로
매칭됐고, `open_spaces_naver_place_id_key` unique 제약 때문에 먼저 시도된
행만 기록되고 나머지는 거부됐다(= 데이터가 잘못 덮어써진 것이 아니라,
DB 제약이 정상적으로 막아준 결과).

## 특이 사항
- 이 "그룹당 어느 행이 대표냐"는 임의로 판단할 수 없는 영역이라 사용자에게
  직접 확인: **현재 상태(78건만 기록, 61건은 미기록) 유지**로 결정됨 — 기존
  "중복 자동 병합/대표 선정 금지" 방침과 일치.
- CSV(330행)와 현재 DB의 `category_min='유아숲체험원'` 전체 건수(374행)
  사이에 차이가 있으나, 이는 CSV 생성 이후 시점 차이로 보이며 이번
  write-back 범위(CSV에 있는 것만 반영) 밖이라 별도 조치하지 않음.
- 검증: `npx tsc --noEmit` 통과, `npm run test -- --run` 333 파일/3328
  테스트 통과, `npm run build` 통과, 실제 DB 반영 결과 직접 쿼리로 재확인.
