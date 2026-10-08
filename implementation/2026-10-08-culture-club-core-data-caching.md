# 문화센터 성능 — 코어 데이터 캐싱 & 로컬 필터링 + DB 인덱스/페이로드 수정

## 구현 대상
`implementation/todo.md` [개선사항 1](2026-10-08, 원격에서 받은 지시):
"공식 앱 대비 초기 로딩 및 조건 변경(필터링) 속도가 느린 문제" 진단 후
① 무거운 페이로드, ② 페이징 처리, ③ 거리순 정렬 부하, ④ DB 인덱스 부재
4가지를 점검하고, "위치/아이 나이가 바뀔 때만 서버 조회, 나머지(요일/
지점/카테고리/대상/검색어)는 캐싱된 데이터에서 즉시 로컬 필터링"하는
아키텍처로 리팩토링.

## 구현 일시
2026-10-08

## 진단 결과(Supabase Management API로 EXPLAIN ANALYZE 실측)
- **① 무거운 페이로드 — 확인됨.** `select('*')`가 이 라우트의 유일한
  소비자(culture-club-tab-view.tsx)가 전혀 읽지 않는 컬럼까지 매번
  실어 보내고 있었다(실측 grep으로 확인: `main_category_name`/
  `classroom`/`class_original_fee`/`created_at`/`updated_at`/
  `detail_fetched_at`/`round`은 화면에 전혀 안 쓰임, `is_excluded`는
  WHERE에만 필요).
- **② 페이징 — Branch-First(2026-10-07)가 이미 DB 레벨로 처리.** 지점을
  먼저 좁힌 뒤 그 지점 소속 강좌만 조회해 메모리 사용량 자체가 이미
  작다. 다만 "요일/지점/카테고리 등 2차 필터를 바꿀 때마다 이 전체
  과정(지점 좌표 조회→거리 계산→DB 쿼리)을 처음부터 다시 돈다"는 게
  진짜 문제였다 — 아래 캐싱 리팩토링으로 해결.
- **③ 거리순 정렬 — ②와 동일 원인.** 정렬 자체(최대 5,000건 메모리
  정렬)는 가볍지만, 2차 필터 하나 바꿀 때마다 매번 다시 계산되고 있었다.
- **④ DB 인덱스 — 확인됨, 실측 재현.** 위치 없는 조회 경로(brand+나이
  필터 후 schedule_start_date 정렬)를 EXPLAIN (ANALYZE, BUFFERS)로
  실측: `min_age_months`/`max_age_months`에 인덱스가 없어 전체
  23,991건을 Seq Scan(4,242ms)하고 있었다. 복합 인덱스 추가 후
  40ms로 단축(약 100배, 기존 `idx_culture_club_classes_brand_status`
  와 BitmapAnd로 조합돼 사용됨).

## 변경 사항

### DB
- `scripts/migrations/2026-10-08-culture-club-classes-age-range-index.sql`
  (적용 완료): `idx_culture_club_classes_age_range (min_age_months,
  max_age_months)` 추가.

### API(`src/app/api/culture-club/search/route.ts`)
- `SEARCH_RESULT_COLUMNS` 상수로 `select('*')` 2곳을 명시적 컬럼
  목록으로 교체 — 화면이 실제로 쓰는 컬럼만. 쿼리/필터 로직 자체는
  변경 없음(캐싱 리팩토링은 전부 클라이언트 쪽).

### 프론트엔드(`src/components/home/culture-club-tab-view.tsx`) — 캐싱 리팩토링
- `basePool`(위치/반경/아이 나이로만 재조회되는 기본 데이터 풀) +
  `visibleCount`(로컬 표시 개수) 상태로 교체. 기존 `items`/`total`/
  `page` 서버-페이지네이션 상태를 제거.
- `buildBasePoolUrl()`: brand/store_codes/days/sub_category_name/
  target_code/q를 전혀 포함하지 않고 lat/lng/radius_km/age_months만
  담아 `page_size=5000`(= route.ts의 `DISTANCE_SORT_FETCH_SAFETY_
  CEILING`과 동일)으로 한 번에 그 반경·연령의 전체 풀을 받는다. 이
  effect의 의존성은 `[center.lat, center.lng, radiusKm, activeAgeMonths]`
  뿐이다.
- `filteredItems`(useMemo): brand/지점/요일/카테고리/대상/검색어를
  `basePool`에서 순수 JS로 거른다 — route.ts의 `applyCommonFilters`와
  동일한 조건을 그대로 재현(이중 관리 비용은 있지만, 서버 쿼리와
  클라이언트 필터가 "같은 규칙"이어야 하는 건 이 설계상 불가피함을
  인지하고 있음).
- 2차 필터가 바뀌면 `visibleCount`를 PAGE_SIZE로 리셋하는 별도 effect
  (순수 로컬 상태, 네트워크 없음).
- `loadMore()`: 네트워크 호출 없이 `visibleCount`만 증가.

## 알려진 트레이드오프(문서화, 추측 아님)
- 기본 풀은 "그 반경 안에서 거리가 가까운 최대 5,000건"으로 캡된다.
  2차 필터(예: 특정 요일)를 걸었을 때 "그 요일로 필터링하면 5,001번째
  이후 더 가까운 후보가 있었을" 극단적 케이스는 놓칠 수 있다 — 기존
  코드도 동일한 5,000건 캡을 이미 갖고 있었고(이번에 새로 생긴 제약이
  아님), 실측상 반경 내 후보가 이 캡에 근접하는 경우는 거의 없어
  (예: 서울시청 10km·24개월 기준 144건) 현실적 위험은 낮다고 판단했다.

## 검증
- `npx tsc --noEmit` / `npm run test`(286개 파일 2,951개, 캐싱 전략
  자체를 직접 검증하는 신규 테스트 3개 포함 — "2차 필터 변경 시 재조회
  없음"/"반경 변경 시 재조회"/"여러 2차 필터를 연속으로 바꿔도 기본 풀
  조회는 1회") / `npm run build` 전부 통과.
- 기존 테스트 중 "요청에 brand=/store_codes=/q= 파라미터가 포함된다"고
  검증하던 3개는 더 이상 맞는 기대가 아니므로(2차 필터는 서버로 안
  나감) "서버 재조회 없이 화면에서 걸러진다"로 재작성.
- 실제 dev 서버 + 실데이터로 기본 풀 요청 1회 호출 확인: 서울시청
  기준 10km·24개월 → 144건, 1.0초, 응답 필드가 트림된 컬럼 목록과
  정확히 일치.
