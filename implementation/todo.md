# 📋 [TODO] TourAPI 4.0 수집 파이프라인(증분 수집) 검토 및 요금 뱃지 Spec 개정 반영

## 🚨 최상위 필수 준수 원칙 (Check & Skip Guardrail)
1. **사전 `git pull` 필수**: 작업 시작 전 반드시 `git pull`을 실행하여 최신 명세(`spec/space/space-card.md`)를 로컬에 반영한 후 착수할 것.
2. **기능명세서 충돌 시 즉시 스킵 (Absolute Override)**: 
   - 작업 진행 중 기존 기능명세서(`spec/`) 및 상위 문서 규칙과 충돌이 발생하거나 미흡한 사안을 발견할 경우, **해당 코드를 임의로 변경하거나 작업을 강행하지 말고 즉시 해당 항목을 스킵(Skip)** 처리할 것.
   - 스킵된 항목은 본 `todo.md` 하단 **[Claude 작업 진행 및 검토 결과 보고서]**의 `[기존 기능명세서 충돌 및 스킵 로그]` 구역에 사유와 함께 상세히 보고할 것.
# 📋 [TODO] TourAPI 4.0 수집 파이프라인 개정 및 후속 작업 지시서

> 🚨 **[클로드 전용 작업 지시]** 
> 본 문서의 하단 **[조사 결과]**를 바탕으로, 아래 **[🎯 신규 진행 Task 목록]**의 **Task 1번부터 순차적으로 코드를 구현**하고 결과를 본 문서 하단 보고서에 작성하세요.

---

## 🎯 [신규] 차기 진행 Task 목록 (우선 구현 대상)

- [x] **[Task 1] `contentTypeId=14, 28` 지연 상세 수집 어댑터 구현**
  - 문화시설(`14`), 레포츠(`28`) 카테고리의 `is_free: null` 데이터 보완을 위한 2단계 지연 연동 어댑터 로직 작성.
  - 전체 목록 수집 시에는 N+1 방지를 위해 목록 API만 호출하고, 해당 카테고리 필터 선택 시 선별적으로 `/detailIntro2` 상세 API를 호출하여 요금(`usefee` 등) 및 상세 정보 반영.

- [x] **[Task 2] 일일 1회(한국시간 새벽 4시), Full Ingest 자동화 배치 스케줄러 구축**
  - 4개 공공 API 소스(KorService2, KorWithService2, KorPetTourService2, GoCamping)의 일일 전량 수집(Full Ingest) ➔ DB UPSERT (`ON CONFLICT DO UPDATE`) 실행 배치 스크립트 정립.

- [x] **[Task 3] 프론트엔드 공간 카드 UI 및 재태깅 뱃지 연동 검증**
  - DB 재태깅 마이그레이션으로 반영된 1,162건의 뱃지(`주차가능`, `유모차접근`, `아이동반추천`)가 프론트엔드 검색 필터 및 카드 UI에 정상 표출되는지 모니터링 및 테스트 코드 점검.

---

## 📊 [선행 조사 결과] 4대 공공 API 실측 분석 데이터 (작업 참고용)

> 개발계정 `.env.local` 키로 실제 최소 호출을 실행하여 `totalCount` 및 파라미터 반응을 실증 검증한 데이터임 (`_type=json` 응답 규격 적용).

