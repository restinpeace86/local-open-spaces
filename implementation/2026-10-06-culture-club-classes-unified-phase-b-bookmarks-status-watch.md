# 문화센터 통합 테이블 — Phase B 1부 (찜 FK 통합 + 상태감시 통합)

## 구현 대상
`project/decision-log.md` Decision 028의 2단계: `user_bookmarks`의
`emart_class_id`/`lottemart_class_id`를 `culture_club_class_id` 하나로
통합하고, 두 상태감시 스크립트를 브랜드 분기형 단일 스크립트로 재구성한다.
사용자 지시: "찜이 됐는데 이게 어떤거냐 이벤트냐 이마트냐 롯데마트냐를
구분하고 그에 따라 재확인로직이 분기해가야겠지?" — 정확히 이 구조로
구현했다.

## 사전 검토(실측)
- 백필 전 실측 확인: `user_bookmarks`에 `emart_class_id`/`lottemart_class_id`
  값이 있는 행이 **0건**이었다(기능이 막 나온 시점, 실사용자 데이터 없음) —
  데이터 마이그레이션 리스크가 없음을 확인한 뒤 진행했다.
- 그래서 CHECK 제약 변경/컬럼 정리까지 한 번에 진행할 수 있었지만, **배포
  순서 때문에 일부러 나누었다**: 지금 라이브(Vercel)에 떠 있는 코드는 아직
  구 컬럼을 참조한다 — 이 커밋을 푸시해 새 코드가 배포되기 전에 구 컬럼을
  DB에서 지우면, 배포 간극 동안 구 코드가 모든 찜 작업에서 에러를 낸다.
  그래서 **컬럼 추가(이미 적용)와 코드 전환(이 커밋)을 먼저 배포하고,
  컬럼 삭제는 배포 확인 후 별도 커밋으로** 진행한다.

## 변경 사항

### 1. 찜(`user_bookmarks`) FK 통합
- `src/lib/community/bookmarks.ts`: 외부 API(`BookmarkTarget` 유니온,
  `MyBookmark`/`getMyBookmarkedIds` 반환 타입)는 **그대로 유지** —
  `bookmark-button.tsx`/`favorites-view.tsx`/각 마트 화면 호출부는 전혀
  바뀌지 않는다. 내부적으로만 브랜드별 원본 class_id ↔
  `culture_club_classes.id`(surrogate) 변환(`resolveCultureClubClassId`)을
  추가하고, 실제 DB에는 `culture_club_class_id` 하나만 쓴다.
- `scripts/migrations/2026-10-06-user-bookmarks-culture-club-class-id.sql`
  (적용 완료): 컬럼 추가만(무손상).
- `scripts/migrations/2026-10-06-backfill-user-bookmarks-culture-club-class-id.mjs`
  (실행 완료): 기존 데이터 매칭 — orphan 0건 확인.
- `scripts/migrations/2026-10-06-user-bookmarks-drop-legacy-class-columns.sql`
  (**작성만 하고 아직 미적용** — 이 커밋 배포 확인 후 적용): 구 컬럼 2개
  삭제 + CHECK 제약을 `culture_club_class_id` 기준으로 교체.

### 2. 예약 오픈 알림 일반화
- `scripts/ingest/event-reservation-reminder-push-batch.mjs`: 이마트 전용
  소스(`emart_culture_club_classes`)를 `culture_club_classes`(브랜드
  무관, `register_start_at` 보유 행 전체)로 교체. 지금은 이마트만 이 값을
  채우지만, 다른 브랜드가 같은 컬럼을 채우면 코드 변경 없이 자동 포함된다.
- `scripts/migrations/2026-10-06-culture-club-classes-reservation-reminder.sql`
  (적용 완료): `culture_club_classes.reservation_open_reminder_sent_at`
  추가(기존 값 0건 확인 — 백필 불필요).

### 3. 찜 상태감시 통합(브랜드 분기)
- `scripts/ingest/lib/culture-club-status-fetchers.mjs`(신규): 이마트
  (classId+classStatus 필터 GraphQL 재조회)/롯데마트(courseview.do HTML
  스크래핑) 각각의 "현재 상태 재확인" 로직을 그대로 옮겼다(사이트 구조가
  달라 로직 자체는 안 바꿈).
- `scripts/ingest/culture-club-status-watch.mjs`(신규, 통합): 찜
  (`culture_club_class_id`)을 `culture_club_classes.brand`로 먼저 식별한
  뒤 `BRAND_ADAPTERS` 맵으로 분기 — 행 단위 try/catch 유지(한 건/한
  브랜드 실패가 다른 행 처리를 막지 않음). 새 브랜드는 맵에 항목만
  추가하면 된다.
- 기존 `emart-culture-club-status-watch.mjs`/`lottemart-culture-club-
  status-watch.mjs`와 각 테스트 **삭제**(통합 스크립트로 완전히 대체).
- `lottemart-culture-club.mjs`의 `markFallenOutRowsAsUnavailable`도
  `user_bookmarks.lottemart_class_id` 직접 조회 대신 `culture_club_classes`
  조인으로 전환.

