## 🚨 자율 실행 및 작업 진행 지침 (Strict Execution Rules)

1. **GitHub `todo.md` 기반 작업 수행**: 본 문서에 명시된 Task 목록과 세부 작업 지시를 최우선 가이드라인으로 삼아 순차적으로 작업을 진행한다.
2. **충돌 발생 시 즉시 스킵 (Skip on Conflict)**:
   - 기존 Spec 문서 (`spec/`), Decision Log (`project/decision-log.md`), 또는 기존 모듈과 구조적/논리적 충돌이 발생하는 경우, 절대로 무리하게 코드를 수정하지 말고 즉시 **[스킵 (보류)]** 처리한다.
3. **스킵 처리 시 필수 기록 사항**:
   - 충돌로 인해 작업을 스킵할 경우, 해당 Task 하단에 **① 상세 스킵 사유**를 명확히 기록한다.
   - 해당 Task를 재개하기 위해 **② 선행되어야 할 작업**(예: 신규 Decision 기록 필요, Spec 문서 선행 수정 필요 등)을 구체적인 가이드로 명시한다.
4. **원격 문서 갱신 반영 및 동기화**:
   - 원격 저장소의 `project/decision-log.md` (Decision 010) 및 `spec/map/spatial-search.md` (2.2 레이어 분리) 변경 내역을 확인하고, 충돌이 해소된 상태에서 안전하게 다음 Task를 진행한다.
5. **결과 업데이트 및 정합성 유지**:
   - 작업 완료 시 관련 테스트/빌드를 검증하고 `todo.md` 내 체크박스(`[x]`) 및 진행 상태를 최신화한다.

---
- [] git push

---
## [프론트엔드 UI/UX 개선] 이벤트픽/스팟픽 메인 화면 개편 (2026-08-26, docs/spec.md 개정판 기준)

- [x] 스팟픽(/nearby): (explore) 라우트 그룹에서 분리 — 도감/캘린더 탭이 더 이상 노출되지 않는 단일 지도 레이아웃으로 전환
- [x] 스팟픽: 지도 상단 1km/5km/10km Floating 반경 선택 버튼 및 연동 광역 반경 잠금해제(GridViewPrompt) 로직 전면 삭제 — 반경은 기존 기본값(5km) 고정 유지
- [x] 스팟픽: 위치 헤더가 상세 도로명주소 대신 시/군/구 단위(sigunguName)를 표기하도록 통일(이벤트픽과 동일 컴포넌트/표기 공유 확인)
- [x] 이벤트픽(홈): GNB 검색을 `/nearby`(공간 검색) 이동 대신 `events` 테이블 전용 인라인 검색으로 전환
- [x] 이벤트픽: Hero 카드 지역 정렬에 "사용자 위치가 경기도면 경기도→서울, 서울이면 서울→경기" 우선순위 추가
- [x] 이벤트픽: "당일 예약 접수중"(booking_status='접수중' 또는 SEOUL_YEYAK 원본 SVCSTATNM='접수중') 이벤트 가로 스크롤 슬라이더 신규 섹션 추가
- [스킵 (보류)] 이벤트픽/스팟픽 "카테고리 구역 원천 중분류(MINCLASSNM) 전체 노출": DB 실측 확인 결과 `MINCLASSNM`은 SEOUL_YEYAK(source='seoul_public_reservation') 원본 API에만 있는 필드로, 나머지 16개 소스(open_spaces 13개 중 12개, events 4개 중 3개)의 raw_data에는 해당 키 자체가 없다(`scripts/migrations/2026-08-25-admin-data-grid-rpcs.sql` 주석에 이미 명시된 실측 사실). 지시대로 "MINCLASSNM 전체 노출"을 문자 그대로 구현하면 전체 18만 건 중 SEOUL_YEYAK 소스분을 제외한 절대다수 행에는 카테고리가 전혀 배정되지 않아 카테고리 필터/마커 기능이 사실상 비어버린다. 이는 제3장 제5조(추측 금지)·제7장 제3조(임의 비즈니스 로직 생성 금지)에 해당하는 진짜 데이터 모델 충돌이라 임의로 대체 taxonomy를 만들지 않고 사용자 확인 대기로 스킵한다(기존 5대 UI 카테고리 그리드/테마별 필터는 그대로 유지해 기능 공백은 없음).
  - 선행 필요: 대표가 (a) MINCLASSNM 기반 카테고리를 SEOUL_YEYAK 소스에만 한정 적용하고 나머지 소스는 기존 5대 카테고리/테마 분류를 유지하는 하이브리드로 갈지, (b) 전체 소스에 새로운 통합 중분류 매핑을 정의해 Spec에 반영할지 결정 필요.
  - **해소(2026-08-26)**: 대표가 (b) 방향으로 결정 — [카테고리 정제 & 어드민 확장] Dynamic Keyword Rule Engine 작업으로 이어짐(아래).

---
## [카테고리 정제 & 어드민 확장] Dynamic Keyword Rule Engine 구축 및 /admin/data-grid 키워드 관리 (2026-08-26)

- [x] DB 마이그레이션: `category_rules` 테이블(id/category_min/keyword/is_exclude/created_at + target_table 구분자 추가) 신규 생성, `open_spaces`/`events`에 `category_min`/`category_min_source`(RAW/RULE/MANUAL) 컬럼 추가, 인덱스 추가
- [x] 초기 키워드 데이터 백필: `docs/category-mapping-keywords-draft.md` 47종 + Dry-run 리포트에서 발견한 구조적 공백 2종(놀이터/공원, city_park·localdata_playground 전용) = 49종 시드(122개 키워드 행)
- [x] SEOUL_YEYAK RAW 백필: 기존 행의 `category_min = raw_data->>'MINCLASSNM'`, `category_min_source='RAW'` 일괄 반영(open_spaces 1,284건 + events 1,625건)
- [x] 공용 규칙 엔진: ingest 파이프라인용(`scripts/ingest/lib/category-rules.mjs`)과 Admin API용(`src/lib/admin/category-rules.ts`) 각각 구현
- [x] `run-daily.mjs`/`run-monthly.mjs`: 배치 종료 시 `category_min IS NULL`인 신규 행에 규칙 엔진 적용해 `category_min_source='RULE'`로 자동 반영
- [x] `schema-mapper.mjs`/`seoul-yeyak-adapter.mjs`: 신규 수집 시점부터 SEOUL_YEYAK 행에 `category_min`(RAW) 직접 태깅
- [x] Admin API: 키워드 CRUD(`/api/admin/category-rules`), 일괄 재분류 실행(`/api/admin/category-rules/reclassify`), 개별 행 수동 수정(`/api/admin/data-grid/category-min`)
- [x] Admin UI: 중분류(category_min) 필터 + NULL 퀵 필터, RAW/RULE/MANUAL 출처 뱃지, 상세 모달 수동 수정 UI, "카테고리 키워드 규칙 관리" 모달(칩 조회/추가/삭제 + 일괄 재분류 버튼)
- [x] 검증: tsc(clean)/test(410/410)/build(성공) + 실제 재분류 1회 실행으로 동작 증빙(open_spaces 68.46%, events 35.35% 커버리지 달성) — 상세는 implementation/2026-08-26-category-rule-engine-admin.md 참고