- [x] **하기 내용 확인하고 이에 맞게 파이프라인 변경 및 확인**
   - 소스별 동기화 전략(Full Ingest, `areaBasedList2` 전량 수집 후 UPSERT)은 직전 세션 Task 2(`.github/workflows/ingest-tourapi-daily.yml`)로 표와 동일하게 반영 완료.
   - `contentTypeId` 수집 대상 중 `15`(축제행사)는 이번 표에는 실측값이 포함되어 있으나, 같은 조사 세션에서 이미 `kor-tour-adapter.mjs`/`kor-with-tour-adapter.mjs`/`kor-pet-tour-adapter.mjs` 3개 파일 주석에 "사용자 확인(2026-08-20)에 따라 contentTypeId 12/14/28만 수집"이 기록되어 있음을 확인함. `15`(축제행사)는 `spec/data/ai-rule.md` 3.2 기준 `open_spaces`가 아닌 `public.events`(시한성 이벤트) 테이블 대상 데이터라 스키마·타겟 테이블이 다른 별도 파이프라인이 필요한 사안이므로, 기존에 이미 내려진 스코프 결정을 유지하고 이번 세션에서 임의로 확장 구현하지 않음(제7장 제1조 Spec 없는 기능 추가 금지, 제3장 제4조 추측 금지).
   | API 소스명 | 일일 Quota | 전체 건수(실측) | 동기화 엔드포인트 | 날짜/증분 파라미터 실측 동작 | 최종 수집 & 증분 처리 전략 |
   | :--- | :--- | :--- | :--- | :--- | :--- |
   | **KorService2** (국문관광) | 1,000회/일 | 20,075건 | `areaBasedSyncList2` | `modifiedtime`은 **Exact Match(=)** 조건으로 동작 (YYYYMMDD 지정 시 당일 수정분만 반환, Range 검색 불가) | 하루 1회 `areaBasedList2` 전량 수집(약 20회 호출, Quota 소진율 2%) 후 DB UPSERT 유지 |
   | **KorWithService2** (무장애) | 1,000회/일 | 5,045건 | `areaBasedSyncList2` | `modifiedtime` **Exact Match(=)** 동작 (KorService2와 동일) | 하루 1회 `areaBasedList2` 전량 수집(약 5회 호출) 후 DB UPSERT 유지 |
   | **KorPetTourService2** (반려동물) | 1,000회/일 | 857건 | **`petTourSyncList2`** | `areaBasedSyncList2` 대신 전용 동기화 엔드포인트 존재 확인 | 전체 857건으로 소량이므로 단 1회 호출로 전량 재수집(`areaBasedList2`) 후 UPSERT 처리 |
   | **GoCamping** (고캠핑) | 1,000회/일 | 3,096건 | `basedSyncList` | **날짜 기반 필터링 파라미터 미지원** (`basedSyncList`에 `syncStatus`(A/U/D) 이력만 제공) | 건수가 적어(3~4회 호출로 완료) `basedList` 전량 수집 후 DB UPSERT 유지가 최선 |
   
   * **`contentTypeId` 수집 대상 확정:** `12`(관광지), `14`(문화시설), `15`(축제행사), `28`(레포츠) 4개 타입만 한정 수집 (`25` 코스, `32` 숙박, `38` 쇼핑, `39` 음식점 제외).

---

## 📋 [완료] 완료된 Task 히스토리

- [x] **`parental-badges.ts` UI 보완**: `is_free === null` 시 유료 오표기 방지 및 '뱃지 미노출(null)' 삼항 연산자 예외 처리 반영 완료.
- [x] **DB `raw_data` 기반 뱃지 재태깅 마이그레이션**: API 추가 호출 0건으로 `open_spaces` DB 내 `raw_data` 텍스트만 파싱하여 1,162건의 parental badge (`has_parking`, `stroller_accessible`, `is_kids_friendly`) 태깅 완료 (`retag-parental-badges.mjs`).
  - *PostgreSQL UPSERT 제약 회피*: Partial Payload 사용 시 `NOT NULL` 제약 위반을 방지하기 위해 `UPDATE ... WHERE external_id = ?` 구문 적용.

---

## 📝 [Claude 작업 진행 및 검토 결과 보고서] (2026-08-21 세션)

### Task 1 — `contentTypeId=14, 28` 지연 상세 수집 어댑터
- `scripts/ingest/adapters/lib/tour-api-v4-area-based-adapter.mjs`에 `fetchDetailIntro()`(detailIntro2 호출) 및 `transform()` 내 선택적 보완 로직 추가. 생성자에 `detailContentTypeIds`(기본 `[]` — 미지정 시 기존 동작과 100% 동일, 목록 API만 호출)와 `detailCallBudget`(기본 900) 옵션 신설.
- **선택적 활성화**: `kor-tour.mjs` / `kor-with-tour.mjs` / `kor-pet-tour.mjs` (KorTourAdapter/KorWithTourAdapter/KorPetTourAdapter — 모두 이 베이스를 공유) CLI에 `--with-detail` 플래그 추가. 미지정 시(=Task 2 일일 배치 포함) 기존과 동일하게 목록 API만 호출해 N+1을 피한다.
- **캐싱/배치 전략** (이전 세션 홀드 사유였던 "설계 선행 필요"를 해소): `--with-detail` 실행 시 DB(`open_spaces`, `source_type=KOR_TOUR_API_V4`)에서 대상 카테고리(`EXHIBITION_MUSEUM`/`KIDS_ACTIVITY`)이면서 `is_free IS NULL`인 기존 행만 조회해 그 `contentid`만 상세 호출 대상으로 삼는다(신규 미수집분은 이번 회차엔 건너뛰고 다음 정기 목록 수집 이후 자동으로 대상이 됨). `detailCallBudget`(기본 900)으로 1일 quota(1,000회) 내에서 안전하게 제한.
- **요금 텍스트 판별**: `scripts/ingest/lib/ai-tagging.mjs`에 `deriveIsFreeFromFeeText()` 추가 — `usefee`(14)/`usefeeleports`(28) 원문에 "무료" 포함 시 `true`, `\d+원` 가격 패턴 포함 시 `false`, 그 외(빈 문자열 등 정보 없음)는 추측 없이 `null` 유지.
- **실제 API/DB 검증**: 개발계정 키로 `detailIntro2` 실호출 → contentTypeId 14는 `usefee`, 28은 `usefeeleports` 필드명 확인. DB 조회 결과 대상 pending 건수 **6,515건**(EXHIBITION_MUSEUM+KIDS_ACTIVITY, is_free IS NULL) 확인 — quota(1,000/일) 대비 1회 배치로 전량 처리 불가하므로 `detailCallBudget`로 여러 회차에 걸쳐 점진 보완되는 설계가 타당함을 재확인. 예산 3건으로 축소한 검증 스크립트로 실제 3개 문화시설 detailIntro2 호출 → `usefee` 텍스트 기반 `is_free` 판별(무료/유료 혼합 케이스 포함) 정상 동작 확인 후 임시 검증 스크립트는 삭제함.
- *알려진 한계*: "[상설전시] 무료 / [기획전시] 유료" 처럼 무료·유료가 혼재된 원문은 "무료" 키워드가 먼저 매치되어 `true`로 판별됨(기존 코드베이스의 결정적 키워드 매칭 스타일을 그대로 따름 — OCR/AI 기반 정밀 판별은 Decision 008 5번 항목 별도 승인 필요 범위).

