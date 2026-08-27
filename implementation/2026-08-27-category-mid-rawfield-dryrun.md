# [1단계 중분류(Category Mid) raw_data 원천 필드 우선 탐색 및 Dry-run 시뮬레이션]

## 구현 대상
- `implementation/todo.md`의 "[1단계 중분류(Category Mid) raw_data 원천 필드 우선 탐색 및
  Dry-run 시뮬레이션]" 항목.

## 구현 일시
2026-08-27

## 0. 착수 전 확인 (Pre-check)
`implementation/todo.md`/`project/decision-log.md`를 확인한 결과 본 Task와 상충하는 홀드나
Decision을 발견하지 못했다. 본 Task는 지시문 자체가 "실제 DB 반영 전, 메모리상에서... Dry-run을
수행한다"로 명시된 순수 Read-Only 작업이라 이번에도 실제 DB 변경 없이 진행했다.

## 1. 용어 정정
지시문의 "중분류(Category Mid)"는 이 프로젝트의 실제 DB 컬럼 `category_min`
(`category_min_source`: `RAW`/`RULE`/`MANUAL`)을 가리킨다 — [카테고리 정제 & 어드민 확장]
(2026-08-26)에서 이미 구현된 기존 컬럼이며, 신규 컬럼을 추가하지 않았다.

## 2. 시뮬레이션 스크립트
`scripts/simulations/category_mid_dryrun.mjs` (신규, Read-Only — SELECT만 수행).
지시문은 `.ts` 확장자를 지정했으나, 이 프로젝트의 `scripts/` 하위는 전부 순수 Node ESM
(`.mjs`)이고 standalone `.ts`를 직접 실행할 tsx/ts-node 등이 devDependencies에 없어(확인
완료), 기존 관례(제5장 제4조 기존 구조 우선)를 따라 `.mjs`로 작성했다.

- `events.is_active = true` 3,560건 전수를 `source`별로 스캔해 `raw_data` 키 구성을 실측
  탐색(0순위 원천 필드 동적 탐색).
- 발견된 후보 필드: `seoul_public_reservation`→`MINCLASSNM`(이미 승인된 0순위 규칙),
  `seoul_public_culture`→`CODENAME`/`THEMECODE`(미활용), `gg_public`→`CATEGORY_NM`(대분류
  수준으로 부적합), `tourapi_4.0`→`cat1~3`/`lclsSystm1~3`(공식 코드표 필요).
- 승인된 0순위 규칙(MINCLASSNM) 재적용 시뮬레이션과, 미승인 제안(CODENAME→표준 중분류)
  시뮬레이션을 분리해 각각의 NULL 해소 효과를 산출.

## 3. 실행 결과 (Read-Only, DB 미반영)
상세 리포트: `docs/category-mid-rawfield-dryrun-report.md`

| 단계 | NULL 잔여 | 비율 |
| :--- | ---: | ---: |
| 현재 | 1,459건 | 40.98% |
| + 승인된 0순위 규칙(MINCLASSNM) 재적용 | 363건 | 10.20% |
| + (승인 대기) CODENAME 제안 매핑까지 반영 시 | 93건 | 2.61% |

핵심 발견:
1. `seoul_public_reservation`의 NULL 1,096건 전수가 이미 `MINCLASSNM` 값을 보유하고 있음에도
   현재 `category_min`이 채워지지 않은 상태 — 승인된 설계가 이 데이터에는 적용되지 않았음을
   실측으로 확인(원인 조사는 이번 Task 범위 밖).
2. 같은 소스에서 RULE(텍스트 매칭)로 채워진 778건 중 401건(51.5%)은 `MINCLASSNM`과 최종값이
   완전히 동일 — 원천 필드를 0순위로 먼저 봤다면 텍스트 매칭 없이 즉시 분류 가능했던 건들.
3. `seoul_public_culture`는 `CODENAME` 원천 필드를 전혀 참고하지 않아, 동일 장르(예: "교육/
   체험")가 최대 8종의 서로 다른 중분류로 산발적으로 매칭되는 비일관성을 확인(일치율 0/148).
   CODENAME→표준 중분류 제안 매핑(초안)을 리포트에 남기고 실제 반영은 하지 않음(승인 대기).
4. `gg_public`(CATEGORY_NM 4종뿐, 대분류 수준)과 `tourapi_4.0`(공식 코드표 미확보)은 매핑
   시도 없이 보류로 명시.

## 4. 검증
- `npx tsc --noEmit`: clean.
- `node scripts/simulations/category_mid_dryrun.mjs` 직접 실행으로 위 수치 실측 확인, 실제
  DB에는 어떠한 UPDATE도 실행하지 않았음을 스크립트 로직상으로도 확인(전 구간 `.select()`만
  사용, `.update()`/`.upsert()` 호출 없음).

## 5. 대표 승인 요청 (실행하지 않고 보고만 남김)
`docs/category-mid-rawfield-dryrun-report.md` 6절 참고 — (1) MINCLASSNM 0순위 규칙 미적용
원인 조사 및 재적용, (2) CODENAME→표준 중분류 제안 매핑 확정, (3) gg_public/tourapi_4.0 보류
확인, 3건 모두 대표 승인 대기 상태로 남긴다(임의 확정 안 함).
