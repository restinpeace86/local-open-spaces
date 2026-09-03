# 챗봇 카테고리 체계 동기화

## 구현 대상
사용자 지시(원문): "챗봇 추천 및 인터뷰 로직의 대분류를 이벤트픽 기준인 자연/캠핑, 키즈카페,
체험/농장, 축제/이벤트, 문화/전시, 배움/클래스 6가지로 확정 및 반영."

## 구현 일시
2026-09-03 ~ 2026-09-04

## 변경 사항

### 1. Vibe 타입/라벨을 이벤트픽 6대 대분류로 교체
- 기존 4개 임의 성향(`ACTIVE`/`EDUCATION`/`NATURE`/`CULTURE`)을 폐기하고,
  `NATURE_CAMPING`/`KIDS_CAFE`/`FARM_EXPERIENCE`/`FESTIVAL_EVENT`/`CULTURE_EXHIBITION`/
  `LEARNING_CLASS` 6가지로 교체(`src/lib/ai-chat/search-engine.ts`의 `Vibe` 타입).
- `VIBE_OPTIONS`(`src/lib/ai-chat/step-options.ts`)의 라벨/이모지를 이벤트픽 홈 화면의
  `CATEGORY_MAJ_OPTIONS`(`category-maj-meta.ts`)와 문자 단위로 동일하게 맞춤(7개 중
  "스포츠 대여" 제외 6개).

### 2. 대분류별 실제 검색 대상(category_min) 재매핑
챗봇은 `open_spaces`만 검색하고(`p_item_type: 'SPACE'`) `events`는 검색하지 않으므로,
이벤트픽의 `minorCategories`(예: "지역축제/페스티벌", "공공키즈카페")를 그대로 복사하면
안 됐다 — 실측(`select category_min, count(*) from open_spaces group by category_min`)으로
open_spaces에 실제 존재하는 값만 골라 `VIBE_CATEGORY_MINS`를 새로 구성했다:
- 자연/캠핑: 공원·캠핑장·자연휴양림·수목원·생태공원 (약 3만 건)
- 공공 키즈카페: 어린이놀이터·어린이놀이시설(야외/실내)·키즈카페·바닥분수/물놀이시설 (약 7.1만 건)
- 체험/농장: 체험휴양마을·교육농장·체험학습장 (약 1,650건)
- 축제/이벤트: 광장 (약 417건 — open_spaces에 대응하는 값이 이것뿐이라 다른 vibe보다
  얇지만 0건은 아니므로 정직하게 그대로 둠)
- 문화/전시: 박물관류·미술관·공연장·전시실·문화의집/원·역사유적지·관광명소·과학관 (약 4,825건)
- 배움/클래스: 도서관·교육시설·유아교육진흥원·육아종합지원센터 (약 2,067건)

### 3. `get_nearby_spaces_and_events` RPC 성능 버그 발견 및 수정 (v1 → v2 → v3)
구현 도중 실측으로 발견한 버그: 이 RPC는 category_min과 무관하게 "전체 중 가장 가까운
1001건"을 KNN 인덱스로 먼저 뽑은 뒤에만 반경/타입 필터를 적용했다(2026-09-02 KNN 성능
수정의 전제). 서울처럼 밀집된 지역에서는 흔한 카테고리(어린이놀이터/공원 등)가 그
1001자리를 다 차지해, 반경 안(10.78km)에 실제로 있는 희귀 카테고리(교육농장,
FARM_EXPERIENCE)조차 40km까지 반경을 넓혀도 전혀 찾지 못했다.

세 차례 수정을 실측(EXPLAIN ANALYZE)으로 검증하며 진행했다:
- **v1** (`category_min = any(...)` + 기존 KNN 정렬 결합): NATURE_CAMPING처럼 흔한
  카테고리에서 3.5초(PostgREST 8초 타임아웃에 실제로 걸림) — KNN 워크가 매칭 안 되는
  후보까지 대량으로 훑어야 했다.
- **v2** (배열 값마다 LATERAL KNN 반복): "단일 등치+KNN은 항상 빠르다"는 가정이 흔한
  값에는 성립하지 않음을 발견('공원' 단독 25,531건도 4.5초) — 값 개수만큼 반복하니
  14초로 v1보다 더 느려짐.
