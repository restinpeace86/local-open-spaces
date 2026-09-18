# [target_audience 초등 학년 경계 재정의 — KIDS_SCHOOL/TEEN 규칙 수정]

## 구현 대상
`implementation/todo.md` [개선사항 1]의 후속 — 사용자가 "연령카테고리"는 신규
컬럼이 아니라 기존 `events.target_audience`를 가리키는 것이라고 확인했고, 그
TEEN/KIDS_SCHOOL 판정 규칙을 `scripts/ingest/lib/target-audience-taxonomy.mjs`의
기존 규칙에 대한 "수정 제안"으로 다시 정리해 달라고 요청했다.

사용자 지시 원문: "기존에 KIDS_SCHOOL이 초등학생을 명시적으로 가리켰다면 이젠
초등학교 저학년만 가리키는 걸로 할까 해서."

## 구현 일시
2026-09-18

## 확인된 규칙 (질문을 통해 확정, 추측하지 않음)
1. **학년이 명시되지 않은 "초등학생"(원본 데이터 대다수)**: 더 이상 KIDS_SCHOOL로
   자동 분류하지 않는다. NULL로 남긴다 — 사용자 원문: "현재 우리 대상일 수도
   있는 연령에 대하여서는 내가 직접 판단하려고 수동판단하기 위하여 분류하지
   않았어."
2. **"고학년" 신호로 인정할 범위**: 명시적 단어만("고학년", "4학년이상" 등).
   "4~6학년" 같은 숫자 범위만 있고 이 단어가 없으면 신호로 인정하지 않는다.

## 변경 사항: `scripts/ingest/lib/target-audience-taxonomy.mjs`

### KEYWORD_TAGS
KIDS_SCHOOL의 `include`에서 `'초등학생'`/`'초등'`을 제거했다(`'어린이'`/`'아동'`/
`'키즈'`만 남김 — 이 셋은 학년 개념이 없는 일반 아동 지칭이라 그대로 무조건
매칭 유지).

### 신규: `resolveElementaryGradeSignal(text, allowKidFamily)`
"초등"/"초등학생" 언급이 있을 때만 동작하는 전용 판정 함수:
- 고학년 명시 신호(`/고학년|4\s*학년\s*이상/`) → TEEN.
- 저학년 명시 신호(`/저학년/`, `allowKidFamily`일 때만) → KIDS_SCHOOL.
- 둘 다 없으면 null(판정 보류).

### `matchTag()`
KEYWORD_TAGS 루프보다 먼저 `resolveElementaryGradeSignal`을 확인한다. 신호가
없는 초등 언급은 루프를 통과한 뒤에도(다른 키워드 매칭 없었다면) 명시적으로 null을
반환해, 함수 끝의 일반 "학생" 폴백(TEEN)이 "초등학생"의 "학생" 부분만 보고 잘못
TEEN으로 단정하지 않도록 막았다.

### `resolveViaRawField()` — 실측으로 발견한 함정 수정
실제 원천 데이터(USETGTINFO 등)는 거의 항상 `"초등학생(4-6학년 학급..)"`처럼 학년
정보가 **괄호 안**에 있는데, 기존 `tokenize()`가 매칭 전에 괄호 내용을 통째로
지운다 — 그대로 두면 고학년/저학년 단어가 괄호 안에 있어도 절대 인식되지 않는다.
`tokenize()` 호출 전에 **원본 값 전체**에서 `resolveElementaryGradeSignal`을 먼저
실행해 두고, 토큰 매칭 결과가 null이면서 그 토큰이 "초등" 언급이면 이 사전 확인
결과로 대체하도록 고쳤다.

## 실측 라이브 데이터 검증 (적용 전 dry-run 필수 확인)
`resolveTargetAudienceForRow`를 `is_active=true`인 전체 이벤트(3,328건)에 대해
dry-run으로 돌려본 결과, 예상 밖으로 **이 규칙 변경과 무관한 대규모 배치 밀림
현상**을 함께 발견했다 — `applyTargetAudienceTaxonomy`가 2026-08-27 이후 한 번도
재실행되지 않아, 그 사이 새로 들어온 이벤트 다수가 미분류(NULL/OTHER) 상태로
쌓여 있었다(전체 재실행 시 NULL→ALL 913건, OTHER→ALL 173건 등 1,400건+ 변경
예상). 이 규칙 변경 자체(현재 KIDS_SCHOOL인 행)의 영향만 좁히면 46건이었다.

사용자에게 "초등 경계 46건만 좁게 적용" vs "백로그 포함 전체 재실행" vs "아직
적용 안 함" 중 선택을 물었고, **46건만 좁게 적용**을 선택받았다.

## 실제 반영 (프로덕션 DB)
`is_active=true AND target_audience='KIDS_SCHOOL'`인 149건만 조회해(전체
3,328건이 아니라) `resolveTargetAudienceForRow`를 재적용, MANUAL 46건은
그대로 보존하고 변경분만 UPDATE했다. `--dry-run`으로 먼저 확인 후 실행:

| 변경 | 건수 |
|---|---:|
| KIDS_SCHOOL → NULL(학년 미명시, 수동 판단 대기) | 31건 |
| KIDS_SCHOOL → ADULT | 5건 |
| KIDS_SCHOOL → TEEN(명시적 고학년 신호) | 4건 |
| KIDS_SCHOOL → KIDS_PRE | 2건 |
| KIDS_SCHOOL → ALL | 2건 |
| KIDS_SCHOOL → YOUTH | 1건 |
| KIDS_SCHOOL → FAMILY | 1건 |
| **합계** | **46건** |

2026-08-27 이후 밀린 나머지 백로그(1,400건+, 이번 규칙 변경과 무관)는 이번
범위에서 다루지 않았다 — 필요하면 별도로 지시받아 처리한다.

## 검증
- `npx tsc --noEmit`/`npm run test`(전체 166개 파일 1947개 테스트 — 신규 케이스
  11개: matchTag 고학년/저학년/숫자범위무시/allowKidFamily 조합 6개,
  resolveViaRawField 괄호 안 학년 신호 4개, resolveViaText 학년 신호 인식 2개
  등)/`npm run build` 모두 통과.
- 실제 프로덕션 DB에 `--dry-run` 먼저 실행해 예상 건수(46건) 확인 후 반영,
  반영 결과가 dry-run과 정확히 일치함을 확인했다.

## 특이 사항
- OTHER 판정 규칙("단체"/"여성"/"장애인" 키워드 관련, [개선사항 1] 원문 3절)은
  이번 범위에서 다루지 않았다 — 사용자가 이번 대화에서 확정한 것은 TEEN/
  KIDS_SCHOOL의 초등 학년 경계뿐이다.
- 2026-08-27 이후 `applyTargetAudienceTaxonomy`가 정기적으로 재실행되지 않아
  신규 이벤트가 계속 미분류로 쌓이는 구조적 공백이 있다는 사실을 이번 dry-run
  으로 재확인했다(2026-09-18 세션 앞부분에서 USETGTINFO=성인 케이스로 이미
  한 번 발견한 것과 같은 근본 원인) — 필요하면 이 배치를 정기 자동화할지 별도로
  확인 후 진행한다.