### Task 2 — 일일 Full Ingest 배치 스케줄러
- `.github/workflows/ingest-tourapi-daily.yml` 신규 작성: KST 04:00(=UTC 19:00 전일) 크론으로 KorService2 → KorWithService2 → KorPetTourService2 → GoCamping 4개 소스를 순차 전량 수집(Full Ingest). `workflow_dispatch` 수동 실행도 지원.
- DB UPSERT(`ON CONFLICT DO UPDATE`)는 기존 `upsertRows()`(`scripts/ingest/lib/supabase-admin.mjs`, `.upsert(rows, { onConflict: 'external_id' })`)를 그대로 재사용 — 신규 로직 불필요, 기존 구조 우선 원칙 준수.
- Task 1의 `--with-detail` 상세 보완은 실행 시간·quota 소모가 커서 이 일일 배치에는 포함하지 않고 워크플로 주석으로 별도 수동/전용 스케줄 실행을 안내함(임의로 배치에 끼워 넣지 않음).
- *미검증 사항*: GitHub Actions 실제 크론 트리거 동작은 이 세션에서 검증 불가(로컬 환경에 `gh` CLI 없음, 기존 `ingest-monthly.yml`/`ingest-daily.yml`과 동일한 한계) — Secrets 등록 여부는 기존 문서(`implementation/2026-08-20-github-actions-scheduling.md`) 참고.

### Task 3 — 프론트엔드 뱃지 연동 검증
- `src/components/region/space-grid-card.tsx`, `src/components/map/item-list-panel.tsx` 모두 `getParentalBadges()`를 통해 `has_parking`/`stroller_accessible`/`is_kids_friendly`를 이미 정상 렌더링하고 있음을 코드 확인(신규 구현 불필요 — 기존 결선 상태가 Spec과 일치).
- `src/lib/spaces/quick-filters.ts`의 `KIDS` 퀵필터는 `is_kids_friendly`를 사용 중이며, `주차가능`/`유모차가능`은 `spec/space/space-card.md`상 "보조 뱃지"로 카드 전용이며 퀵필터 대상이 아니므로(스펙에 없음) 필터 추가는 임의 구현하지 않음.
- **테스트 코드 점검 결과**: `parental-badges.ts`에 대한 테스트가 기존에 전무했음을 확인 → `src/lib/spaces/parental-badges.test.ts` 신규 작성(7개 케이스: `is_free` true/false/null 뱃지 노출·숨김, `has_parking`/`stroller_accessible`/`is_kids_friendly` true 시 뱃지 노출, false/null 시 미노출). `npm run test` 전체 통과(9/9).

### 검증 절차 (harness 제1조)
- `npx tsc --noEmit`: 통과 / `npm run test`: 통과(9/9) / `npm run build`: 통과.
- `npm run lint`: 기존에 존재하던 무관한 파일(`notification-bell.tsx`, `region-grid-view.tsx`, `use-user-location.ts`)의 `react-hooks/set-state-in-effect` 오류 8건은 이번 세션 변경분과 무관해 범위 밖으로 판단, 손대지 않음(임의 리팩터링 금지).

### 기존 기능명세서 충돌 및 스킵 로그
- 이번 세션에서 스킵된 항목 없음. Decision 008의 "코드 마이그레이션 대기" 5개 항목과 본 Task 1~3은 서로 다른 범위(카테고리 UI 매핑, 5탭 내비, 커머스 API, 신규 데이터소스, OCR/Fallback 요금 추정)로 확인되어 상충하지 않음.
