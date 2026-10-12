# 문화센터 전 브랜드 상세수집 Discord 알림 + 봇 차단 감지 전수 점검

## 구현 대상
사용자 지시: "다른 문화센터도 ? 다 점검해줘" — 롯데마트에서 발견한 두 가지
공백(① 수집 루프 실패 시 Discord 알림 누락, ② 봇 차단/이상 응답 감지
누락)을 8개 브랜드 전체에 대해 점검하고 동일하게 보완한다. 이번 기록은
앞서 완료한 "메인 리스트 수집 루프 try/catch 래핑"(7개 브랜드, 이미
`implementation/2026-10-13-lottemart-culture-club-bot-block-detection-and-alerting.md`
직후 별도 세션에서 처리됨) 이후 남은 두 가지 범위를 다룬다.

## 구현 일시
2026-10-13

## 변경 사항

### 1. 상세수집 스크립트 7개 — Discord 알림 추가
모든 브랜드의 `{brand}-culture-club-detail.mjs`는 행마다 자체 try/catch로
에러를 누적하고(`errors` 배열) 최종 `status: errors.length > 0 &&
successCount === 0 ? 'FAILED' : 'OK'`를 `pipeline_logs`에 기록하지만,
Discord 알림은 전혀 없었다(`sendDiscordNotification` 호출 0건, 7개 파일
전부). 메인 배치 스크립트들의 `notifyBatchResult` 패턴을 그대로 가져와
7개 파일에 동일하게 적용:
- `emart-culture-club-detail.mjs`
- `shinsegae-culture-club-detail.mjs`
- `akplaza-culture-club-detail.mjs`
- `starfield-culture-club-detail.mjs`
- `lotte-department-culture-club-detail.mjs`(기존 `botBlockSuspected` 감지
  로직은 유지하고, 그 결과를 알림 제목에 반영)
- `eland-retail-culture-club-detail.mjs`
- `lottemart-culture-club-detail.mjs`

각 파일에 `isFailed` 지역 변수로 상태 판정을 한 번만 계산해 `postPipelineLog`
와 Discord 알림이 동일한 기준을 쓰도록 하고:
- `isFailed`(전건 실패)일 때: ❌ 실패 알림(빨강, `0xed4245`)
- 일부만 실패(`errors.length > 0`이지만 성공도 있음)일 때: ⚠️ 일부 실패
  알림(노랑, `0xfee75c`)
- 전부 성공일 때: 알림 없음(라우틴한 일일 상세수집 성공까지 매번 알리면
  메인 배치의 성공 알림과 중복돼 노이즈만 늘어난다고 판단 — 이 설계
  선택은 "특이 사항"에 별도로 남긴다)

### 2. 현대백화점/이랜드리테일 — 봇 차단 감지 (실측 기반, 새로 추가)
나머지 6개 브랜드 중 JSON API 기반(이마트/신세계/AK플라자/스타필드)은
이미 `JSON.parse` 실패 시 자동으로 에러가 나 구조적으로 안전하고,
롯데마트/롯데백화점은 이전에 이미 감지 로직을 추가했다. 이번에 남아있던
HTML 스크래핑 기반 2개 브랜드를 롯데마트와 동일한 방법론(추측 금지,
라이브 요청으로 "진짜 0건" 응답의 정확한 시그니처를 먼저 확인한 뒤에만
감지 로직을 작성)으로 점검했다.

**현대백화점** — 실측(`CT010100_L.do`에 실제 라이브 POST 요청): 정상
페이지(강좌 12개)는 ~314~333KB이고 `class="no_result"` div가 없다.
마지막 페이지를 넘긴 경우(`page=999`)와 존재하지 않는 category keyword
(`keyword=999`) 둘 다 공통적으로 `<div class="no_result"><p>입력하신
단어로 검색된 강좌가 없습니다.</p></div>`를 포함한다(바이트 길이는
약간 다르지만 — 249356 vs 248550 — 이 마커 자체는 두 경우 모두 동일하게
존재). 정상 데이터가 있는 페이지 어디에서도 이 마커는 나타나지 않음을
확인. → `looksLikeSuspiciousEmptyResponse(html, itemCount) = itemCount
=== 0 && !html.includes('class="no_result"')`를 `hyundai-culture-club.mjs`
에 추가하고, `fetchAllForCategory`의 페이지네이션 종료 조건(`pageItems.
length === 0`일 때 break) 바로 앞에서 검사해 의심스러우면 throw.

