# events upsert 간헐적 statement timeout 진단/수정

## 구현 대상
사용자 지시(2026-09-13):
> 어 왜 쿼리가 타임아웃나는지.. 원인 진단해서 고쳐줘.

(직전 대화: "오늘 신규 반영건이 events 0건인데 왜 0건인지 점검해줘" → SEOUL_YEYAK
소스가 오늘 두 번의 배치 실행 모두 "canceling statement due to statement
timeout"으로 events upsert에 실패했음을 확인한 것의 후속 조치.)

## 구현 일시
2026-09-13

## 진단(Supabase Management API로 프로덕션 DB 직접 조회 — 추측 아님)

### 1. `docs/pipeline-log.md` 실행 이력 확인
"canceling statement due to statement timeout" 에러가 SEOUL_YEYAK의 events
upsert 단계에서 최근 반복 발생(2026-09-12 01:21/06:04, 2026-09-13 04:53/05:28
전부 실패, 2026-09-11은 정상). 실패 시점이 `events.updated_at` 자동 갱신
트리거가 배포된 2026-09-12부터 클러스터링되는 것을 확인했다.

### 2. `events` 테이블 실측 통계
```
n_live_tup: 32,888   n_dead_tup: 0(정상, bloat 없음)
n_tup_ins: 32,872    n_tup_upd: 1,084,005    n_tup_hot_upd: 331,307
```
살아있는 행(3.3만 건)에 비해 누적 UPDATE 횟수(108만 건)가 압도적으로 많다 —
소스들이 "이미 있는 이벤트도 매일 다시 통째로 upsert"하는 재적재 패턴이라,
테이블 전체가 사실상 매일 여러 번씩 다시 쓰이고 있다.

### 3. `events` 인덱스 실측
21개 인덱스 중 trigram(GIN) 인덱스 3종이 존재: `idx_events_description_trgm`
(29MB, idx_scan **2**), `idx_events_title_trgm`(14MB, 145회), `idx_events_
venue_name_trgm`(7.2MB, 127회). 이 컬럼들 값이 바뀌는 UPDATE마다 이 인덱스들도
함께 유지비용이 든다 — 특히 description 인덱스는 읽기로는 거의 안 쓰이는데
(스캔 2회) 쓰기 비용은 계속 낸다.

### 4. `events.updated_at` 자동 갱신 트리거(2026-09-12, `set_updated_at()`)
`BEFORE UPDATE FOR EACH ROW`로 실행되며, `to_jsonb(new) - 'updated_at' -
'raw_data'`와 `to_jsonb(old) - 'updated_at' - 'raw_data'`를 매번 비교한다 —
UPDATE되는 모든 행에 대해 전체 컬럼 jsonb 직렬화+비교가 추가로 든다.

### 5. `run-daily.mjs` 실행 순서
```
GG_CULTURE_EVENTS → SEOUL_CULTURE_EVENTS(18,000+건) → TOUR_API_FESTIVAL → SEOUL_YEYAK(2,600여건)
```
SEOUL_YEYAK이 **가장 마지막**에 실행된다. 정작 행 수는 SEOUL_CULTURE_EVENTS가
훨씬 많은데(그리고 그쪽은 오늘도 성공), SEOUL_YEYAK만 반복적으로 타임아웃 나는
이유는 자기 자신의 데이터량이 아니라 "바로 앞에서 18,000여 건짜리 대량
upsert가 막 끝난 직후, 이미 부하를 받은 DB 상태에서 시작"하기 때문일 가능성이
높다(체크포인트/WAL 압박, 캐시 축출 등 — 앞선 대량 쓰기의 여파).

## 결론
근본 원인은 하나가 아니라 여러 요인이 겹친 것이다 — (a) 최근 추가된
updated_at 트리거의 행당 비교 비용, (b) 거의 안 쓰이는데 쓰기 비용만 내는
trigram 인덱스, (c) 실행 순서상 가장 마지막이라 DB가 이미 부하 받은 상태에서
시작. 이 중 (b)/(c)는 스키마 변경이나 파이프라인 재설계가 필요해 리스크가
크고, 이번 요청 범위를 넘어설 수 있어 손대지 않았다(제3장 제5조 추측 금지 —
"진짜 원인이 이거다"라고 단정하고 스키마를 바로 고치기보다, 확실하고 안전한
완화책부터 적용).

## 수정 — SafeMerge UPSERT 배치 크기 축소(500 → 200)
`scripts/ingest/lib/supabase-admin.mjs`의 `upsertRowsSafeMerge()`가 한 번의
SQL UPSERT 문에 담아 보내는 행 수를 500에서 200(이미 검증돼 쓰이고 있는
`SELECT_LOOKUP_BATCH_SIZE`와 동일한 값 — 새 숫자를 임의로 만들지 않음)으로
낮췄다. 이유:
- **statement_timeout은 "한 번의 SQL 문" 단위로 걸린다** — 문 하나가 처리하는
  행 수를 줄이면, 그 문에 실리는 트리거 실행 횟수/인덱스 유지 비용도 그만큼
  줄어 타임아웃 한도(2분) 안에 끝날 가능성이 높아진다.
- 스키마를 건드리지 않는 가장 안전하고 되돌리기 쉬운 완화책이다(상수 하나
  변경). 부작용은 "왕복 횟수가 늘어 총 소요 시간이 다소 늘 수 있다"는 정도인데,
  타임아웃으로 아예 실패하는 것보다는 명백히 낫다.
- `upsertRows()`(SafeMerge를 쓰지 않는 나머지 ~25개 단일 테이블 어댑터가 쓰는
  함수, `open_spaces` 등 이 트리거 문제가 없는 테이블에도 쓰임)는 그대로
  500을 유지해 영향 범위를 SafeMerge 경로로만 좁혔다.

## 검증
- `npx tsc --noEmit`: 통과(변경 파일은 `.mjs`라 타입 영향 없음, 나머지 전체
  통과 재확인).
- `npm run test -- --run`: 142 파일 / 1674건 전체 통과.
  - `scripts/ingest/lib/supabase-admin.test.mjs`: 배치 크기 변경에 맞춰
    "1200건 → 200건 단위 6배치" 기대값으로 갱신한 1건 포함, 전체 통과.
- `npm run build`: 성공.

## 특이 사항 — 다음에 더 살펴볼 만한 것(이번엔 손대지 않음)
- `idx_events_description_trgm`(29MB, 실제 조회 스캔 2회)처럼 쓰기 비용 대비
  읽기 효용이 낮아 보이는 인덱스를 정리하면 이 문제를 더 근본적으로 줄일 수
  있어 보인다 — 다만 스키마 변경이라 신중한 별도 검토(실제 검색 쿼리 플랜
  확인 등)가 필요해 이번 범위에 포함하지 않았다.
- SEOUL_YEYAK을 `run-daily.mjs` STEPS 순서에서 더 앞으로(대량 소스 이전으로)
  옮기면 "DB가 덜 부하 받은 상태에서 실행"되어 도움이 될 수 있다 — 이것도
  실행 순서를 바꾸는 것이라 별도로 검토·요청 시 진행하는 게 안전하다고
  판단해 이번엔 배치 크기 축소만 적용했다.
