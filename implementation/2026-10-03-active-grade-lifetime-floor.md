# 열심맘 영구 달성으로 변경 (Decision 027)

## 구현 대상
실제 사용자 제보: "이상하네 나 왜 새싹맘이지? 내가 쓴 후기가 총 5건인데?"
→ 실측 확인(이메일로 계정 조회) 결과 5건 전부 지난달(9월) 작성, 이번 달
0건이라 Decision 019의 월별 즉시 강등 원칙에 따라 새싹맘으로 내려간 것.
사용자 반응: "우수맘 빼고는 그냥 매월 안하고 한번만 횟수채워도 되는거
아니야?" → Decision 027로 승인, 구현.

## 실측 확인 과정
1. `auth.admin.listUsers()`로 제공된 이메일(goodguy10r@naver.com) 계정을
   먼저 조회 — 글 0건, signed_up. 사용자가 말한 내용과 안 맞음.
2. 전체 `mom_pick_posts` 작성자별 집계 → 유일한 작성자(5건)는 다른 이메일
   (goodguy0515@gmail.com, 닉네임 "하린맘")의 계정이었음 — 동일인의 복수
   로그인 수단으로 추정.
3. 그 계정의 글 5건 전부 `created_at`이 9월(9/13~9/14)임을 확인, 현재가
   10월이라 "달력월 기준" 집계에서 0건으로 잡히는 게 새싹맘 강등의 직접
   원인임을 실측으로 확정.

## 변경 사항
### 1. DB — `scripts/migrations/2026-10-03-mom-pick-active-grade-lifetime-floor.sql`
- RPC `get_monthly_mom_pick_activity()` → `get_mom_pick_activity_summary()`로
  개명(오늘 세 번째 수정이라 이번에 실제 역할에 맞게 바로잡음), 반환에
  `lifetime_post_count`(평생 누적 글 수, 날짜 필터 없음) 추가.
- 신규 트리거 `promote_to_active_on_lifetime_second_post`:
  `promote_to_sprout_on_first_post`(2026-09-02)와 동일한 패턴 — 평생 누적
  글이 2건째 저장되는 즉시 `signed_up`/`sprout` → `active`로 승급시킨다.
- 기존 데이터 백필: 이미 평생 누적 2건 이상인데 아직 새싹맘에 머문 유저를
  즉시 승급(제보 계정 포함).

### 2. `src/lib/community/grades.ts` / `scripts/ingest/lib/mom-pick-grade-calc.mjs`
`calculateGrade()`의 `monthlyPostCount` 파라미터를 `hasReachedActiveLifetime`
(boolean, 평생 누적 2건 이상 여부)으로 교체. 우수맘/파워맘 판정
(`monthlySpotPhotoReviewCount`)은 그대로 매월 재평가.

### 3. `scripts/ingest/mom-pick-grade-batch.mjs`
새 RPC(`get_mom_pick_activity_summary`)와 `lifetime_post_count` 필드를
쓰도록 갱신. 배치는 여전히 모든 sprout 이상 프로필을 매일 재계산하지만,
이제 `hasReachedActiveLifetime`이 한 번 true가 되면 계속 true이므로 자연히
active 밑으로 강등시키지 않는다(별도 보호 로직 불필요 — calculateGrade
자체가 그렇게 동작).

### 4. Spec/Decision 갱신
`spec/community/mom-pick-grades.md` 1절·2.4절, `project/decision-log.md`
Decision 027 추가.

## 검증
- `src/lib/community/grades.test.ts`/`scripts/ingest/lib/mom-pick-grade-
  calc.test.mjs` 갱신 — 특히 "지난달에 5건을 썼어도 이번 달 0건이면
  여전히 active(새싹맘으로 강등 안 됨)" 회귀 테스트 추가(실제 버그
  리포트를 그대로 재현).
- `npx tsc --noEmit` / `npm run test`(263개 파일 2,750개) / `npm run build`
  전부 통과.
- **실측 — 마이그레이션 적용 직후**: 제보 계정("하린맘")을 재조회해
  `grade: 'active'`로 즉시 백필됐음을 확인.
- **실측 — 신규 트리거 종단 검증**: 테스트 계정(tmp-seed-farm-a, signed_up)
  으로 실제 글을 2건 작성 — 1번째 작성 후 `sprout`, 2번째 작성 후 즉시
  `active`로 전이됨을 확인. 이후 작성한 테스트 데이터와 등급을 원상 복구.
- **실측 — 배치 재실행**: `node scripts/ingest/mom-pick-grade-batch.mjs`를
  실제로 다시 실행 — 이제 열심맘 계정은 이번 달 실적이 0이어도 재강등되지
  않고 0건 변경으로 정상 종료됨을 확인(마이그레이션 전이었다면 이 배치가
  돌 때마다 새싹맘으로 되돌아갔을 상황).

## 특이 사항
- 조사 과정에서 사용자가 동일인 소유로 보이는 계정 2개(Naver/Gmail)를 쓰고
  있음을 발견해 알려줬다 — 계정 정리는 사용자 본인의 영역이라 손대지 않았다.
