# 관리자/테스트 계정 등급 고정 (grade_override)

## 구현 대상
사용자 지시(2026-10-03): "이 계정.. 현재 내 계정은 관리자 계정이니 그냥
예외처리로 파워맘으로 해줘 모든 기능들 볼수있어야할거아니야" — 직전
대화에서 다루던 계정(goodguy0515@gmail.com, 닉네임 "하린맘")을 실적 계산과
무관하게 영구적으로 파워맘으로 고정해달라는 지시.

## 변경 사항
### 1. `scripts/migrations/2026-10-03-mom-pick-grade-override.sql`
`profiles.grade_override text`(nullable, `grade`와 동일한 CHECK 제약) 추가.
not null이면 배치가 실적 재계산을 건너뛰고 그 값을 그대로 쓴다 — 배치
코드 안에 유저ID를 하드코딩해 숨기는 대신, 테이블 자체에 "이 계정은
예외"라는 사실이 드러나게 했다(제5장 제6조 하드코딩 최소화 — 숨겨진
하드코딩보다 투명한 컬럼). 같은 마이그레이션에서 해당 계정을
`grade_override='power', grade='power'`로 즉시 설정했다.

### 2. `scripts/ingest/mom-pick-grade-batch.mjs`
- `grade_override`가 있는 프로필은 실적 계산(calculateGrade 호출 자체)을
  완전히 건너뛰고, `grade`가 `grade_override`와 다를 때만 동기화 업데이트
  한다(관리자가 나중에 `grade_override` 값을 바꾸면 다음 배치 때 자동
  반영되도록).
- 파워맘 정원 선발 대상(`excellentEligible`)에서도 `grade_override`가 있는
  계정은 제외한다 — 실적으로 뽑힌 게 아니므로 진짜 우수맘들의 정원을
  깎아먹지 않게.

## 검증
- `npx tsc --noEmit` / `npm run test`(263개 파일 2,750개) / `npm run build`
  전부 통과.
- 마이그레이션 적용 후 실제 재조회: 해당 계정이 `grade: 'power'`,
  `grade_override: 'power'`로 정상 반영됨을 확인.
- 배치 재실행: 0건 변경으로 정상 종료(이미 override와 grade가 일치하므로
  건드리지 않음 — 다음 날 배치가 돌아도 강등되지 않는다는 의미).

## 특이 사항
- "현재 내 계정"으로 지칭한 것을 직전 대화에서 다루던 goodguy0515@gmail.com
  (하린맘) 계정으로 해석해 적용했다 — 만약 사용자가 다른 계정
  (goodguy10r@naver.com 등)을 의도한 것이라면 알려주면 그쪽에도 동일하게
  적용한다.
- 이 고정은 맘스픽 등급 시스템(`profiles.grade`) 범위에서만 유효하다 —
  `/admin`, `/hq` 같은 관리자 패널은 등급과 무관한 별도 인증 체계라 이번
  변경과 관계없다.
