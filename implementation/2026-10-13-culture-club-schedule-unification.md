# 문화센터 목록 배치 전 브랜드 "하루 2회(12시간)" 통일 — 실행 가이드

## 구현 대상
Decision 032(`project/decision-log.md`) 실행 — 롯데백화점 WAF 차단
(Decision 031)을 계기로 사용자 지시("다른것들도 롯데백화점과 같이
안되도록.. 주기에 대하여 너무 자주하지 말고 변화폭도 잘 줘") 전 브랜드
목록(list) 배치를 하루 2회(12시간 주기)로 통일.

## 구현 일시
2026-10-13

## 이 문서의 역할
**정정(2026-10-13)**: 처음엔 "이 세션은 사용자의 실제 로컬 PC 작업
스케줄러에 접근할 수 없다"고 잘못 판단했었다 — 원인은 Git Bash가
`schtasks /query`의 `/query`를 경로로 잘못 해석해 빈 결과가 나온 것뿐이고
(`//query`처럼 슬래시를 두 번 쓰면 정상 동작), 실제로는 같은 PC(호스트명
DESKTOP-4NANTTM)다. **조회(`/query`)는 이 세션에서 직접 실행해 확인
가능**하다(기존 13개 작업 전부 `IS_SCHEDULED_RUN=true` 정상 확인,
롯데백화점 2개가 사용자가 직접 끈 대로 "사용 안 함" 상태인 것도 확인).
다만 **삭제(`/delete`)·생성(`/create`)은 Claude Code의 자동 권한
분류기가 "위험한 작업"으로 판단해 이 세션에서 직접 실행이 막혔다** —
그래서 아래 명령은 **사용자가 자신의 PC 관리자 권한 PowerShell/CMD에서
직접 실행**해야 한다. 코드 쪽(스크립트의 `MAX_STARTUP_DELAY_MS`, GitHub
Actions 워크플로 비활성화)은 이미 커밋·푸시 완료.

## 코드 변경 사항 (이미 완료)
- `emart-culture-club.mjs`/`lottemart-culture-club.mjs`/`hyundai-
  culture-club.mjs`/`shinsegae-culture-club.mjs`/`akplaza-culture-
  club.mjs`/`starfield-culture-club.mjs`/`eland-retail-culture-club.mjs`:
  `MAX_STARTUP_DELAY_MS` 10분(600,000) → 30분(1,800,000).
- `emart-culture-club-status-refresh.mjs`: `MAX_STARTUP_DELAY_MS` 30초
  → 10분(600,000).
- `.github/workflows/lottemart-culture-club-batch.yml` →
  `.yml.disabled`(로컬 PC 작업 스케줄러와 중복 제거).
- **상세수집 중복도 실측 확인 후 추가로 정리**(2026-10-13, 사용자 지시
  "중복인지 확인하고 중복이면 정리해"): GitHub API로 실행 이력을 직접
  조회해 `emart-culture-club-detail-batch.yml`(KST 05:00)과 `lottemart-
  culture-club-detail-batch.yml`(KST 01:30)이 로컬 PC 작업(`EmartDetailFetch`
  09:40, `LottemartDetailFetch` 10:00)과 별개로 **최근 5일 연속 매일
  둘 다 실제로 실행**되고 있었음을 확인(추측이 아니라 `GET /repos/.../
  actions/workflows/{id}/runs`로 직접 조회) — 둘 다 `.yml.disabled`로
  전환해 로컬 PC 단일 경로로 정리했다.
- 검증: `npx tsc --noEmit` / `npm run test -- --run`(316개 파일 3,201개
  테스트 전부 통과, 1회 단발성 flaky 재현 후 재실행 시 정상) / `npm run
  build` 전부 통과.

## Windows 작업 스케줄러 — 실행할 명령

**정정(2026-10-13, 두 번째 시도 실패 후)**: 처음 드린 명령은 `cmd.exe /c
"...&&...&&..."`를 통째로 `/tr`에 중첩 따옴표로 박아넣는 방식이었는데,
(1) PowerShell에서 실행하면 `\"`를 PowerShell이 escape로 인식하지 않아
문자열이 중간에 끊기고 `&&`가 노출돼 "토큰이 올바른 문 구분 기호가
아닙니다" 오류가 났고, (2) cmd.exe에서 실행해도 cmd.exe 자체의 네이티브
토크나이저가 `\"`를 escape로 보지 않고 그냥 또 하나의 `"`(따옴표 토글)로
처리해 중간에 따옴표가 조기 종료되면서 `/sc` 옵션을 못 찾는 오류가 났다.
**그 사이 1단계(기존 작업 5개 삭제)만 성공해서, 잠깐 이마트/롯데마트/
현대/신세계 목록 배치와 이마트 상태갱신이 스케줄에서 완전히 빠진 상태가
됐었다** — 아래 수정된 방법으로 바로 복구했다.

**수정된 방법 — 중첩 따옴표/`&&` 자체를 없앰**: `scripts/scheduled-tasks/`
에 브랜드별 `.bat` 래퍼 파일을 만들어 두고, `/tr`에는 그 `.bat` 파일
경로만 전달한다. `.bat` 파일 내부는 그냥 평범한 여러 줄(`set ...`,
`cd ...`, `node ...`)이라 이스케이프가 전혀 필요 없고, cmd.exe든
PowerShell이든 똑같이 동작한다.

### 1단계: 기존 "하루 1회" 작업 삭제 (이미 완료됨 — 다시 안 해도 됨)
```
schtasks /delete /tn "LocalOpenSpaces-EmartBatch" /f
schtasks /delete /tn "LocalOpenSpaces-EmartStatusRefresh" /f
schtasks /delete /tn "LocalOpenSpaces-LottemartBatch" /f
schtasks /delete /tn "LocalOpenSpaces-HyundaiBatch" /f
schtasks /delete /tn "LocalOpenSpaces-ShinsegaeBatch" /f
```

### 2단계: "하루 2회(AM/PM)"로 재등록 — `.bat` 파일 경로 방식
`.bat` 파일 안에 `IS_SCHEDULED_RUN=true`/로그 경로/스크립트 경로가 전부
이미 들어있다(`scripts/scheduled-tasks/run-*.bat` 참고, git에 커밋됨).

```
schtasks /create /tn "LocalOpenSpaces-EmartBatch-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-emart-batch.bat" /sc DAILY /st 09:00 /f
schtasks /create /tn "LocalOpenSpaces-EmartBatch-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-emart-batch.bat" /sc DAILY /st 21:00 /f

schtasks /create /tn "LocalOpenSpaces-EmartStatusRefresh-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-emart-status-refresh.bat" /sc DAILY /st 09:05 /f
schtasks /create /tn "LocalOpenSpaces-EmartStatusRefresh-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-emart-status-refresh.bat" /sc DAILY /st 21:05 /f

schtasks /create /tn "LocalOpenSpaces-LottemartBatch-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-lottemart-batch.bat" /sc DAILY /st 09:10 /f
schtasks /create /tn "LocalOpenSpaces-LottemartBatch-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-lottemart-batch.bat" /sc DAILY /st 21:10 /f

schtasks /create /tn "LocalOpenSpaces-HyundaiBatch-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-hyundai-batch.bat" /sc DAILY /st 09:20 /f
schtasks /create /tn "LocalOpenSpaces-HyundaiBatch-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-hyundai-batch.bat" /sc DAILY /st 21:20 /f

schtasks /create /tn "LocalOpenSpaces-ShinsegaeBatch-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-shinsegae-batch.bat" /sc DAILY /st 09:30 /f
schtasks /create /tn "LocalOpenSpaces-ShinsegaeBatch-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-shinsegae-batch.bat" /sc DAILY /st 21:30 /f
```

### 3단계: 자동 스케줄이 없던 3개 브랜드 — 신규 등록
```
schtasks /create /tn "LocalOpenSpaces-AkplazaBatch-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-akplaza-batch.bat" /sc DAILY /st 09:40 /f
schtasks /create /tn "LocalOpenSpaces-AkplazaBatch-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-akplaza-batch.bat" /sc DAILY /st 21:40 /f

schtasks /create /tn "LocalOpenSpaces-StarfieldBatch-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-starfield-batch.bat" /sc DAILY /st 09:50 /f
schtasks /create /tn "LocalOpenSpaces-StarfieldBatch-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-starfield-batch.bat" /sc DAILY /st 21:50 /f

schtasks /create /tn "LocalOpenSpaces-ElandRetailBatch-AM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-eland-retail-batch.bat" /sc DAILY /st 10:00 /f
schtasks /create /tn "LocalOpenSpaces-ElandRetailBatch-PM" /tr "D:\workspace\local-open-spaces\scripts\scheduled-tasks\run-eland-retail-batch.bat" /sc DAILY /st 22:00 /f
```

### 4단계: 등록 확인
```
schtasks /query /fo LIST /v | findstr /c:"LocalOpenSpaces" /c:"다음 실행 시간" /c:"상태"
```
각 작업의 "다음 실행 시간"이 의도한 시각으로 잡혀 있는지 확인.

### 5단계 — `IS_SCHEDULED_RUN=true` 여부: 확인 완료
(2026-10-13, Claude Code 세션에서 직접 조회) 건드리지 않은 작업들
(`EmartDetailFetch`/`EmartRegisterReminder`/`CultureClubStatusWatch`/
`LottemartDetailFetch`/`ShinsegaeDetailFetch`/`CultureClubRehostThumbnails`)
전부 `schtasks /query /tn "<작업명>" /fo LIST /v`로 직접 조회해 "실행할
작업" 항목에 `set IS_SCHEDULED_RUN=true`가 정상적으로 포함돼 있음을
확인했다 — 랜덤 시작 지연은 전부 의도대로 동작 중이었다. `LotteDepartment
Batch`/`DetailFetch`는 "사용 안 함"(사용자가 Decision 031에 따라 직접
비활성화한 상태)로 확인됨.

## 변경 전/후 요약
| 스크립트 | 변경 전 | 변경 후 |
|---|---|---|
| emart-culture-club.mjs | 매일 09:00, 지연 최대 10분 | 09:00·21:00, 지연 최대 30분 |
| emart-culture-club-status-refresh.mjs | 30분마다, 지연 최대 30초 | 09:05·21:05, 지연 최대 10분 |
| lottemart-culture-club.mjs | 매일 09:10(+GH Actions 01:00 중복), 지연 최대 10분 | 09:10·21:10(GH Actions 비활성화), 지연 최대 30분 |
| hyundai-culture-club.mjs | 매일 09:20, 지연 최대 10분 | 09:20·21:20, 지연 최대 30분 |
| shinsegae-culture-club.mjs | 매일 09:30, 지연 최대 10분 | 09:30·21:30, 지연 최대 30분 |
| akplaza-culture-club.mjs | 자동 스케줄 없음 | 09:40·21:40(신규), 지연 최대 30분 |
| starfield-culture-club.mjs | 자동 스케줄 없음 | 09:50·21:50(신규), 지연 최대 30분 |
| eland-retail-culture-club.mjs | 자동 스케줄 없음 | 10:00·22:00(신규), 지연 최대 30분 |
| lotte-department-culture-club.mjs | 5시간마다 | **중단(Decision 031, 변경 없음)** |
| emart-culture-club-detail.mjs | 매일 09:40(**+GH Actions 05:00 중복 확인됨**) | 09:40(GH Actions 비활성화, 로컬 PC 주기는 변경 없음) |
| lottemart-culture-club-detail.mjs | 매일 10:00(**+GH Actions 01:30 중복 확인됨**) | 10:00(GH Actions 비활성화, 로컬 PC 주기는 변경 없음) |

## 특이 사항 — 이번 범위에 포함하지 않은 것
- 핑(`lottemart-culture-club-ping.mjs`)·상태감시(`culture-club-status-
  watch.mjs`)·알림(`emart-culture-club-register-reminder.mjs`) 스크립트는
  사용자가 "현재 목록 리스트"라고 범위를 명시했기 때문에 건드리지 않았다.
- 상세수집(`*-detail.mjs`)의 GitHub Actions 중복은 처음엔 범위 밖으로
  남겼으나, 사용자가 "중복인지 확인하고 중복이면 정리해"라고 추가 지시해
  GitHub API로 실행 이력을 직접 조회(추측 아님)해 중복 확인 후 정리했다
  (위 표 참고) — 다만 상세수집의 **빈도/지연값 자체**는 변경하지 않았다
  (로컬 PC 쪽 기존 1일 1회 그대로, 목록 배치만 하루 2회로 바뀜).
