# 이마트 메인 배치/찜 상태감시 — 로컬 PC 작업 스케줄러 전환

## 구현 대상
`todo.md` 개선사항 1(2026-10-06): "github action 수동 실행으로 확인결과
여전히 에러남. 하기사항을 확인하고 이마트쪽은 어떻게 수집하면 좋을지 다시
제안해줘. 무료인 방향으로." — 사용자가 직접 workflow_dispatch로 재현한
에러 로그 결과, 지점 분할(2026-10-05, 커밋 a9484e8)도 `WAFForbiddenException`
(403)을 해결하지 못했다. 사용자가 같은 메시지에서 직접 제시한 방향(로컬
PC 새벽배치+주기 실행+부팅 시 1회 실행+찜 상태감시도 PC로)을 그대로
구현했다.

## 진단 재확인
- 같은 IP/키/엔드포인트로 class_id 단건 조회(`emart-culture-club-detail.mjs`,
  `classStatus` 필터 없음)는 항상 성공한다.
- `classStatus` 필터가 들어간 쿼리는 광범위(지점 64개 한 번에)든 분할(15개씩
  5묶음)이든 둘 다 403으로 막혔다 — WAF가 요청 "크기"가 아니라 `classStatus`
  필터 조합/반복 호출 패턴 자체를 걸러내는 것으로 보인다(추가 조사 없이는
  정확한 규칙을 알 수 없음 — 추측 금지).
- GitHub Actions 쪽에서 더 시도할 수 있는 무료 옵션이 없다고 판단했다 —
  유료 프록시 없이는 로컬 PC로 옮기는 것이 유일한 무료 대안이다.

## 변경 사항

### 1. GitHub Actions 메인 배치 스케줄 비활성화
`.github/workflows/emart-culture-club-batch.yml`: `schedule` 트리거를
주석 처리(계속 실패하는 걸 그대로 두면 알림만 쌓인다). `workflow_dispatch`는
남겨서 나중에 프록시 등으로 전환 시 바로 재활성화할 수 있게 했다.

### 2. 이마트 찜 상태감시 신규 구현
`scripts/ingest/emart-culture-club-status-watch.mjs`(신규) —
`lottemart-culture-club-status-watch.mjs`와 동일한 설계(찜한 강좌만 범위를
좁혀 자주 재확인, `user_bookmarks`를 구독 신호로 재사용, 우수맘(excellent)
이상만 푸시).
- 이마트 GraphQL API는 "현재 상태"를 직접 알려주는 필드가 없다(메인 배치가
  이미 겪은 제약) — `classId` + `classStatus` 필터를 함께 넣어 3개 버킷
  (접수중/정원마감/접수대기)을 순서대로 조회해, 걸리는 버킷을 현재 상태로
  역산한다. 3개 전부에서 빠지면 메인 배치가 애초에 추적하지 않는 네 번째
  상태 **'접수마감'**으로 본다 — 메인 배치가 다루는 버킷이 정확히 이 3개뿐이란
  구조를 알고 있으므로 추측이 아니다(롯데마트의 '접수불가'와 달리 여기선
  정확한 상태를 특정할 수 있다).
- `scripts/migrations/2026-10-06-emart-culture-club-filter-status-closed.sql`
  (적용 완료): `filter_status` CHECK 제약에 `'접수마감'` 추가.
- 액션 가능 전환 기준: '접수중'(바로 가능) 또는 '정원마감'(UI상 "대기접수,
  취소 시 등록 가능" — 롯데마트의 '대기자신청'과 동급)으로 넘어갈 때만 푸시.
- `emart-culture-club-status-watch.test.mjs`: `isNewlyActionable` 단위
  테스트 6개.

### 3. 로컬 PC 작업 스케줄러 등록
- 기존 `LocalOpenSpaces-EmartBatch`(매일 09:00, 메인 배치) 명령에
  `IS_SCHEDULED_RUN=true`를 추가(아래 4번 항목과 연동).
- **`LocalOpenSpaces-EmartStatusWatch`**(신규, 5분마다): 찜 상태감시 실행.
  생성 완료, 확인됨(다음 실행 시각 정상 등록).
- **`LocalOpenSpaces-EmartBatch-OnBoot`**(부팅 시 1회, `/sc ONSTART`): 생성
  **실패** — `ONSTART` 트리거는 관리자 권한이 필요한데 현재 셸은 비관리자다
  (`net session` 확인). **사용자가 직접 관리자 권한 PowerShell/CMD에서 아래
  명령을 1회 실행해야 한다**:
  ```
  schtasks /create /tn "LocalOpenSpaces-EmartBatch-OnBoot" /tr "cmd.exe /c \"set IS_SCHEDULED_RUN=true && cd /d D:\workspace\local-open-spaces && node scripts\ingest\emart-culture-club.mjs >> C:\Users\momob\local-open-spaces-emart-batch.log 2>&1\"" /sc ONSTART /delay 0002:00 /f
  ```

### 4. 랜덤 시작 지연 — 로컬 스케줄러도 "예약 실행"으로 인식
`scripts/ingest/lib/random-startup-delay.mjs`: `IS_SCHEDULED_RUN=true`
환경변수도 `GITHUB_EVENT_NAME==='schedule'`과 동등하게 취급하도록 확장.
GitHub Actions 밖(로컬 PC)에서는 `GITHUB_EVENT_NAME` 자체가 없어, 어제
(2026-10-05) 추가한 "수동 실행은 지연 생략" 로직이 로컬 작업 스케줄러
실행까지 전부 "수동"으로 오인해 지연이 사라지는 부작용이 있었다 — 봇처럼
안 보이려는 목적은 실행 환경과 무관하므로, 작업 스케줄러 명령에
`IS_SCHEDULED_RUN=true`를 심어 구분한다(사람이 터미널에서 직접 실행할 땐
이 값이 없어 여전히 즉시 실행됨). 테스트 2개 추가.

## 검증
- `npx tsc --noEmit` / `npm run test`(271개 파일 2,819개, 신규 8개 포함) /
  `npm run build` 전부 통과.
- `schtasks /query`로 `LocalOpenSpaces-EmartStatusWatch` 정상 등록 확인
  (상태: 준비, 다음 실행 시각 정상).
- 실제 WAF 우회 여부는 로컬 PC가 애초에 차단 대상이 아니었으므로(이미 로컬
  dry-run이 전부 성공해왔음) 별도 검증이 필요 없다 — 메인 배치 자체 로직은
  변경하지 않았다(명령/환경변수만 바뀜).

## 특이 사항
- `LocalOpenSpaces-EmartBatch-OnBoot` 생성은 사용자의 관리자 권한 실행이
  필요해 미완료 상태다 — 위 명령 1회 실행 전까지는 "PC off로 새벽배치가
  안 된 경우"에 대한 보완이 동작하지 않는다.
- 이 전환은 임시 다리(사용자 표현: "일단은 ... 하고 나중에 전환하도록
  하자")다 — 이미 제안된 주거용/모바일 IP 프록시 서비스 도입이 뒤따르면
  GitHub Actions 스케줄을 다시 켜고 로컬 PC 작업은 정리할 수 있다.
