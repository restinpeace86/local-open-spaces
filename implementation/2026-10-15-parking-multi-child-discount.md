# 주차장 다자녀 할인 혜택 연동 (todo.md 개선사항3)

## 구현 대상
`implementation/todo.md` 개선사항3 — 경기도/서울시 다자녀 할인 CSV를
`parking_metadata`에 매칭해 `is_multi_child_discount`/`discount_info`를
채운다. 별도 테이블 대신 기존 컬럼을 쓴 설계 변경 근거는
`project/decision-log.md` Decision 035 참고.

## 구현 일시
2026-10-15

## 변경 사항
### `scripts/migrations/2026-10-15-parking-multi-child-discount-matching.sql`(적용 완료)
`search_parking_metadata_near(lng, lat, radius)` RPC 신규 — 외부 좌표 1점
기준 `parking_metadata` 반경검색(개선사항1의 `find_busul_parking_
candidates`는 양쪽 테이블 조인이라 이 용도에 안 맞아 별도로 만듦).

### `scripts/ingest/parking-multi-child-discount.mjs` + 테스트(9개, 신규)
- 경기도 CSV: `사용처구분='공영주차장' & 대상자명='다자녀가정'`로 필터,
  `위경도좌표`(WKT `POINT(lng lat)`) 직접 파싱 → 바로 반경 매칭.
- 서울시 CSV: `업종='공영주차장'`로 필터, 좌표가 없어 VWorld 지오코딩
  선행(개선사항1과 동일 패턴) → 반경 매칭.
- 매칭: 반경 50m 내 후보 중 이름 유사도(`match-parking-to-spots.mjs`의
  `nameSimilarity` 재사용) 0.5 이상 중 최선 하나.
- 매칭된 `parking_metadata` 행에 `is_multi_child_discount=true` +
  `discount_info`(할인율+기타사항, 또는 서울시 지원혜택 원문) 갱신.
- `pipeline-agent-registry.mjs`에 `PARKING_MULTI_CHILD_DISCOUNT` 등록,
  `package.json`에 `ingest:parking-multi-child-discount` 추가.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(319개 파일 3,224개 테스트) /
  `npm run build` 전부 통과.
- **실제 실행**: 경기도 10,503건 → 필터 1,213건(좌표 전부 있음), 서울시
  3,007건 → 필터 219건(지오코딩 184건 성공) → 총 712건 매칭/갱신.
- **DB 직접 재조회**로 `is_multi_child_discount=true` 행의 `discount_info`
  실제 내용(예: "본인/50%") 확인.

## 특이 사항
- **UI 변경 없음**: 개선사항1에서 만든 `ParkingCard`가 이미 `is_multi_
  child_discount`/`discount_info`를 요약(🟢 다자녀 할인)과 상세(펼치면
  전문)로 보여주고 있어, todo.md가 요구한 "뱃지 누르면 상세 확인" UX가
  추가 작업 없이 이미 충족돼 있었다.
- 서울시 219건 중 35건은 VWorld 지오코딩 실패로 매칭 시도에서 제외됐다
  (주소 형식이 모호한 경우 등으로 추정, 개별 조사는 이번 범위 밖).
