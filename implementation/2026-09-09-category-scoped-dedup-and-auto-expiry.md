# 노출 중분류별 중복 스팟 검수 + 기존 그룹 자동 편입 + 한시성 예약 스팟 자동 삭제

## 구현 대상
사용자 지시: "일단 각 노출중분류별 중복 스팟 검수 가능하도록 중복 스팟 검수 및
매핑 탭에 변경해줘.... 먼저 노출중분류 선택하고 거기 있는 데이터들끼리만
좌표 비교해서 중복 스팟 있는지 확인하는거 / 일단 중복되는 것에 대하여
대표스팟을 만들고 추후에 들어온 데이터들도 동일 좌표면 대표스팟내로
묶이는걸로 하자 / 그리고 open_spaces로 들어온 데이터중에.. daily batch로
들어온 데이터들? seoul_public_reservation으로 들어온것들은 이런거는
예약일자라던가 서비스 일자가 들어있는데.. 예약일자 기준 end date가 지난건
open_spaces에서 삭제해버리자. 즉, 대표스팟으로 묶인 장소중 예약일자라던가
있는 애들.. 이애들은 한시성 장소로서 예약일자가 지나버리면 자동삭제"

## 구현 일시
2026-09-09

## 배경 조사
- 기존 `find_spot_dedup_candidates` RPC는 `service_category_id is null`인
  행(아직 매핑 안 됨)만 스캔했다 — 원래 목적("아직 정제되지 않은 원본
  데이터 정리")에는 맞지만, 사용자가 실제로 문제 삼은 난지캠핑장 42건은
  현재도 여전히 미매핑 상태(실측 확인: `service_category_id IS NULL`)라
  이 자체는 그대로 두되, "이미 매핑된 데이터끼리 중복을 다시 검수"하는
  새 모드가 필요했다.
- `open_spaces`는 예약/서비스 기간 전용 컬럼이 없지만, seoul-yeyak-adapter.mjs가
  원본 서울시 API 응답을 그대로 `raw_data`(jsonb)에 보존해 `SVCOPNBGNDT`/
  `SVCOPNENDDT`(서비스 이용 시작/종료일자)가 이미 들어있음을 실측으로
  확인했다(예: "8월 일반캠핑존.." 행의 SVCOPNENDDT="2026-08-31 00:00:00.0").
  같은 어댑터의 `events` 분기는 이미 이 필드를 `end_date`로 써서
  `deactivateExpiredEvents`가 만료 비활성화를 하고 있었다 — open_spaces
  분기만 이 필드를 아예 저장하지 않고 있었을 뿐, 데이터 자체는 처음부터
  있었다.
- `dedupe-open-spaces.mjs`(기존 교차 출처 중복 정제)는 "단일 출처 내부
  반복"을 의도적으로 자동 판정에서 제외한다(예: 놀이터 pfctSn 반례) — 이번
  요구사항(추후 들어오는 동일 좌표 신규 행의 자동 그룹 편입)은 이와 다르게
  "이미 사람이 확인해 확정한 그룹"에 한해서만 자동 편입하므로 같은 신중함을
  지키면서도 별개 메커니즘으로 구현했다.

## 변경 사항
### 1. `scripts/migrations/2026-09-09-spot-dedup-by-category-and-auto-group.sql`
- `find_spot_dedup_candidates(p_limit, p_after_key, p_service_category_id)`:
  세 번째 인자(선택)를 추가했다. 지정하면 그 중분류로 이미 매핑된 행끼리만
  스캔하고, 생략하면(기본값 NULL) 기존 동작(미매핑 원본 전체 스캔)을 그대로
  유지한다. 인자 목록이 바뀌어(오버로드 충돌) 기존 2-인자 함수를 먼저
  `DROP`해야 했다.
- 신규 `auto_assign_open_spaces_to_existing_groups()`: 이미 확정된 그룹
  (`open_spaces.group_id` 존재)의 좌표 30m 이내(그룹을 만들 때 쓴 것과
  동일한 `find_nearby_open_spaces`/`spot-dedup-grouping.ts` 반경, 새 임계값
  아님)에 미그룹 신규 행이 있으면 그 그룹으로 자동 편입(group_id +
  standard_name/service_category_id/blog_url/age_group/feature_tag 복사)한다.
  실측 검증: 트랜잭션(BEGIN...ROLLBACK)으로 난지캠핑장 2건에 임시 그룹을
  걸고 함수를 실행해 42건 전체가 정확히 편입되는 것을 확인 후 롤백(실제
  데이터는 변경하지 않음). 실제 호출 결과(현재 그룹 0건이라 no-op) `0` 반환
  확인.

### 2. `src/app/api/admin/spot-dedup/groups/route.ts`
`service_category_id` 쿼리 파라미터를 받아 RPC 세 번째 인자로 전달.

### 3. `src/components/admin/spot-dedup-panel.tsx`
"🔗 중복 의심 그룹" 섹션 상단에 "스캔 범위" select를 추가했다 — 노출
중분류를 선택하거나 "미매핑 원본 전체(기존 방식)"를 고를 수 있고, 아무것도
고르지 않으면 "📥 불러오기"가 비활성화된다. 이 목록 자체는(선택지 채우기용,
조회 비용이 가벼움) 예외적으로 마운트 시 미리 조회하도록 바꿨다 — 무거운
후보 스캔은 여전히 명시적 클릭이 있어야만 실행된다(관리자 페이지 성능
최적화 관례 유지).

### 4. `scripts/ingest/lib/delete-expired-reservation-spaces.mjs`(신규)
`seoul_public_reservation` 소스 행 중 `raw_data.SVCOPNENDDT`가 컷오프
이전인 행을 삭제한다. 유예 기간은 `deactivateExpiredEvents`의 현재 정책
(`EXPIRY_GRACE_DAYS=0`, 종료일 당일까지 노출·다음날 즉시 처리)과 동일하게
맞췄다(같은 개념에 다른 유예 기준을 임의로 적용하지 않음 — 제3장 제5조).
open_spaces에는 소프트 삭제 컬럼이 없어(dedupe-open-spaces.mjs와 동일한
제약) 하드 삭제 전 `docs/dedupe-backups/`에 백업 JSON을 먼저 남긴다(동일
디렉터리, 파일명 접미사로 구분). 실측(dry-run): 1,465건 스캔, 279건이
이미 만료 상태로 확인됨(다음 실제 배치에서 삭제될 예정).

### 5. `scripts/ingest/lib/supabase-admin.mjs`
`autoAssignOpenSpacesToExistingGroups(client)` 헬퍼 추가(RPC 얇은 래퍼,
`analyzeOpenSpaces`와 동일한 패턴).

### 6. `scripts/ingest/run-daily.mjs`
`DEDUPE_OPEN_SPACES` 다음에 `AUTO_ASSIGN_TO_EXISTING_GROUPS` →
`DELETE_EXPIRED_RESERVATION_SPACES` 두 단계를 추가했다(그 다음
`ANALYZE_OPEN_SPACES`가 최신 상태를 반영하도록 삭제/편입을 통계 갱신보다
먼저 실행). 둘 다 dry-run 시 DB를 건드리지 않는다.

## 검증
- `find_spot_dedup_candidates`/`auto_assign_open_spaces_to_existing_groups`:
  실측 SQL로 카테고리 지정 모드(키즈카페 2,302건 중 50건 페이지, 캠핑장은
  아직 매핑 데이터 없어 빈 배열)와 기존 미매핑 모드 둘 다 정상 동작 확인,
  트랜잭션 롤백 테스트로 자동 편입 로직의 정확성 확인.
- `delete-expired-reservation-spaces.test.mjs`(신규 5개): 컷오프 이전만
  삭제, 날짜 필드 없으면 제외, 유예 0일(당일까지 유지·다음날 삭제),
  대상 없으면 backupFile null, dryRun 시 미삭제.
- `spot-dedup-panel.test.tsx`: 신규 3개(스캔 범위 미선택 시 버튼 비활성화,
  중분류 선택 시 쿼리 파라미터 전달, 미매핑 선택 시 파라미터 없음) +
  기존 9개 테스트를 새 UX(스캔 범위 먼저 선택)에 맞게 갱신.
- `npx tsc --noEmit` / `npm run test`(1354건, 기존 1346 + 신규 8) /
  `npm run build` 전체 통과.
- 실제 환경 스모크 테스트(임시 스크립트, 검증 후 삭제): 자동 편입 함수
  실제 호출 시 0건(정상, 그룹 없음), 만료 삭제 dry-run 시 1,465건 스캔 중
  279건이 이미 만료 상태로 확인됨 — 다음 정규 daily batch(GitHub Actions
  `ingest-daily.yml`)에서 실제로 삭제된다(이 세션에서 수동으로 실제 삭제를
  강제 실행하지 않았다 — 정규 자동화 경로를 통해 진행되는 것이 맞다고
  판단, 하드 삭제라는 되돌리기 어려운 영향 때문).

## 특이 사항
- 난지캠핑장 42건은 여전히 미매핑 상태라, 이번에 추가한 "노출 중분류 선택
  스캔" 모드로는 아직 찾을 수 없다 — 관리자가 먼저 해당 데이터를 "캠핑장 /
  피크닉장" 중분류로 매핑한 뒤에야 그 모드로 검수할 수 있다(또는 기존
  "미매핑 원본 전체" 모드로 지금 바로 검수 가능, 이 모드는 계속 남아있음).
  이 매핑 작업 자체는 이번 지시 범위에 포함되지 않아 진행하지 않았다.
- 자동 그룹 편입(`auto_assign_open_spaces_to_existing_groups`)은 "이미
  사람이 확인한 좌표"에만 적용되는 보수적 규칙이라 `dedupe-open-spaces.mjs`가
  피한 "단일 출처 반복 자동 판정" 문제와 무관하다 — 새로운 자동 중복 판정
  휴리스틱을 추가한 것이 아니다.
