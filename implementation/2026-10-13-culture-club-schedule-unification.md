# 문화센터 목록 배치 전 브랜드 "하루 2회(12시간)" 통일 — 실행 가이드

## 구현 대상
Decision 032(`project/decision-log.md`) 실행 — 롯데백화점 WAF 차단
(Decision 031)을 계기로 사용자 지시("다른것들도 롯데백화점과 같이
안되도록.. 주기에 대하여 너무 자주하지 말고 변화폭도 잘 줘") 전 브랜드
목록(list) 배치를 하루 2회(12시간 주기)로 통일.

## 구현 일시
2026-10-13

## 이 문서의 역할
이 세션(샌드박스 환경)은 사용자의 실제 로컬 PC Windows 작업 스케줄러를
조회·수정할 수 없다(`schtasks` 호출이 이 환경에선 빈 결과만 반환 —
Decision 031에서도 동일하게 확인됨). 아래 명령은 **사용자가 자신의 PC
관리자 권한 PowerShell/CMD에서 직접 실행**해야 한다. 코드 쪽(스크립트의
`MAX_STARTUP_DELAY_MS`, GitHub Actions 워크플로 비활성화)은 이미 이
커밋에서 처리됐다.

## 코드 변경 사항 (이미 완료)
- `emart-culture-club.mjs`/`lottemart-culture-club.mjs`/`hyundai-
  culture-club.mjs`/`shinsegae-culture-club.mjs`/`akplaza-culture-
  club.mjs`/`starfield-culture-club.mjs`/`eland-retail-culture-club.mjs`:
  `MAX_STARTUP_DELAY_MS` 10분(600,000) → 30분(1,800,000).
- `emart-culture-club-status-refresh.mjs`: `MAX_STARTUP_DELAY_MS` 30초
  → 10분(600,000).
- `.github/workflows/lottemart-culture-club-batch.yml` →
  `.yml.disabled`(로컬 PC 작업 스케줄러와 중복 제거).
- 검증: `npx tsc --noEmit` / `npm run test -- --run`(316개 파일 3,201개
  테스트 전부 통과) / `npm run build` 전부 통과.

## Windows 작업 스케줄러 — 실행할 명령

### 1단계: 기존 "하루 1회" 작업 삭제
```
schtasks /delete /tn "LocalOpenSpaces-EmartBatch" /f
schtasks /delete /tn "LocalOpenSpaces-EmartStatusRefresh" /f
schtasks /delete /tn "LocalOpenSpaces-LottemartBatch" /f
schtasks /delete /tn "LocalOpenSpaces-HyundaiBatch" /f
schtasks /delete /tn "LocalOpenSpaces-ShinsegaeBatch" /f
```
(존재하지 않는 작업명이면 "지정한 작업 이름을 찾을 수 없습니다" 오류가
나지만 무시하고 계속 진행하면 된다.)

### 2단계: "하루 2회(AM/PM)"로 재등록
아래 전부 `IS_SCHEDULED_RUN=true`를 포함한다(없으면 스크립트의 랜덤
지연이 조용히 비활성화됨 — Decision 032 배경 참고). 로그 경로는 기존
`C:\Users\momob\local-open-spaces-*.log` 관례를 그대로 따른다.

```
schtasks /create /tn "LocalOpenSpaces-EmartBatch-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\emart-culture-club.mjs >> C:\Users\momob\local-open-spaces-emart-batch.log 2>&1\"" /sc DAILY /st 09:00 /f
schtasks /create /tn "LocalOpenSpaces-EmartBatch-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\emart-culture-club.mjs >> C:\Users\momob\local-open-spaces-emart-batch.log 2>&1\"" /sc DAILY /st 21:00 /f

schtasks /create /tn "LocalOpenSpaces-EmartStatusRefresh-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\emart-culture-club-status-refresh.mjs >> C:\Users\momob\local-open-spaces-emart-status-refresh.log 2>&1\"" /sc DAILY /st 09:05 /f
schtasks /create /tn "LocalOpenSpaces-EmartStatusRefresh-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\emart-culture-club-status-refresh.mjs >> C:\Users\momob\local-open-spaces-emart-status-refresh.log 2>&1\"" /sc DAILY /st 21:05 /f

schtasks /create /tn "LocalOpenSpaces-LottemartBatch-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\lottemart-culture-club.mjs >> C:\Users\momob\local-open-spaces-lottemart-batch.log 2>&1\"" /sc DAILY /st 09:10 /f
schtasks /create /tn "LocalOpenSpaces-LottemartBatch-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\lottemart-culture-club.mjs >> C:\Users\momob\local-open-spaces-lottemart-batch.log 2>&1\"" /sc DAILY /st 21:10 /f

schtasks /create /tn "LocalOpenSpaces-HyundaiBatch-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\hyundai-culture-club.mjs >> C:\Users\momob\local-open-spaces-hyundai-batch.log 2>&1\"" /sc DAILY /st 09:20 /f
schtasks /create /tn "LocalOpenSpaces-HyundaiBatch-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\hyundai-culture-club.mjs >> C:\Users\momob\local-open-spaces-hyundai-batch.log 2>&1\"" /sc DAILY /st 21:20 /f

schtasks /create /tn "LocalOpenSpaces-ShinsegaeBatch-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\shinsegae-culture-club.mjs >> C:\Users\momob\local-open-spaces-shinsegae-batch.log 2>&1\"" /sc DAILY /st 09:30 /f
schtasks /create /tn "LocalOpenSpaces-ShinsegaeBatch-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\shinsegae-culture-club.mjs >> C:\Users\momob\local-open-spaces-shinsegae-batch.log 2>&1\"" /sc DAILY /st 21:30 /f
```

### 3단계: 자동 스케줄이 없던 3개 브랜드 — 신규 등록
```
schtasks /create /tn "LocalOpenSpaces-AkplazaBatch-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\akplaza-culture-club.mjs >> C:\Users\momob\local-open-spaces-akplaza-batch.log 2>&1\"" /sc DAILY /st 09:40 /f
schtasks /create /tn "LocalOpenSpaces-AkplazaBatch-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\akplaza-culture-club.mjs >> C:\Users\momob\local-open-spaces-akplaza-batch.log 2>&1\"" /sc DAILY /st 21:40 /f

schtasks /create /tn "LocalOpenSpaces-StarfieldBatch-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\starfield-culture-club.mjs >> C:\Users\momob\local-open-spaces-starfield-batch.log 2>&1\"" /sc DAILY /st 09:50 /f
schtasks /create /tn "LocalOpenSpaces-StarfieldBatch-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\starfield-culture-club.mjs >> C:\Users\momob\local-open-spaces-starfield-batch.log 2>&1\"" /sc DAILY /st 21:50 /f

schtasks /create /tn "LocalOpenSpaces-ElandRetailBatch-AM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\eland-retail-culture-club.mjs >> C:\Users\momob\local-open-spaces-eland-retail-batch.log 2>&1\"" /sc DAILY /st 10:00 /f
schtasks /create /tn "LocalOpenSpaces-ElandRetailBatch-PM" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\eland-retail-culture-club.mjs >> C:\Users\momob\local-open-spaces-eland-retail-batch.log 2>&1\"" /sc DAILY /st 22:00 /f
```

### 4단계: 등록 확인
```
schtasks /query /fo LIST /v | findstr /c:"LocalOpenSpaces" /c:"다음 실행 시간" /c:"상태"
```
각 작업의 "다음 실행 시간"이 의도한 시각으로 잡혀 있는지 확인.

### 5단계(선택, 중요): 손대지 않은 기존 작업들의 `IS_SCHEDULED_RUN=true` 여부 확인
이번에 건드리지 않은 작업들(`EmartDetailFetch`/`EmartRegisterReminder`/
`CultureClubStatusWatch`/`LottemartDetailFetch`/`ShinsegaeDetailFetch`/
`LotteDepartment*`/`CultureClubRehostThumbnails`)은 등록된 명령문에
`IS_SCHEDULED_RUN=true`가 실제로 포함돼 있는지 문서로 확인이 안 된다.
각각:
```
schtasks /query /tn "<작업명>" /fo LIST /v
```
의 "실행할 작업" 항목에 `set IS_SCHEDULED_RUN=true`가 보이는지 확인하면
된다. 없으면 해당 스크립트의 랜덤 시작 지연이 실제로는 전혀 동작하지
않고 있었던 것 — 필요하면 2단계와 동일한 패턴으로 `/change`나 삭제 후
재등록으로 추가해야 한다(이번 범위 밖, 별도 확인 필요 항목으로 남김).

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

## 특이 사항 — 이번 범위에 포함하지 않은 것
- 상세수집(`*-detail.mjs`)·핑(`lottemart-culture-club-ping.mjs`)·상태감시
  (`culture-club-status-watch.mjs`)·알림(`emart-culture-club-register-
  reminder.mjs`) 스크립트는 사용자가 "현재 목록 리스트"라고 범위를
  명시했기 때문에 건드리지 않았다.
- 롯데마트 상세수집의 GitHub Actions/로컬 PC 중복 등록(`lottemart-
  culture-club-detail-batch.yml` vs `LocalOpenSpaces-LottemartDetailFetch`)
  도 동일한 성격의 문제지만 이번 범위(목록 배치) 밖이라 그대로 뒀다 —
  필요하면 별도 지시로 정리.
