# 우수맘 달성 조건 변경 — "월 5회 글쓰기" → "월 5개 스팟 사진 포함 리뷰" (Decision 026)

## 구현 대상
사용자 지시(2026-10-03): "월 5개 스팟 리뷰(이미지 포함)인거야.. 관리자
수동승인 변경까진 모르겠네 일단 냅둬..." — 최초 지시(판정 기준 + 관리자
수동 검수 전환)가 Decision 019와 충돌해 스킵했던 것 중, **판정 기준
변경만** 사용자가 명시적으로 재확인했다(Decision 026으로 승인). 관리자
수동 검수 전환은 계속 보류.

## 변경 사항
### 1. DB — `get_monthly_mom_pick_activity()` RPC 재생성
`scripts/migrations/2026-10-03-mom-pick-excellent-grade-spot-photo-
review.sql`: `spot_photo_review_count`(이번 달, `spot_id is not null and
photo_urls`가 비어있지 않은 행을 `spot_id` 기준 **distinct** 집계 — 동일
스팟 중복 작성은 1개로만 집계)를 추가 반환하도록 `drop function` 후
재생성(Postgres는 `create or replace`로 반환 컬럼 집합을 못 바꿔서 drop이
필요했다). 적용 완료, 실측 재조회로 정상 동작 확인.

### 2. `calculateGrade()` 시그니처 변경 (두 독립 구현 모두)
`src/lib/community/grades.ts` / `scripts/ingest/lib/mom-pick-grade-calc.mjs`:
`monthlySpotPhotoReviewCount` 파라미터 추가. 열심맘은 그대로
`monthlyPostCount >= 2`, 우수맘/파워맘은 `monthlySpotPhotoReviewCount >= 5`로
판정 기준 교체.

### 3. `scripts/ingest/mom-pick-grade-batch.mjs`
파워맘 정원 선발 필터를 `post_count >= 5` → `spot_photo_review_count >= 5`로
변경(파워맘은 우수맘 조건을 만족하는 사람 중 선발이므로 기준이 바뀌면 같이
바뀌어야 함). 로그 메시지에 스팟 리뷰 수도 함께 출력.

### 4. `spec/community/mom-pick-grades.md` 개정
1절 등급 매트릭스 우수맘 행과 2.4절 등급 산정 규칙 설명을 새 기준으로
갱신, 관리자 수동 검수는 보류 상태임을 명시.

### 5. `project/decision-log.md` — Decision 026 추가
Decision 019 1·2.4항을 개정하는 공식 Decision으로 기록(맥락/스킵 경위/
부분 재확인/변경 내용/이유/영향).

## 검증
- `src/lib/community/grades.test.ts`(갱신 — 새 파라미터 반영, "글 건수만으론
  우수맘 달성 불가" 회귀 테스트 추가) / `scripts/ingest/lib/mom-pick-grade-
  calc.test.mjs`(동일하게 갱신) 전부 통과.
- `npx tsc --noEmit` / `npm run test`(261개 파일 2,723개) / `npm run build`
  전부 통과.
- 마이그레이션 적용 후 실제 RPC 재조회: 반환 컬럼에 `spot_photo_review_count`
  정상 포함. 월 경계 로직 실측 확인 — `mom_pick_posts` 전체 5건(전부 9월,
  동일 작성자, 5개의 서로 다른 스팟+사진 포함)이 10월 기준 RPC에서는 0건으로
  정확히 제외됨(지난달 실적이 이번 달 집계에 새지 않음 확인).
- `node scripts/ingest/mom-pick-grade-batch.mjs` 실제 실행 — 새 RPC/
  calculateGrade 시그니처로 에러 없이 완료(대상 1명, 변경 0명 — 9월 실적이
  10월에 반영되지 않는 게 맞으므로 예상된 결과).

## 특이 사항
- 스펙 표에 있던 "(또는 채택·좋아요 누적 기여도)" 대안 경로는 실측 확인
  결과 처음부터 구현된 적이 없었다(배치 코드가 순수 글 건수만 썼음) — 이번
  정리에서 스펙 문구도 같이 제거했다(존재하지 않는 경로를 스펙에 남겨두지
  않음).
- 관리자 수동 검수 전환은 여전히 미확정 — 지금은 자동 배치가 그대로
  매일 재계산한다. 수동 검수로 바꾸려면 최소 (a) 검수 대기 상태를 어디에
  저장할지, (b) 어드민 UI 범위, (c) 수동 승인 전까지 유저에게 "대기중"으로
  보일지 여부를 먼저 확정해야 한다(사용자가 아직 답하지 않은 질문들).
