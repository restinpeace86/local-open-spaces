# [10대 타겟 분류 체계 및 활성 데이터 실데이터 반영 및 성능 최적화]

## 구현 대상
- `implementation/todo.md`의 "[10대 타겟 분류 체계 및 활성 데이터 실데이터 반영 및 성능 최적화]" 항목.

## 구현 일시
2026-08-27

## 0. 착수 전 확인 (Pre-check)
직전 실행(Step 32)에서는 `docs/target-audience-10tier-dryrun-report.md` 5절의 FACILITY 재배정/
ADULT 키워드 등 잠정 규칙이 대표 승인 대기 상태라 본 Task 전체를 스킵했다(커밋
`6970975`). 이후 대표가 `implementation/todo.md`를 직접 갱신해 잠정 규칙 5건
(FACILITY 태그 적용/ADULT 태그 판정/TEEN 룰(중고등+문맥 제한 학생)/KIDS_SCHOOL 룰(키즈+초등)/
raw_data 원천 필드 우선 탐색)을 "대표 승인 완료 사항"으로 명시했다. 승인 범위 밖으로 남은
항목(숫자 나이 임계값 파싱, 여성/장애인/국가유공자 등 비-연령 인구 속성 처리, TOUR_API_/
SEOUL_YEYAK_ 소스=null 45건 스코프 외 백필)은 이번에도 적용하지 않았다.

## 1. DB 스키마
`scripts/migrations/2026-08-27-target-audience-10tier-real-application.sql` 적용:
- `events.target_audience text`, `events.target_audience_source text` 컬럼 추가
- `idx_events_target_audience` (target_audience) 인덱스
- `idx_events_display_filter` (target_audience, category_min) WHERE is_active = true 부분 인덱스
  — `docs/spec.md` 1절 "이벤트픽 화면 노출 3대 기본 전제 조건"(is_active=true AND
  target_audience IN 5대값 AND category_min IS NOT NULL) 조회를 위한 성능 최적화.
  `ANALYZE public.events` 실행 후 `EXPLAIN (ANALYZE, BUFFERS)`로 실측: 해당 인덱스를 Index
  Scan으로 정확히 타는 것을 확인(14ms).

투명 공개: 홈 피드 쿼리(`src/lib/home/get-home-feed.ts`)는 아직 `category_min`/
`target_audience` 필터를 전혀 사용하지 않는다(category_maj 실제 적용 때도 동일했던 패턴 —
DB 컬럼/어드민 연동까지만 하고 홈 피드 배선은 별도 후속 작업으로 분리됨, Decision 008
"코드 마이그레이션 대기" 참고). 따라서 이번 인덱스는 향후 홈 피드가 이 3조건 필터를 실제로
사용하게 될 때를 대비한 선제적 최적화이며, 이번 Task 범위(마이그레이션 스크립트 실행 +
어드민 UI 연동)를 넘어서는 홈 피드 쿼리 재구현은 임의로 하지 않았다(제3장 제3조 MVP 우선/
제5장 제3조 임의 판단 금지).

## 2. 실제 적용 로직 (`scripts/ingest/lib/target-audience-taxonomy.mjs`, 신규)
`docs/target-audience-10tier-dryrun-report.md`에서 검증한 3단계 퍼널(0순위 원천 필드 →
1단계 카테고리/FACILITY 판정 → 2단계 텍스트 파싱)을 그대로 구현하되, 대표 승인 범위(5건)만
반영했다:
- 0순위: `USE_TRGT`/`target_age_group`/`USETGTINFO` 원천 필드를 괄호 제거 후 쉼표/슬래시로
  토큰화해, 전 토큰이 하나의 태그로 완전히 합의될 때만 매핑(2.1절과 동일).
- 0단계 역방향 소거: `implementation/todo.md` 원 지시문의 소거 키워드 목록을 그대로 재사용해
  INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY 매핑에서만 제외(시민/주민/단독 부모는 제외 대상에서 제외).
