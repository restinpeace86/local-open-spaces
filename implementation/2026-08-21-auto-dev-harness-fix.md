# auto-dev.bat 원격 자율 실행 하네스 점검 및 수정

## 구현 대상
- 사용자 요청: "auto-dev.bat을 통해 implementation/todo.md를 주기적으로 내려받아 명령 수행"이 실제로 정상 작동하는지 점검

## 구현 일시
2026-08-21

## 점검 결과 — 두 가지 문제 발견

### 1. 의존 스크립트 누락 (즉시 실패 원인)
`auto-dev.bat`이 호출하는 `scripts/check-db.mjs`, `scripts/notify-error.mjs`가 실제로는 이 저장소에 존재하지 않았음. BetterLiving 프로젝트에서 `auto-dev.bat`만 그대로 복사되고 두 의존 스크립트는 포팅되지 않은 상태였음 — 루프가 돌 때마다 `node scripts/check-db.mjs`에서 "파일 없음" 오류로 즉시 `ERR_DB`로 빠지고, 뒤이어 호출하는 `notify-error.mjs`도 없어서 에러 알림조차 못 보내는 상태였음.

### 2. 성공/실패 판정 로직 버그 (더 심각한 문제)
`git status --porcelain` 결과가 비어있으면("변경 없음") `WAIT_SPEC`(문제 알림) 분기로 가도록 되어 있었음. 그러나 CLAUDE.md의 자율 하네스 규칙상 Claude는 작업 완료 후 **항상 스스로 커밋+푸시까지 마치므로**, 정상적으로 작업이 끝난 직후에는 `git status --porcelain`이 항상 비어있는 것이 정상임. 즉 **성공한 모든 사이클마다 거꾸로 "멈춘 것 같다"는 거짓 알림이 발송되는 구조**였음. 실제로 이번 세션의 모든 커밋 직후 상태를 재현해 확인함 (`git status --porcelain` 항상 empty).

## 변경 사항
- `scripts/check-db.mjs` 신규: Supabase REST 엔드포인트 reachability 확인 (BetterLiving 버전을 `scripts/lib/load-env.mjs` 기반으로 이식, `dotenv` 의존성 추가하지 않음)
- `scripts/notify-error.mjs` 신규: 동일 방식으로 이식, 타이틀/푸터를 `[local-open-spaces]`로 변경
- `auto-dev.bat`: 완료 판정 로직을 `git status --porcelain` 기반에서 **`git rev-parse HEAD` 커밋 해시 비교** 방식으로 교체. Claude 실행 전후 HEAD 해시를 비교해 실제로 새 커밋이 생겼는지(=원격에 푸시됐는지)를 정확히 판정하도록 수정

## 검증 결과
- `node scripts/check-db.mjs` 단독 실행: 실제 Supabase에 정상 연결 확인 (`✅ Supabase DB 연결 정상 확인`)
- `findstr /C:"[ ]"` 로직: 현재 todo.md의 미완료 항목 5개(#06/#02 보류 등)를 정상 감지 확인 (cmd.exe로 별도 격리 테스트)
- `git rev-parse HEAD` 커밋 해시 비교 로직: cmd.exe로 별도 테스트해 문법/동작 정상 확인
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과
- **전체 루프(`auto-dev.bat` 자체)는 실행하지 않음** — `claude --dangerously-skip-permissions -p ...`를 재귀 호출하는 무한 루프라 이 세션에서 직접 실행하면 통제되지 않은 별도 에이전트 작업이 시작되므로, 개별 구성요소만 격리 검증함

## 특이 사항
- `notify-error.mjs`는 실제 실행 시 `@everyone` 멘션과 함께 실제 디스코드 알림이 발송되므로, 오탐(가짜 긴급 알림)을 방지하기 위해 라이브 테스트는 하지 않고 코드 검토로만 검증함 (BetterLiving의 동작 확인된 버전과 로직이 동일하므로 신뢰도 높음)
- **BetterLiving 프로젝트에도 동일한 성공/실패 판정 로직 버그가 존재함**을 확인했으나, 이번 요청 범위는 local-open-spaces이므로 BetterLiving 쪽은 수정하지 않음. 필요 시 별도 요청 바람
- `auto-dev.bat`을 실제로 백그라운드에서 계속 실행해두려면 사용자가 로컬 PC에서 직접 실행해야 함 (Claude Code 세션은 이 배치 파일을 대신 상시 실행해줄 수 없음 — 파일 수정 및 로직 검증까지가 이번 작업의 범위)
