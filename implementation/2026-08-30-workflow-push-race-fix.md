# [워크플로 "Commit pipeline log" 푸시 경합 수정]

## 배경
사용자가 GitHub Actions 로그를 공유 — Daily 배치 실행 자체는 완료돼 로컬 커밋
(`d18e2b3` "Daily Events Batch 실행 리포트 - 2026-08-30 02:59 UTC")까지 만들었지만
`git push`가 `[rejected] (fetch first)`로 실패했다. 러너 워크스페이스는 잡 종료와 함께
사라지므로 이 커밋(=이번 배치의 pipeline-log.md 리포트)은 그대로 유실됐다.

## 원인
이 세션에서 같은 시간대에 여러 커밋을 `main`에 직접 푸시하고 있었다(Step 74/75) —
워크플로가 저장소를 checkout한 시점과 "Commit pipeline log" 스텝이 실제로 push하는
시점 사이(배치 자체가 15분 이상 걸릴 수 있음) 사람이 다른 작업을 push하면, 워크플로의
`git push`는 non-fast-forward로 거부된다. 기존 코드는 이 경우 별다른 복구 없이 그대로
실패했다.

## 실측 확인 — 데이터 유실은 없음
git 푸시 실패는 **git 커밋 단계**에서만 발생했고, Supabase에 실제로 데이터를 적재하는
배치 스텝은 이미 그 이전에 끝난 뒤였다 — 즉 이번 실패로 수집 데이터 자체가 유실되지는
않았다. `events` 테이블을 직접 조회해 최근 6시간 내 새로 생성된 행을 확인한 결과
`seoul_public_reservation`(SEOUL_YEYAK) 11건이 정상 신규 적재됐음을 확인했다 — 단지
그 실행의 **로그 리포트**만 저장소에 남지 못한 것이다.

## 조치
`.github/workflows/ingest-daily.yml`/`ingest-monthly.yml`의 "Commit pipeline log"
스텝에 push 실패 시 재시도 로직을 추가했다 — `docs/pipeline-log.md`는 이 두 워크플로
외에는 아무도 건드리지 않는 파일이라 rebase 충돌 위험이 매우 낮다는 점을 활용한다.

```bash
for i in 1 2 3 4 5; do
  if git push; then exit 0; fi
  echo "⚠️ 푸시 실패($i/5) — rebase 후 재시도합니다."
  git fetch origin main
  git rebase origin/main
done
echo "❌ 5회 재시도에도 푸시 실패"; exit 1
```

## 검증
- `npx js-yaml`(CLI)로 두 워크플로 파일 YAML 구문 유효성 확인.
- 이 변경은 워크플로 YAML만 수정하므로 `npx tsc --noEmit`/`npm run test`/`npm run build`
  대상 범위(Next.js 앱 코드)와 겹치지 않아 별도 실행하지 않았다 — 실제 동작 검증은
  다음 GitHub Actions 실행에서 확인 가능하다.

## 특이 사항
- 이번에 유실된 리포트 자체(정확히 어떤 소스가 몇 건 처리됐는지)는 복구할 수 없다 —
  러너 워크스페이스가 이미 사라졌다. 다만 위 실측 확인대로 실제 데이터 적재는 정상
  진행됐다.
