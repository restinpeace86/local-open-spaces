# 이마트 컬처클럽 수동 노출 제외 기능

## 구현 대상
사용자 지시(2026-10-03): "관련해서 내가 일단 화면에 노출 배제할꺼 수동으로
체크할수 있어? 다른건 키즈꺼만 가져왔는데 Club Original은.. 섞여있어서 .어른께
더 많은편이야" — Club Originals(카테고리 코드 101)는 다른 4개 카테고리(With
Mom/Kids & Children 등)와 달리 키즈 전용이 아니라 성인 강좌(노래교실, 운동,
영어회화 등)가 섞여 있다는 걸 사용자가 실데이터로 확인했고, 관리자가 리뷰하며
개별 강좌를 수동으로 노출 제외 처리할 수 있어야 한다는 요청이다.

## 변경 사항
### 1. `scripts/migrations/2026-10-03-emart-culture-club-exclusion.sql`(적용 완료)
`emart_culture_club_classes`에 `is_excluded boolean not null default false` 추가.

### 2. `src/app/api/admin/emart-culture-club/route.ts`
`PATCH` 핸들러 추가: `{class_id, is_excluded}`를 받아 해당 행만 업데이트.
필수 파라미터 누락/타입 불일치는 400, DB 에러는 500.

### 3. `src/components/admin/emart-culture-club-panel.tsx`
테이블에 "노출 제외" 체크박스 컬럼 추가. 체크 시 낙관적으로 로컬 상태를
먼저 바꾸고 PATCH 호출 → 실패하면 체크 상태를 되돌리고 에러 메시지 표시.
제외된 행은 배경을 흐리게(`opacity-60`) + 강좌명에 취소선을 적용해 한눈에
구분되게 했다.

### 4. 안전성 검증 — upsert가 수동 제외 플래그를 덮어쓰지 않는지
목록/상세 배치(emart-culture-club.mjs, emart-culture-club-detail.mjs) 둘 다
`is_excluded` 컬럼을 upsert/update 페이로드에 포함하지 않는다. Supabase/
PostgREST의 upsert는 페이로드에 포함된 컬럼만 `ON CONFLICT DO UPDATE SET`
대상이 되고 나머지 컬럼은 건드리지 않는다는 표준 동작을 **실제로 재현해서
확인**했다(실제 행 하나를 `is_excluded=true`로 수동 설정 → 그 컬럼이 빠진
upsert 실행 → `is_excluded`가 그대로 `true`로 남아있는 것 확인 → 테스트 상태
원복). 즉 매일 배치가 재실행돼도 관리자가 체크한 노출 제외는 사라지지 않는다.

## 검증
- `npx vitest run emart-culture-club-panel.test.tsx`(8개, 체크박스 토글/실패
  롤백/기제외 표시 포함) + `route.test.ts`(4개, PATCH 핸들러) 전부 통과.
- `npx tsc --noEmit` / `npm run test`(256개 파일 2,685개) / `npm run build`
  전부 통과.
- 실제 프로덕션 DB로 upsert-보존 안전성 실측 검증(위 4번 항목).

## 특이 사항
- 제외된 강좌는 관리자 화면에서 사라지지 않고 흐리게 표시만 된다 — 체크 해제로
  언제든 되돌릴 수 있게 하기 위함(실수로 제외했을 때 복구 가능해야 함).
- 아직 "이 제외 플래그를 실제 유저 화면 쿼리에서 걸러내는" 로직은 없다(유저
  대상 상세페이지 자체가 아직 없기 때문) — 나중에 유저 기능을 만들 때
  `is_excluded = false` 조건을 추가하면 된다.