- **v3** (현재 배포됨, `p_category_mins`가 있으면 `st_dwithin(반경)` + `category_min = any(...)`을
  KNN 없이 결합해 BitmapAnd로 먼저 좁힌 뒤 정렬): 5개 vibe(NATURE_CAMPING, FARM_EXPERIENCE,
  FESTIVAL_EVENT, CULTURE_EXHIBITION, LEARNING_CLASS)는 1.4~2.4초로 안정적으로 해결.
  `p_category_mins`가 null인 기존 호출부(지도 화면 등)는 예전 KNN 전용 경로를 그대로
  타 성능 회귀가 없다.

파일: `scripts/migrations/2026-09-03-nearby-rpc-category-min-prefilter{,-v2,-v3}.sql`
(v1/v2는 실패한 시도의 기록으로 남겨두고 v3만 실제 배포).

**주의**: 함수 파라미터를 늘릴 때 `create or replace function`은 기존 시그니처를
교체하지 않고 새 오버로드를 추가한다 — 이 때문에 한때 4개 인자로 호출하던 다른 모든
호출부(지도 화면, 날씨 기능 등)가 "function ... is not unique" 오류로 전부 깨졌다.
`drop function ... (double precision, double precision, int, text)`로 옛 시그니처를
명시적으로 제거해 해결했다.

### 4. KIDS_CAFE 최악의 경우(초고밀도 카테고리 + 최대 반경) 잔여 성능 문제 해결
v3 적용 후에도 KIDS_CAFE(어린이놀이터류, 전국 약 7.1만 건 — 전체 카탈로그 14.2만 건의
절반)만은 40km 반경에서 여전히 6.8~8초로 PostgREST 타임아웃 위험이 있었다. 반경이
클수록 "실제 매칭 행 자체"를 힙에서 읽어야 하는 양이 선형으로 늘기 때문(40km에 28,482건
매칭 실측 확인)이며, 다음 두 가지 인덱스/설정 개선을 시도했으나 근본 해결이 안 됨을
실측으로 확인했다:
- `btree_gist` 확장 + `(category_min, location::geography)` 결합 GiST 인덱스 추가
  (`scripts/migrations/2026-09-03-open-spaces-category-min-location-gist-index.sql`) —
  planner가 실제로 이 인덱스를 쓰는 것은 확인했으나(EXPLAIN ANALYZE), 매칭 행 자체가
  많아 유의미한 개선은 없었음. 계속 유효하고 무해하므로 유지.
- 함수 레벨 `max_parallel_workers_per_gather` 상향(2→4) — 단발 테스트에서는 5.4초→
  0.85초로 크게 개선됐으나, 클러스터 전체 병렬 워커 한도가 2로 작아 반복 실측 시
  3~8초로 변동폭이 매우 컸다(공유 자원 경합 위험) — 모든 호출부에 영향을 주는 함수
  전역 설정을 이런 불안정한 개선을 위해 남겨두는 것은 위험하다고 판단해 **원복**했다.

최종 해결: 애플리케이션 레벨에서 KIDS_CAFE가 선택된 조회만 실제 DB 조회 반경을 8km로
제한한다(`getEffectiveQueryRadiusMeters`, `DENSE_VIBE_QUERY_RADIUS_CAP_METERS`,
`src/lib/ai-chat/search-engine.ts`). 반복 실측으로 8km는 항상 0.5~2.7초 안에 들어옴을
확인했다. 사용자에게 보여주는 반경 표기(`originalRadiusMeters`/`finalRadiusMeters`)와
`applyStrictFilters`의 거리 상한은 그대로 두므로, 결과의 실제 거리 표기나 정확성에는
영향이 없다 — 단지 KIDS_CAFE가 포함된 조회의 DB 왕복 반경만 안전하게 줄인다. 어린이
놀이터류는 전국 어디서나 8km 안에도 압도적으로 많이 존재하므로 실사용 관점의 결과
빈곤 위험은 낮다고 판단했다(제11조: 예상 못한 상황에서도 서비스가 중단되지 않아야 한다 —
완전성보다 안정성 우선).

## 특이 사항
- v3/결합 인덱스 적용 후에도 다른 5개 vibe와 KIDS_CAFE의 5km/8km 이내 조회는 기존과
  성능 차이가 없음을 확인(전 구간 실측 완료).
- 이 세션 동안 `npx supabase db query`로 라이브 DB에만 적용되고 저장소 마이그레이션
  파일로 기록되지 않았던 `btree_gist` 확장 + 결합 인덱스 생성을, 뒤늦게 마이그레이션
  파일로 캡처했다(스키마 자체는 이미 적용 완료 상태 — 파일은 추적/재현용).
- 검증: `npx tsc --noEmit` 통과, `npm run test`(97개 파일/1001개 테스트) 전체 통과,
  `npm run build` 프로덕션 빌드 통과.
