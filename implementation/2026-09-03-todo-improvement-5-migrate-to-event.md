# [개선사항 5] 어드민 스팟픽 → 이벤트픽 데이터 이관 기능

## 구현 일시
2026-09-03

## 배경 조사
`events.external_id`/`title`/`event_type`/`start_date`/`end_date`는 전부 NOT NULL이고
(실측 확인 — `information_schema.columns`), open_spaces 원본에는 시작/종료일 대응 값이
아예 없다. 코드베이스에 "무기한/상시" 날짜를 나타내는 기존 관례(예: `9999-12-31`)가
있는지 grep으로 확인했으나 없었다 — 임의로 지어내지 않고(제3장 제5조 추측 금지),
관리자가 마이그레이션 폼에서 시작/종료일과 타겟 연령을 직접 입력/선택하도록 했다.

## 구현 내용
1. **`/api/admin/data-grid/migrate-to-event`(POST, 신규)**: open_spaces 행을 읽어
   events 스키마에 맞춰 매핑 후 insert, 성공 시 원본 open_spaces 행을 삭제한다.
   - 대분류/중분류: `CATEGORY_MAJ_OPTIONS`로 유효성 검증(관리자가 선택한 조합이 실제
     taxonomy에 속하는지).
   - 타겟 연령: `EVENT_PICK_TARGET_AUDIENCES`(INFANT/KIDS_PRE/KIDS_SCHOOL/FAMILY) 4종만
     허용 — 그 외 값을 넣으면 `getCategoryMinFeed`의 `target_audience` 필터에 걸려
     "이관 즉시 노출"이라는 요구사항을 満족 못하기 때문.
   - `external_id`는 `MIGRATED_${원본 external_id}`로 만들어 유니크 제약을 만족하고
     재이관(중복 실행) 시도 시 자연스럽게 실패하도록 했다.
   - events에는 없는 open_spaces 전용 컬럼 처리: `operating_hours`→`description`에
     "운영시간: ..."로 보존(정보 유실 방지), `info_url`→`reservation_url`로 이관(events의
     유일한 공개 URL 컬럼, `is_reservation_required: false`로 둬 "예약 필수"가 아니라
     "안내 링크"임을 구분).
   - **안전장치(요구사항 원문에는 없었지만 실측으로 발견해 추가)**: `reservations.spot_id
     → open_spaces.id`가 `ON DELETE CASCADE`로 걸려 있어(실측 확인), 확인 없이 삭제하면
     실제 사용자가 넣은 예약 기록이 통보 없이 함께 사라진다. 이관 전 해당 스팟에 예약이
     1건이라도 있으면 409로 거부하고 관리자에게 먼저 예약을 처리하도록 안내한다(제11조
     오류 처리 원칙).
2. **`MigrateToEventModal`(신규 컴포넌트)**: 대분류/중분류/타겟 연령/시작일/종료일 입력
   폼. `LocationOnboardingModal`과 동일한 관례로 `createPortal`을 써 부모 모달
   (`RawDataModal`)의 배경 클릭 핸들러에 이벤트가 버블링되지 않게 했다.
3. **`RawDataModal`**: open_spaces 탭 상세 화면에 "🚚 이벤트픽으로 이동" 버튼 추가.
4. **`AdminDataGridClient`**: 이관 성공 시 목록/총건수/상세 모달에서 해당 행을 즉시
   제거한다(원본이 서버에서 실제로 삭제됐으므로).
5. `EVENT_PICK_TARGET_AUDIENCES`를 `get-home-feed.ts`에서 export해 API 라우트/모달이
   재사용하도록 했다(제5장 제4조 기존 구조 우선 — 값을 중복 정의하지 않음).

## 실측 검증(라이브 DB, 테스트 후 즉시 정리)
- 더미 open_spaces 행 생성 → 이관 API 호출 → 원본 삭제(count 0)/events 신규 생성(count 1)
  확인 → `category_maj`/`category_min`/`target_audience`/`description`(운영시간 보존)/
  `reservation_url`(info_url 이관)/`location`(PostGIS 포인트) 전부 정확히 매핑됨을 SQL로
  직접 확인.
- `/api/home/category-feed?category=전시/관람` 호출로 이관 직후 `item_type: "EVENT"`로
  즉시 노출됨을 확인(요구사항 "즉시 노출" 충족).
- 별도 더미 스팟에 예약 1건을 걸어 이관 시도 → 409 거부 및 안내 메시지 확인(안전장치
  동작 검증).
- 테스트에 사용한 모든 더미 open_spaces/events/reservations 행은 검증 직후 삭제해
  실 데이터에 흔적을 남기지 않았다.

## 검증
`npx tsc --noEmit`/`npm run test`(96파일 972건, 기존 그대로 — 이 라우트는 기존
category-min/target-audience 라우트와 동일하게 API 라우트 단위 테스트 관례가 이
프로젝트에 없어 신규 테스트를 추가하지 않음)/`npm run build` 통과. dev 서버 대상 실측
E2E로 위 시나리오 전부 확인.
