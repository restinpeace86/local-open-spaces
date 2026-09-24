# LOCALDATA_PLAYGROUND 대량 upsert 타임아웃 수정 (배치 크기 조정 + 소스 전용 타임아웃)

## 구현 대상
사용자 지시(2026-09-25) 흐름:
1. "어 바로 수동실행하고.. 혹시라도 병목되는데가 있거나 앞에 소스랑 별도로
   해서 진행하게 돼 isolated 하게 진행되어야돼" → 월간 배치 수동 실행 +
   소스 간 격리 확인.
2. (배치 결과 보고 후) "저 하나만 따로 분리해놔서 다시 실행해보고..
   단독으로 시간끝나는지 보고.. 이것만 upsert를 나눠서 할 수는 없어?
   건수가 많으니깐..10000건씩 upsert한다던가.. 일단 다 가지고 온다음에"

## 조사/실측 경과
1. **격리 확인**: `run-monthly.mjs`는 이미 각 소스를 개별 `try/catch`로
   감싸 순차 실행하고 있어(코드 확인), 한 소스 실패가 다음 소스를 막지
   않는다 — 추가 조치 불필요.
2. **수동 전체 배치 1회 실행**: 20/22 단계 성공. `LOCALDATA_PLAYGROUND`가
   실패했는데, 원인이 지난 9/1 장애("fetch failed")와 달랐다 — 이번엔
   정부 API 수신(85,345건)과 스키마 변환(82,431건)까지는 정상 완료됐고,
   그 뒤 **Supabase upsert가 10분(600초) 하드 타임아웃에 걸려** 중단됐다.
   (부수 발견: `DEDUPE_OPEN_SPACES`도 별도로 DB statement timeout 실패 —
   이번 지시 범위 밖이라 손대지 않음. 부수 발견 2: 타임아웃으로 죽기 전
   일부는 이미 커밋돼 있어, 애초 문의였던 "이일천랜드 놀이방"이 실제로
   이번에 DB에 들어온 것을 확인했다 — 다만 `service_category_id`는 없다,
   "목욕장업소"가 애초에 16개 노출 중분류 중 하나로 매핑된 적이 없어서다.)
3. **단독 실행(1차, 기존 200건 배치)**: `--only=LOCALDATA_PLAYGROUND`는
   `withStepTimeout`을 타지 않아 시간제한 없이 끝까지 실행됨 — 실제로는
   **약 12분** 걸렸다(성공은 했지만, 전체 배치 안에서였다면 정확히 600초에
   강제 종료됐을 시간). 즉 다른 소스와의 자원 경합 문제가 아니라, 이 소스
   자체가 200건 배치로는 원래 10분을 넘긴다는 게 확인됐다.
4. **upsert 배치 크기 원인 확인**: `base-collector-adapter.mjs`가 모든
   단일 테이블 어댑터(open_spaces 포함)를 예외 없이 `upsertRowsSafeMerge()`
   로 처리하도록 통합돼 있는데, 그 배치 크기(`SAFE_MERGE_UPSERT_BATCH_SIZE`
   =200)는 2026-09-13에 **events 테이블의 updated_at 트리거 + trigram
   인덱스 3개** 비용 때문에 낮춘 값이었다. `open_spaces`에는 그 비용이
   없음을 직접 확인했다(`select * from pg_trigger where tgrelid=
   'public.open_spaces'::regclass and not tgisinternal` → 0건). 즉
   open_spaces도 이 events 전용 제약을 함께 쓰고 있었다 — 82,431건 ÷ 200 =
   약 412회의 UPSERT 왕복(+같은 수의 SELECT 조회 왕복)이 필요했다.
