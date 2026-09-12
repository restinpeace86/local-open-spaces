# 만료 이벤트 비활성화 백로그 버그 수정 + 아카이빙 검토 (Step 124)

## 구현 일시
2026-09-12

## 배경 (사용자 지시 원문)
> "어 events쪽에 데이터 중에 비활성화 데이터들은 데이터 괜찮나 ? 지금 관리자 화면
> 전체 다 불러오는거 굉장히 느린거같은데 ? 비활성 데이터 사용 안하는거면... 따로
> backup 테이블 만들어서 그쪽으로 옮기거나 하는건 어때? 한번 검토해봐... 비활성
> 데이터 기준은 이미 서비스 지난 데이터인데... 이중에서 당해년도가 아닌 꽤
> 오래지난 데이터라던가... 그리고 표준 중분류가 미지정NULL 체크 된거는 활성 상태가
> is_active treu로 된게 안먹던데 ? 아주 옛날 이벤트들도 다 나오고 있어"

## 조사 결과 — 진짜 원인은 필터 버그가 아니라 데이터 정합성 버그였다
"표준 중분류 미지정 + is_active=true" 조합이 안 먹는 것처럼 보인 현상을 실측
조사한 결과, 쿼리 로직(`applyMultiValueOrNullFilter`, `is_active` 필터)은 정상이었다
— **`is_active` 컬럼 값 자체가 대량으로 잘못돼 있었다.**

- 실측: `end_date < 오늘 AND is_active = true`(이미 끝났는데 활성으로 남은 행)가
  **21,453건**(전체 events 28,698건의 75%!) — 2016년에 끝난 행도 `is_active=true`로
  남아 있었다.
- 원인: `scripts/ingest/lib/deactivate-expired-events.mjs`의 `deactivateExpiredEvents()`가
  `.update({ is_active: false }).lt('end_date', cutoff).eq('is_active', true).select('id')`를
  **딱 한 번만** 호출했는데, PostgREST의 `max_rows`(`supabase/config.toml`, 1000)가
  `Prefer: return=representation`이 붙는 UPDATE...RETURNING에도 그대로 적용돼(SELECT
  전용이 아님) **매일 최대 1000건만 비활성화**되고 나머지는 그대로 남았다. 매일 새로
  만료되는 행이 1000건보다 많은 날이 이어지면서 백로그가 계속 쌓였다.
- 즉 "표준 중분류 미지정" 필터가 특별히 문제가 아니라, **`is_active=true`가 걸린
  모든 조회에서** 이미 끝난 지 몇 년 된 이벤트가 계속 함께 섞여 나오고 있었다 —
  마침 미지정(NULL) 표준 중분류를 가진 오래된 소스(수집 초기 어댑터 등)가 이 문제를
  더 눈에 띄게 만들었을 뿐이다.

## 변경 사항
- `scripts/ingest/lib/deactivate-expired-events.mjs`:
  - "id를 소량(`BATCH_SIZE=200`)만 SELECT → 그 id로만 UPDATE"를 0건이 될 때까지
    반복하는 방식으로 재작성. 처음엔 "1회 UPDATE+RETURNING 대신 0건이 나올 때까지
    그냥 반복"으로 고쳤으나, 실제로 21,453건 백로그에 대해 실행해보니 **한 번에
    1000건을 UPDATE+RETURNING하는 것 자체가 statement timeout**을 냈다(`end_date <
    cutoff AND is_active = true` 조건에 맞는 인덱스가 없어 — `idx_events_dates`는
    `(start_date, end_date)` 복합이라 이 조건엔 안 맞음). id 목록을 먼저 작게 SELECT한
    뒤 PK로 UPDATE하는 2단계 방식으로 바꿔 안전하게 처리했다(다른 대량 처리 코드의
    `SELECT_LOOKUP_BATCH_SIZE` 관례와 동일한 원리).
- `scripts/ingest/lib/deactivate-expired-events.test.mjs`: 목 클라이언트를 새 2단계
  호출 패턴(select→limit, update→in)에 맞게 재작성. 신규 회귀 테스트: 만료 대상이
  한 배치보다 많아도(시뮬레이션) 반복해서 전부 비활성화하는지 검증.
- **프로덕션 즉시 실행**: 수정된 함수를 1회 수동 실행해 실제 백로그 21,453건을
  전부 정리했다. 실행 후 재확인: `end_date < 오늘 AND is_active = true` 잔여 **0건**.
  전체 `is_active=true` 건수가 24,789 → **3,336**건으로 정상화됨(inactive는 3,909 →
  25,362건).

## "비활성 데이터 백업 테이블로 이전" 검토 결과 — 권장하지 않음
- 데이터가 "괜찮은지" 질문에 대한 답: 위 버그 수정 전에는 안 괜찮았다(활성 여부
  자체가 대량으로 틀려 있었음). 지금은 정상화됐다.
- 백업 테이블 분리를 검토했으나, 현재 규모에서는 **성능상 이점이 크지 않아
  권장하지 않는다**:
  - `events` 전체가 28,698건(정리 후 inactive 25,362건)이다 — Postgres에서 이 정도
    행 수는 적절한 인덱스만 있으면 밀리초 단위로 조회되는 "작은" 테이블이다. 실제로
    "당해년도가 아닌 꽤 오래된" 이벤트는 259건(1년 초과)/278건(작년 이전 종료)뿐이라,
    분리해도 테이블 크기 자체는 거의 줄지 않는다.
  - 관리자 화면이 느리게 느껴진 진짜 원인은 이 정합성 버그(is_active=true로 잘못
    남은 21,453건이 "활성" 조회/집계에 매번 섞여 들어감)였을 가능성이 크다 — 이미
    수정·검증됐으므로 지금 다시 체감 속도를 확인해 볼 수 있다.
  - (참고, 이번 조사 범위 밖) `/admin/data-grid` 페이지 로드 자체가 이미 알려진
    별개의 성능 이슈를 안고 있다 — `open_spaces`(약 12만 건) 대상 필터 옵션 RPC들이
    8초 statement_timeout 경계를 넘나든다는 기존 코드 주석(2026-08-25/28)이 있다.
    이건 events가 아니라 open_spaces 쪽 문제라 이번 요청 범위와는 다르다.
- 결론: 지금 규모에서 백업 테이블 이전은 실익이 적어 구현하지 않았다. 나중에
  events가 수십만 건 이상으로 커지거나, 관리자가 "오래된 만료 이벤트는 화면에서
  아예 안 보고 싶다"는 별개의 UX 이유로 원하면 그때 다시 검토하는 게 맞다고
  판단한다.

## 검증
- `npx tsc --noEmit`: 통과.
- `npm run test -- --run`: 134 files / 1567 tests 전체 통과(`deactivate-expired-events.test.mjs`
  6개 — 배치 반복 회귀 테스트 포함).
- `npm run build`: 성공.
- 프로덕션 실측: 21,453건 정리 완료, 잔여 0건 확인.

## 특이 사항
- `deactivateExpiredEvents`는 `run-daily.mjs`의 정기 배치 단계 중 하나로 이미
  등록돼 있어(`DEACTIVATE_EXPIRED_EVENTS`), 이 수정으로 **내일부터는 매일 배치가
  실제로 그날 새로 만료되는 이벤트를 전량 비활성화**한다(하루 단위 발생량은
  많아도 수십~수백 건 수준이라 200건 배치 1~2회면 충분).