**이랜드리테일** — 실측(`getLectureList.do`에 실제 라이브 POST 요청):
사용자가 이미 0건으로 확인했던 실제 코드(`LecTypeID='J'`)와 존재하지
않는 임의 코드(`LecTypeID='ZZZ'`)를 둘 다 호출한 결과, **바이트 단위로
완전히 동일한** 63바이트 응답(`<input type="hidden" id="mobLectureCnt_1"
value="0">`만 담긴 고정 템플릿)을 반환함을 확인. 데이터가 있는 코드
(`LecTypeID='B'`, 134건)는 같은 마커가 `value="134"`로 나타나 있어, 이
마커의 값이 곧 카드 수와 일치함도 확인. → `looksLikeSuspiciousEmptyResponse
(html, cardCount) = cardCount === 0 && !html.includes('mobLectureCnt_1"
value="0"')`를 `eland-retail-culture-club.mjs`에 추가하고, `fetchLecTypeAll`
안에서 파싱 직후 검사해 의심스러우면 throw.

두 함수 모두 (1단계에서 이미 완료된) 메인 수집 루프의 try/catch에
자동으로 걸려, throw되면 `postPipelineLog(FAILED)` + Discord 실패 알림
까지 도달한다(추가 배선 불필요 — 이미 메인 루프가 래핑돼 있음).

### 3. 테스트
- `hyundai-culture-club.test.mjs`(신규, 이 스크립트의 첫 테스트 파일):
  `looksLikeSuspiciousEmptyResponse` 3케이스(진짜 빈 결과/정상 데이터/
  의심스러운 빈 결과).
- `eland-retail-culture-club.test.mjs`: 동일한 3케이스 추가. 기존
  `run(dryRun)` 테스트가 `fetchWithTimeout`을 빈 문자열(`''`)로 mock해둔
  부분이 새 감지 로직에 의해 "의심스러움"으로 잘못 걸려 실패했던 것을,
  실측으로 확인한 진짜 빈 템플릿(`mobLectureCnt_1" value="0"`)으로
  mock을 교체해 수정.

## 검증
- `npx tsc --noEmit`: 통과(에러 없음)
- `npm run test -- --run`: 316개 파일 / 3201개 테스트 전부 통과
- `npm run build`: 프로덕션 빌드 성공
- `node --check`로 수정된 7개 상세수집 스크립트 + 현대백화점/이랜드
  리테일 메인 스크립트 전부 문법 검증 통과
- 현대백화점/이랜드리테일 둘 다 실제 라이브 HTTP 요청(여러 페이지/코드
  조합)으로 감지 시그니처를 직접 확인(추측 없이 실측만으로 판단, 제3장
  제5조 준수)

## 특이 사항
- 상세수집 스크립트의 성공 알림은 의도적으로 넣지 않았다 — 이미 일일
  메인 배치가 성공 알림을 보내고 있어, 상세수집까지 매번 성공 알림을
  보내면 하루 2건씩(브랜드당) 중복 알림이 쌓인다. 실패/부분실패일 때만
  알리는 비대칭 설계로, "조용한 실패를 막는다"는 원래 목적에 집중했다.
  필요하면 후속 지시로 성공 알림도 추가할 수 있다.
- `emart-culture-club-status-refresh.mjs`/`emart-culture-club-register-
  reminder.mjs`/`lottemart-culture-club-ping.mjs`(빈번 배치 3종)는 이번
  점검 범위에 포함하지 않았다 — 하루 1회가 아니라 더 잦은 주기로 도는
  스크립트라 실패마다 알림을 보내는 게 맞는지 별도 확인이 필요해 보여,
  임의로 판단하지 않고 범위 밖으로 남긴다(제3장 제5조 추측 금지).
