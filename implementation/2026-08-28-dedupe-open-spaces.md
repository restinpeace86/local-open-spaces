# [open_spaces 중복 데이터 정제] 교차 출처 중복 식별 + 정리 + 재발 방지

## 요구사항
1. `open_spaces` 테이블에서 위경도 완전 동일 또는 이름/주소가 겹치는 중복 데이터를
   식별·정리하는 스크립트/쿼리 작성. 향후 수집에서도 같은 중복이 계속 쌓이지 않도록
   업서트 기준/고유 식별 로직 보완.
2. 단, "일부 필드가 비어있어도 버리지 않고 일단 적재한다"는 기존 유연한 수집 원칙은
   절대 훼손하지 말 것. 정제는 오직 "명백하게 겹치는 중복"만 대상으로 할 것.

## 구현 일시
2026-08-28

## 실측 조사 과정과 핵심 발견
1. 1차 조사(단순 `.range()` 오프셋 페이지네이션)에서 "위경도 동일 그룹 35,972개"라는
   결과를 얻었으나, `.order()` 없이 `.range()`만 쓰면 페이지 경계에서 같은 행이 중복
   반환될 수 있다는 걸 뒤늦게 발견(같은 id가 그룹 안에 두 번 나타남) — `id` 기준 keyset
   페이지네이션(`WHERE id > lastId ORDER BY id LIMIT N`)으로 재조사해 정확한 수치를
   다시 얻었다(오프셋 방식은 13만 건대에서 뒷페이지로 갈수록 statement timeout까지
   발생시켜 이래저래 부적합했다).
2. 재조사 결과 "좌표+이름 동일" 14,439그룹 중 이름까지 완전 동일한 것은 225그룹뿐이었고,
   나머지 14,214그룹은 이름이 서로 다른 별개 장소였다(같은 아파트 단지 안 여러 놀이터가
   단지 대표 좌표를 공유하는 식) — 좌표 일치만으로는 절대 중복 판정에 못 쓴다는 걸 확인.
3. "이름+주소 완전 동일" 조건도 그대로 쓰면 위험했다 — `seoul_public_reservation` 소스의
   "삼청테니스장 코트이용(야간)" 9건이 이름도 주소도 똑같아 걸렸는데, 실제로는 address가
   빈 문자열(`''`)이라 "빈 문자열끼리 우연히 일치"한 가짜 신호였다(좌표는 동일 — 같은
   물리적 코트+서비스가 SVCID만 다르게 반복 등록된 것으로 추정되나, 이건 좌표+이름
   기준으로도 걸리므로 문제 없음).
4. 가장 중요한 반례: `LOCALDATA_PLAYGROUND`(전국어린이놀이시설정보)는 어댑터 자체 주석에
   "pfctSn(시설일련번호)이 전국 단위로 유일함"이 문서화돼 있다 — 즉 좌표/이름이 완전히
   같아도(같은 아파트 단지 대표 좌표+단지명) 각 행은 정부 등록부 기준 서로 다른 진짜
   놀이터(동별로 별도 설치)다. 이걸 중복으로 지우면 실제 콘텐츠를 파괴하게 된다.
5. 결론: "명백한 중복"은 **서로 다른 2개 이상의 source_type(교차 출처)이 같은 좌표+이름
   또는 같은 이름+비어있지-않은-주소로 겹치는 경우**로만 한정한다. 단일 source_type 내부
   반복은(위 4번 반례 때문에) 안전하게 판별할 근거가 없어 전부 제외했다.
6. 이 기준으로 실측: 139,461건 중 828개 그룹(1,685건)이 교차 출처 중복으로 확인됨(예:
   "선화랑"이 `KOR_TOUR_API_V4`와 `CULTURE_FACILITY` 양쪽에 동일 좌표/이름으로 존재).

## 변경 사항
- `scripts/ingest/lib/dedupe-open-spaces.mjs` (신규):
  - `findOpenSpacesDuplicateGroups(rows)` — 순수 함수. Union-Find로 (좌표+이름) 또는
    (이름+주소) 기준 그룹을 찾되, 그룹 내 `source_type`이 2개 이상 섞인 경우에만 병합한다.
    각 그룹은 `created_at` 오름차순으로 정렬해 반환(첫 번째가 survivor).
  - `dedupeOpenSpaces({ dryRun }, client)` — 오케스트레이터. id 기준 keyset 페이지네이션으로
    전체 조회 → 그룹 판정 → survivor의 빈 필드만 다른 행 값으로 채우는 patch 계산(Decision
    017의 "NULL 병합" 관례와 동일 철학, 기존 값은 절대 덮어쓰지 않음) → 실제 실행 시
    삭제 전 그룹 전체(survivor+losers, raw_data 제외)를 `docs/dedupe-backups/`에 타임스탬프
    JSON으로 먼저 기록(raw_data는 Decision 017의 `raw_ingest_data` 테이블이 이미 영구
    보존하므로 중복 백업하지 않음) → survivor UPDATE(병합) → 나머지 DELETE.
