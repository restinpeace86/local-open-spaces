# Event↔Spot 자동 매칭을 매일 배치에 상시 편입 (Step 122)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문)
> "새로운 이벤트들이 들어오는데.. 이미 등록한적 있는데 일자만 바뀌는 이벤트들..
> 예를들어 한강공원 난지캠핑장이라던가 서울형 키즈카페라던가.. 내가 이전 8월꺼에
> 대하여 스팟연결하고 해당 스팟에 대하여 노출 중분류도 해놨어.. 이러면 9월꺼라던가
> 가져왔으면 자동 매핑같은거 가능한가? 아까 뭔가 시간만 바뀐다거나 한다고 했잖"

## 조사
- external_id가 안정적인 소스(예: 대부분의 서울형 키즈카페 지점 — 매달 같은 SVCID
  유지)는 Step 119의 `upsertRowsSafeMerge` 수정 이후 이미 문제없다: `space_id`는
  `ALWAYS_REFRESH_FIELDS`에 없어 기존 값이 그대로 보존되므로, 관리자가 8월 건에
  연결해 둔 스팟이 9월 갱신 후에도 그대로 남는다.
- 문제는 **external_id가 매달 새로 발급되는 소스**다 — 예: "한성백제박물관점 9월
  운영 안내"처럼 안내글마다 새 SVCID가 붙는 경우, DB 입장에서는 완전히 새로운
  이벤트 행이라 `space_id`가 처음부터 NULL로 시작한다. 관리자가 8월 건에 해둔
  스팟 연결이 9월 건에 자동으로 이어지지 않는다.
- Step 114(2026-09-11, 개선사항10)에서 이미 정확히 이 문제를 겨냥한 일회성 SQL
  마이그레이션(`2026-09-11-match-events-to-open-spaces.sql`)을 실행한 적이 있다 —
  좌표 30m 이내 + 이름 부분일치, `space_id is null`인 행만 대상이라 **멱등**(몇 번을
  다시 실행해도 이미 연결된 것을 건드리지 않음)하다고 그 파일 자체에 이미 명시돼
  있었다. 즉 "자동 매핑"에 필요한 로직은 이미 존재했고, 빠진 건 "매번 관리자가
  손으로 재실행"이 아니라 **자동으로 주기 실행되는 것**뿐이었다.
- 노출 중분류(`service_category_id`)는 `events`가 아니라 `open_spaces` 쪽 컬럼이라,
  새 이벤트가 "이미 노출 중분류를 설정해 둔 그 스팟"에 `space_id`로 연결되기만
  하면 노출 중분류는 자동으로 함께 적용된다(같은 스팟 행을 가리킬 뿐 복사할 값이
  따로 없음) — 사용자가 걱정한 "노출 중분류도 다시 해야 하나"는 별도 작업이
  필요 없다.

## 변경 사항
- `scripts/migrations/2026-09-12-match-events-to-open-spaces-rpc.sql` (신규, 프로덕션
  적용 완료): Step 114의 일회성 SQL 쿼리를 `match_events_to_open_spaces()` RPC
  함수로 그대로 옮겼다(매칭 기준 변경 없음 — 제5장 제4조 기존 구조 우선). 갱신된
  행 수를 반환한다(`auto_assign_open_spaces_to_existing_groups()`와 동일한 관례).
- `scripts/ingest/lib/supabase-admin.mjs`: `matchEventsToOpenSpaces(client)` 신규
  — 위 RPC를 호출하는 얇은 래퍼(`autoAssignOpenSpacesToExistingGroups`와 동일한 관례).
- `scripts/ingest/run-daily.mjs`: `runMatchEventsToOpenSpaces({ dryRun })` 신규 —
  `AUTO_ASSIGN_TO_EXISTING_GROUPS` 바로 다음 단계로 편입해 매일 배치가 끝날 때마다
  자동 실행되게 했다. dry-run에서는 실행하지 않는다(DB 상태 변경 없음 원칙, 기존
  다른 후처리 단계와 동일).
- **즉시 반영**: 새 RPC를 프로덕션에서 1회 수동 실행해 이미 쌓여 있던 미연결
  이벤트도 바로 정리했다 — **331건**이 자동으로 기존 스팟에 연결됨(사용자가 언급한
  "서울형 키즈카페 한성백제박물관점 9월 운영 안내"도 이 실행으로 실제 스팟에
  연결됨을 확인).

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 134 files / 1562 tests 전체 통과(이 변경은 스크립트
  레이어(.mjs)라 새 유닛 테스트는 추가하지 않음 — `analyzeOpenSpaces`/
  `refreshSigunguOptionsCache`/`autoAssignOpenSpacesToExistingGroups` 등 기존 동종
  RPC 얇은 래퍼들도 동일하게 유닛 테스트가 없는 기존 컨벤션을 따름. SQL 로직
  자체는 Step 114에서 이미 실측 검증됐고, 이번엔 그 로직을 그대로 옮겼을 뿐이다).
- `npm run build`: 성공.
- 프로덕션 직접 실행으로 실측 검증: 331건 자동 연결, 사용자가 언급한 구체적 사례
  (한성백제박물관점 9월 안내글) 연결 확인.

## 특이 사항
- 이 매칭은 "좌표 30m 이내 + 이름 부분일치"를 모두 만족해야만 연결한다(Step 114의
  보수적 기준 그대로 유지) — 잘못된 링크가 링크 없음보다 나쁘다는 원칙. 좌표나
  venue_name이 없는 이벤트, 혹은 이름이 전혀 다른 이벤트는 여전히 관리자가
  수동으로 연결해야 한다(기존 `SpaceLinkEditor` 그대로 사용 가능).
- 이미 `space_id`가 있는 이벤트는 절대 재평가/변경하지 않는다 — 관리자가 수동으로
  다른 스팟을 지정해 둔 경우도 안전하게 보존된다.