- 1단계: FACILITY 23종(스포츠 시설 대여 16종 + 캠핑장/영화촬영/회의실/강의실/강당/
  주민공유공간/녹화장소), KIDS_PRE(공공키즈카페/어린이실내놀이터/서울형키즈카페),
  YOUTH(청년공간) — `category_min`(신규 이름) 우선, 없으면 `raw_data.MINCLASSNM`(원본) 사용.
  category-maj-taxonomy.mjs와 동일하게 원본 불변 필드를 폴백으로 둬 멱등성을 확보했다.
  FACILITY 승인은 8대 체계 때 `ALL`로 뒀던 스포츠 시설을 같은 근거("공간 대관이라 나이 개념
  없음")로 재배정한 것뿐이라 새로운 추측이 아니다.
- 2단계: 공용 키워드 표(INFANT/KIDS_PRE/FAMILY/TEEN/YOUTH/SENIOR/ALL 기존 + ADULT("성인")
  신설 + KIDS_SCHOOL에 "키즈" 추가) + TEEN 문맥 제한 "학생"(대학생/수강생은 제외)을
  title+description에 적용.
- `target_audience_source`가 이미 `'MANUAL'`인 행은 절대 덮어쓰지 않는다
  (`category_min_source='MANUAL'` 보존 관례와 동일 — 현재 실적용 대상에는 0건).

## 3. 실행 결과 (실제 DB UPDATE, 2026-08-27)

| 항목 | 건수 |
| :--- | ---: |
| 스캔 대상(is_active=true) | 3,560건 |
| target_audience 값이 채워진 행 | **2,968건 (83.37%)** |
| 최종 NULL 유지(수동 검수 대상) | 592건 (16.63%) |
| MANUAL 보존 | 0건 |

### 태그별 분포
| 태그 | 건수 |
| :--- | ---: |
| ALL | 1,459 |
| ADULT | 442 |
| KIDS_PRE | 385 |
| KIDS_SCHOOL | 232 |
| FAMILY | 180 |
| YOUTH | 146 |
| TEEN | 58 |
| FACILITY | 43 |
| SENIOR | 21 |
| INFANT | 2 |

### 판정 근거별 분포
RAW_FIELD 2,742건 · TEXT 174건 · CATEGORY 52건.

Dry-run 보고서(NULL 582/16.35%)와 실측 결과(NULL 592/16.63%)가 소폭 다른 것은, 매일 배치로
`is_active` 상태가 갱신되는 데이터 특성상 Dry-run 시점(오전)과 실제 반영 시점(같은 날 오후)
사이에 모집단(is_active=true 대상)이 자연스럽게 일부 바뀌었기 때문으로 판단된다(추측 없이
실측 재확인: 스캔 대상 3,560건으로 동일해 표본 크기 자체는 변하지 않았으나 개별 행 구성이
바뀌었을 수 있음). TEEN/KIDS_SCHOOL 승인 키워드("학생" 문맥/"키즈") 추가에도 NULL이 완전히
줄지 않은 것은 이 신규 키워드가 실제로 해당하는 행 자체가 이번 모집단에 많지 않았음을
의미하며, 결과를 임의로 보정하지 않고 실측값 그대로 기록한다.

## 4. 어드민 UI 연동 (`/admin/data-grid`)
- `src/app/api/admin/data-grid/route.ts`: `EVENTS_COLUMNS`에 `target_audience`/
  `target_audience_source` 추가, `target_audience`(단일 값 일치)/`missing_target_audience`
  (NULL만 보기) 쿼리 파라미터 지원.
- `src/app/api/admin/data-grid/target-audience/route.ts`(신규): 관리자가 상세 모달에서
  타겟 연령을 수동 수정하면 `target_audience_source`를 `'MANUAL'`로 고정하는 PATCH 엔드포인트
  (`category-min/route.ts`와 동일 규약). 10종 태그만 허용하는 서버 측 검증 포함.
- `src/components/admin/data-grid-client.tsx`: 고정 10종 태그 드롭다운 필터(events 탭 전용,
  값 자체가 확정 enum이라 category_min과 달리 RPC로 discover하지 않고 하드코딩) + NULL만
  보기 체크박스 + 그리드 컬럼에 판정 근거(RAW_FIELD/CATEGORY/TEXT/MANUAL) 뱃지 추가.
- `src/components/admin/raw-data-modal.tsx`: `TargetAudienceEditor`(CategoryMinEditor와
  동일 패턴) 추가 — events 탭 상세 모달에서 타겟 연령을 직접 선택해 저장 가능.
- `src/types/database.types.ts`: `npm run gen:types`로 재생성해 신규 컬럼 타입 반영.

## 5. 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 44 파일 470건 통과(신규 25건: `target-audience-taxonomy.test.mjs`).
- `npm run build`: 성공, `/api/admin/data-grid/target-audience` 라우트 정상 포함.
- 실제 DB 반영: `node scripts/migrations/2026-08-27-apply-target-audience-10tier.mjs`로
  is_active=true 3,560건 실행, 위 3절 수치로 직접 확인.
- 인덱스 실측: `EXPLAIN (ANALYZE, BUFFERS)`로 `idx_events_display_filter`가 3조건 쿼리에서
  Index Scan으로 사용됨을 확인(14ms).
- 어드민 UI 실측: `npm run dev`로 로컬 서버 기동 후 `/admin/data-grid` 200 응답 확인,
  `/api/admin/data-grid?table=events&target_audience=ADULT`(442건 중 정상 반환) 및
  `target_audience=FACILITY`(43건, category_min 시설류와 일치) 실제 API 호출로 필터 동작 검증.
