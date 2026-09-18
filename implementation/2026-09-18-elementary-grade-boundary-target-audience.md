# [target_audience — OTHER/TEEN 원천 필드 직접 반영] (수정 이력 포함)

## 구현 대상
`implementation/todo.md` [개선사항 1]의 후속 — 613개 USETGTINFO 값에 대해 사용자가
직접 명시한 규칙만 반영한다: **OTHER**(단체/여성/장애인 키워드), **TEEN**(고학년/
4학년이상 명시 키워드). 그 외에는 아무것도 넣지 않는다.

## 구현 일시
2026-09-18 ~ 2026-09-19(1차 구현의 방향 오류를 사용자 지적으로 발견해 되돌리고
재구현)

## ⚠️ 1차 구현의 방향 오류 (되돌림)
처음에는 이 규칙을 `scripts/ingest/lib/target-audience-taxonomy.mjs`(모든 이벤트에
광범위하게 쓰이는 공용 키워드 매칭 엔진)에 반영했다 — KIDS_SCHOOL의 `include`에서
"초등"/"초등학생"을 빼고 명시적 고학년/저학년 신호로만 판정하도록 고쳤다.

**사용자 지적(2026-09-19)**: "613건에 연령대로 나온거 관련하여 내가 직접적으로
명시하고 작성한 것들 외에 아무것도 안작성한거는 아무것도 넣지 않는걸로? 현재 나는
kids_school이라던가 infant, family, kids_pre 관련 아무것도 작성한게 없는데? 저렇게
들어가는건 없어야해."

**문제**: "초등"을 KIDS_SCHOOL의 무조건 매칭에서 빼자, 같은 텍스트에 함께 있던
**기존의 다른 무관한 규칙**(가족→FAMILY, 유아→KIDS_PRE, 청년→YOUTH, 제한없음→ALL
등, 전부 2026-08-27부터 있던 기존 코드)이 대신 매칭돼 KIDS_PRE/FAMILY/YOUTH/ALL
같은 **사용자가 지정한 적 없는 값**이 46건 중 일부에 들어갔다(FAMILY 1건, KIDS_PRE
2건, YOUTH 1건, ALL 2건, TEEN 4건, NULL 31건, ADULT 5건). 공용 엔진을 건드리면
사용자가 명시하지 않은 다른 규칙의 부작용을 피할 수 없다는 걸 이번에 배웠다 —
2026-09-18 오전 "USETGTINFO=성인→ADULT"는 이 공용 엔진을 건드리지 않고 어댑터
레벨에서 딱 그 값만 좁게 썼는데, 이번엔 그 원칙을 지키지 않았다.

### 되돌리기
1. `scripts/ingest/lib/target-audience-taxonomy.mjs`/`.test.mjs`를 커밋 `7472c5f`
   시점(수정 전)으로 되돌렸다(`git checkout 7472c5f -- <두 파일>`).
2. 라이브 DB에 반영했던 46건을 정확히 식별해 복구했다 — 개별 행의 이전
   `target_audience_source`를 따로 저장해두지 않아, `updated_at` 타임스탬프로
   정확한 46건(2026-09-18T14:55:36~42, 6초 이내 일괄 업데이트 클러스터, 다른
   배치와 명확히 구분됨)을 특정한 뒤, **되돌린(원래) 코드**로
   `resolveTargetAudienceForRow`를 재실행해 그 결과를 그대로 반영했다(강제로
   KIDS_SCHOOL로 되돌린 게 아니라 "원래 로직이 지금 데이터로 뭐라고 판단하는지"를
   그대로 신뢰) — 46건 중 42건은 KIDS_SCHOOL로 복구됐고, 4건("[한성백제박물관]
   초등 4~6학년..." 계열)은 설명문에 "강사"라는 기존 NEGATIVE_OVERRIDE_KEYWORDS
   단어가 있어 원래 로직으로도 TEEN(3건)/NULL(1건)이 나왔다 — 이는 버그가 아니라
   2026-08-27 이후 description이 갱신되며 생긴 자연스러운 데이터 드리프트임을
   직접 확인했다. 복구 후 `is_active=true AND target_audience='KIDS_SCHOOL'`
   건수가 정확히 145건(149 - 4)으로 일치함을 확인했다.

## ✅ 최종 구현 (올바른 방향)
공용 엔진은 전혀 건드리지 않고, `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`에
어제(2026-09-18) 만든 "USETGTINFO=성인→ADULT" 직접 판정과 **완전히 동일한 패턴**으로
`classifyTargetAudienceFromUseTgtInfo()` 함수를 확장했다:

```js
function classifyTargetAudienceFromUseTgtInfo(useTgtInfo) {
  if (typeof useTgtInfo !== 'string' || !useTgtInfo.trim()) return null;
  if (useTgtInfo === '성인') return 'ADULT';
  if (/단체|여성|장애인/.test(useTgtInfo)) return 'OTHER';
  if (/고학년|4\s*학년\s*이상/.test(useTgtInfo)) return 'TEEN';
  return null;
}
```

KIDS_SCHOOL/INFANT/FAMILY/KIDS_PRE 등은 이 함수가 절대 반환하지 않는다 — 사용자가
명시한 4가지(ADULT/OTHER/TEEN/그 외 null)만 존재한다. "저학년→KIDS_SCHOOL" 규칙도
사용자가 최종적으로 "지우기(OTHER/TEEN 2개만)"를 선택해 넣지 않았다.

## 기존 적재분 백필
`scripts/migrations/2026-09-19-seoul-yeyak-other-teen-backfill.mjs` — `source=
'seoul_public_reservation' AND target_audience IS NULL`인 행(3,088건)을 스캔해
`classifyTargetAudienceFromUseTgtInfo`가 OTHER/TEEN을 반환하는 것만 반영:
- OTHER: 127건
- TEEN: 4건

## 검증
- `npx tsc --noEmit`/`npm run test`(전체 166개 파일 1944개 테스트 —
  target-audience-taxonomy.mjs는 원래 34개 테스트로 완전히 복원, seoul-yeyak-adapter
  신규 케이스 11개: OTHER/TEEN 판정 4개 + classifyTargetAudienceFromUseTgtInfo
  단위 테스트 5개 + KIDS_SCHOOL 등 미판정 확인 2개)/`npm run build` 모두 통과.
- 백필 스크립트를 `--dry-run` 먼저 실행해 예상 건수(OTHER 127/TEEN 4) 확인 후 반영.

## 특이 사항 / 교훈
공용으로 널리 쓰이는 키워드 매칭 엔진(target-audience-taxonomy.mjs)을 수정할 때는
"내가 지운 규칙 자리를 다른 기존 규칙이 대신 채우지 않는지"를 항상 확인해야 한다.
좁게 지정된 요구사항(특정 소스의 특정 필드에 대한 특정 규칙)은 그 소스의 어댑터
레벨에서 직접 판정하는 것이 안전하다(제5장 제4조와도 부합 — 기존 공용 구조를
"재사용"하는 것과 "그 구조 자체를 변형해 부작용을 감수하는 것"은 다르다).