5. **단독 실행(2차, open_spaces만 500건 배치로 상향)**: upsert 왕복은
   412회→165회로 줄었지만, 총 소요시간은 오히려 **약 14분 45초**로
   늘었다(500건 단일 UPSERT 문이 2회 Postgres 자체 statement_timeout에
   걸려 재시도 — 기존 `withRetry`로 흡수되어 데이터 유실은 없었지만 총
   시간은 늘었다). 배치 크기를 키우면 왕복 횟수는 줄어도 문장 하나의
   실행 비용이 늘어 총 시간이 보장되지 않는다는 것을 실측으로 확인했다 —
   "10,000건씩"은 이보다 더 위험(SELECT 쪽은 URL 길이 제한으로 애초에
   200건이 하드 한계, 2026-08-25 실측: 500건 시도 시 fetch 자체가 실패).

## 결론 및 변경 사항
두 번의 실측(200건: 12분, 500건: 14분 45초) 모두 10분을 넘겼다는 공통
사실에 주목해, 배치 크기 미세조정으로 10분 안에 욱여넣기보다 **이 소스
전용으로 더 긴 타임아웃을 주는 쪽을 주된 해법으로 삼았다**(500건 배치
자체는 왕복 횟수를 줄이는 합리적 개선이라 유지).

- `scripts/ingest/lib/supabase-admin.mjs`: `SAFE_MERGE_UPSERT_BATCH_SIZE`
  (단일 상수)를 `SAFE_MERGE_UPSERT_BATCH_SIZE_BY_TABLE`(테이블별 값)로
  교체 — `events: 200`(기존 유지, 트리거/인덱스 비용 근거 그대로),
  `open_spaces: 500`(2026-08-22에 이 정확한 playground 데이터로 이미
  검증된 `UPSERT_BATCH_SIZE`와 동일 값 재사용). `SELECT_LOOKUP_BATCH_SIZE`
  (200, URL 길이 하드 제한)는 테이블과 무관하게 그대로 뒀다 — 안쪽 루프가
  바깥 배치 크기와 독립적으로 이미 200 단위로 재분할하므로 영향 없음.
- `scripts/ingest/run-monthly.mjs`: `STEPS` 배열 항목에 선택적
  `timeoutMs` 필드를 추가할 수 있게 하고, `LOCALDATA_PLAYGROUND` 항목에만
  `LOCALDATA_PLAYGROUND_STEP_TIMEOUT_MS = 25분`을 지정했다(실측 소요
  12~15분에 여유를 더함). 다른 모든 소스는 기존 `STEP_TIMEOUT_MS`(10분)를
  그대로 쓴다 — 이 소스만 다른 소스들과 자릿수가 다른 규모(8만여 건 vs
  수백~수천 건)라 개별 예외를 둘 근거가 명확하다.

## 검증
- `node --check`로 두 파일 구문 확인, `STEPS` 배열을 직접 import해
  `LOCALDATA_PLAYGROUND`에만 `timeoutMs: 1500000`이 설정됐음을 확인.
- `scripts/ingest/lib/supabase-admin.test.mjs`: 기존 "200건 단위 분할"
  테스트를 `events`(200건 유지, 회귀 방지)와 `open_spaces`(500건으로
  분할, 신규)로 분리해 재작성 — 29개 테스트 전부 통과.
- `npx tsc --noEmit` / `npm run test`(202개 파일 2,329개) /
  `npm run build` 모두 통과.
- 실측(운영 DB 대상): 전체 월간 배치 1회 수동 실행(20/22 성공) +
  `LOCALDATA_PLAYGROUND` 단독 재실행 2회(200건/500건 배치 각각)로 실제
  소요시간을 직접 측정.

## 특이 사항
- `DEDUPE_OPEN_SPACES`의 별도 statement timeout 실패는 이번 지시 범위
  밖이라 그대로 뒀다 — 다음에 이 배치를 돌릴 때(다음 정기 실행 또는
  수동 재실행) 재현되는지 지켜볼 사안.
- "목욕장업소"(이일천랜드 놀이방 포함 88건)는 여전히 16개 노출 중분류
  어디에도 매핑돼 있지 않다 — 스팟픽 카테고리 필터로는 찾을 수 없고
  기본 반경 지도에서만 보인다. 이건 이번 타임아웃 수정과 별개 사안이라
  손대지 않았다(필요하면 별도 지시로 진행).