### 4. 스케줄링 — 통합 스크립트는 로컬 PC로
- 통합 스크립트가 이마트까지 포함하므로, GitHub Actions에서 이마트 쪽
  재확인이 WAFForbiddenException(403)에 막힌다(emart-culture-club-batch.
  yml.disabled와 동일 이유) — 롯데마트만 보면 문제없었지만 통합된 이상 더
  제약이 큰 쪽에 맞춰야 한다.
- `.github/workflows/lottemart-culture-club-status-watch.yml` →
  `.yml.disabled`로 비활성화.
- Windows 작업 스케줄러: `LocalOpenSpaces-EmartStatusWatch` 삭제,
  `LocalOpenSpaces-CultureClubStatusWatch`(5분마다, 통합 스크립트) 신규
  생성.

## 검증
- `npx tsc --noEmit` / `npm run test`(274개 파일 2,857개) / `npm run build`
  전부 통과.
- 실제 라이브 DB로 `culture-club-status-watch.mjs`의 `run()` 직접 실행 —
  대상 0건(현재 찜 0건과 일치)으로 에러 없이 정상 종료 확인.
- 실제 라이브 DB로 `brand+source_class_id → culture_club_classes.id` 변환
  로직을 이마트/롯데마트 각 1건 샘플로 직접 조회해 정확히 매칭됨을 확인.

### 5. 수집(ingest) 스크립트 — 통합 테이블 "이중 쓰기" 추가
검토 중 발견한 문제: 찜(2번)이 `culture_club_classes.id`(surrogate)를
참조하는데, 이 테이블은 Phase A의 1회성 복사 스냅샷일 뿐 매일 갱신되지
않고 있었다 — 즉 Phase A 이후 새로 생긴 강좌는 프론트엔드(아직 구
테이블을 봄)에는 보이지만 찜을 시도하면 `resolveCultureClubClassId`가
실패해 에러가 났을 것이다. 이걸 막기 위해, 메인 테이블 upsert가 끝나면
같은 행을 `culture_club_classes`에도 반영하는 "이중 쓰기"를 추가했다
(수집 로직 자체는 안 바꿈 — 실패해도 메인 배치는 성공으로 처리).
- `scripts/ingest/lib/culture-club-unified-row.mjs`(신규): Phase A 복사
  스크립트의 매핑 함수를 여기로 옮기고 양쪽(1회성 복사 + 매일 ingest)이
  공유하게 했다.
- `emart-culture-club.mjs`/`lottemart-culture-club.mjs`: 메인 upsert
  성공 후 `culture_club_classes`에도 upsert.

**실측으로 발견한 버그(수정 완료)**: 실제 라이브 1개 지점 실행으로
검증하던 중 `null value in column "is_excluded"`, 이어서
`"collected_at"` NOT NULL 위반 에러가 났다 — 원본 ingest 스크립트는
`is_excluded`/`collected_at`/`created_at`/`updated_at`/`detail_fetched_at`
을 upsert payload에 아예 포함하지 않아(DB 기본값/기존 값 보존에 맡기는
기존 관례) `row.x`가 `undefined`인데, 매핑 함수가 `x: row.x`로 그 키를
그대로(값은 undefined로) 만들어 반환하고 있었다. 단일 행 insert라면
Supabase가 이걸 "키 없음"으로 봐 DB 기본값을 적용하지만, **대량(batch)
upsert에서는 명시적 `null`로 보내져 NOT NULL 제약을 위반**했다(단일
테이블 upsert에서는 같은 패턴이 늘 써왔지만 문제가 없었던 것과 다른
동작 — 실제로 겪어보고서야 알게 된 차이). `omitUndefinedKeys()`로 반환
직전에 undefined 값을 가진 키를 전부 제거하도록 고쳤다 — 재실행 후
라이브 1개 지점 upsert가 에러 없이 완료됨을 확인.

## 검증 — 라이브 1개 지점 실행
- 롯데마트(`storesLimit: 1`, 영등포점 25건)로 메인 upsert +
  `culture_club_classes` 이중 쓰기 전부 성공 확인, 실제 저장된 행을
  직접 조회해 `raw_status`/`normalized_status`/`raw_extra` 값이 올바른지
  확인.
- 이마트는 지점 제한 옵션이 없어 전체 배치(64개 지점)로 실행해 검증한다
  (결과는 완료 후 별도로 기록).

## 특이 사항 — 다음 단계
- **배포 후**: 이 커밋이 Vercel에 배포된 걸 확인한 뒤
  `2026-10-06-user-bookmarks-drop-legacy-class-columns.sql`을 적용해 구
  컬럼을 정리한다.
- 이중 쓰기 덕분에 `culture_club_classes`는 이제 매일 최신으로 유지된다
  — 새로 찜 가능해진 강좌도 바로 찜할 수 있다. 다만 아직 관리자 패널/
  프론트엔드 조회는 구 테이블을 본다 — 완전한 "쓰기 대상 전환"(이중
  쓰기가 아니라 구 테이블 쓰기를 멈추는 것)과 조회 전환은 다음 단계다.