- `scripts/ingest/lib/dedupe-open-spaces.test.mjs` (신규, 7건): 교차 출처 판정, 단일 출처
  반복 제외(LOCALDATA_PLAYGROUND 반례 재현), 빈 문자열 주소 오탐 방지, 전이적 그룹 병합,
  이름 다르면 좌표 같아도 제외, 무중복 케이스.
- `scripts/migrations/2026-08-28-dedupe-open-spaces.mjs` (신규): 1회성 정제 실행 CLI
  (`--dry-run` 지원).
- `scripts/ingest/run-daily.mjs`, `scripts/ingest/run-monthly.mjs`: 배치 종료 시점에
  `DEDUPE_OPEN_SPACES` 후처리 단계 추가(`ANALYZE_OPEN_SPACES` 직전) — 앞으로도 서로 다른
  어댑터가 같은 실제 장소를 각자 수집해 넣더라도 배치 후처리에서 자동으로 정리된다.
  **각 어댑터의 개별 upsert/insert 로직은 전혀 건드리지 않았다** — "유연하게 적재한다"
  원칙은 그대로 유지하고, 적재 이후 시점에서만 개입한다.

## 왜 업서트 키 자체를 바꾸지 않았는가
교차 출처 중복은 서로 다른 어댑터가 각자 독립적인 external_id 스킴(예: `KOR_TOUR_API_V4_*`
vs `CULTURE_SPACE_*`)을 쓰기 때문에 발생한다 — 애초에 `external_id` 기준
`ON CONFLICT`로는 원천 차단이 불가능한 종류의 중복이다(한 어댑터가 다른 어댑터의 ID
체계를 알 수 없음). 적재 시점에 "이 값과 비슷해 보이면 넣지 않는다"는 로직을 넣는 것은
오탐 위험이 크고(위 LOCALDATA_PLAYGROUND 반례) "유연한 적재" 원칙과 정면으로 충돌하므로,
대신 적재는 그대로 두고 배치 후처리에서 사후 정리하는 구조를 택했다.

## 검증
- `npx tsc --noEmit`: clean.
- `npm run test`: 50개 파일 533건 통과(신규 7건 포함).
- `npm run build`: 성공, 라우트 변화 없음.
- dry-run 실측(사전): `{ totalRows: 139461, groupCount: 828, toUpdateCount: 342,
  toDeleteCount: 857 }`.
- 실제 실행 결과: `{ totalRows: 139461, groupCount: 828, updated: 342, deleted: 857,
  backupFile: "docs/dedupe-backups/2026-08-28T10-37-24-065Z-open-spaces-dedup.json" }`
  — dry-run과 정확히 일치.
- 백업 파일 생성 확인(약 690KB, 828개 그룹의 survivor+losers 식별 정보 전체 기록).
- 실행 후 재검증(dry-run 재실행): `{ totalRows: 138604, groupCount: 0, toUpdateCount: 0,
  toDeleteCount: 0 }` — 전체 행 수가 정확히 857건 감소했고(139461→138604), 남은 중복
  그룹이 0건임을 확인.

## 특이 사항
- `open_spaces`에는 `is_active` 같은 소프트 삭제 컬럼이 없어 이번 정제는 하드 DELETE다.
  삭제 전 전체 그룹 데이터(식별자/이름/주소/생성시각)를 JSON 백업 파일로 남겨 복구 근거를
  확보했다(원본 raw_data는 `raw_ingest_data` 테이블에 영구 보존되어 있어 필요 시 참조 가능).
- 사용자에게 실행 전 명시적으로 확인받은 뒤(중복 판정 기준과 하드 삭제라는 점을 모두
  설명) 진행했다.
- 단일 출처 내부 반복(예: `seoul_public_reservation`의 "삼청테니스장" 9건 재등록 패턴)은
  이번 정제 대상에서 제외했다 — 안전하다는 근거가 없어 추측하지 않았다.
