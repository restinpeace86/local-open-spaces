# 접수기간 비노출 + 접수대기 전용 우수맘 안내

## 구현 대상
사용자 지시(2026-10-03): "접수 기간은 우리도 숨기도록 하자. 괜히
노출시킬필요는 없어보여 다만.. 어차피 그 접수대기상태라면 우리도 그
접수기간을 내부적으로 알고 있으니.. 현재 접수대기인 것들에 대하여
찜할때.. 우수맘등급? 그 알람받는 등급한테는 몇시에 접수예정이라 ...
찜할때 해당 강좌는 몇일 몇시에 열립니다.라는 인폼주는데 사용하자" —
이마트 실제 사이트도 상세 화면에 접수기간을 노출하지 않는 것(reference/
emart culture club detail.png 참고)을 보고 나온 지시.

## 변경 사항 — `src/components/home/culture-club-tab-view.tsx`
### 1. 접수기간 완전 비노출
카드(`ClassCard`)와 상세 시트(`CultureClubDetailSheet`) 양쪽에서
"접수기간 ... ~ ..." 라인을 제거했다.

### 2. `CultureClubReservationHint`(신규) — 접수대기 + 우수맘 전용 안내
`event-reservation-reminder-hint.tsx`와 동일한 자기완결적 패턴(로그인/
등급을 스스로 확인)이지만, 이미 로드된 `item.register_start_date`를 그대로
쓰므로 별도 API 호출이 필요 없다. 표시 조건: `filter_status === '접수대기'`
AND `register_start_date`가 아직 미래 AND 호출자 등급이
`canReceivePushNotifications`(우수맘 이상) — 전부 만족할 때만 "🔔 접수
시작 안내: {날짜 시각}에 접수가 시작돼요 — 찜(❤️)해두면 10분 전에 알림을
보내드려요"를 상세 시트 액션 버튼 아래에 보여준다. 열심맘이거나 이미
접수중/정원마감인 강좌에는 보이지 않는다.

### 3. 신규 헬퍼 `parseRegisterStartDate(raw)`
`register_start_date`("YYYYMMDDHHmm", KST)를 실제 `Date`로 파싱 —
`emart-culture-club.mjs`의 `parseRegisterStartAt`와 동일한 규칙을
프론트에서 재현한다(이미 로드된 데이터라 서버 재호출 없이 바로 비교
가능).

## 검증
- `src/components/home/culture-club-tab-view.test.tsx` 갱신(1개 수정 —
  카드에서 접수기간이 안 보이는지로 변경) + 3개 추가(우수맘+접수대기 →
  안내 노출, 열심맘 → 비노출, 우수맘이어도 접수중 상태면 비노출).
- `npx tsc --noEmit` / `npm run test`(263개 파일 2,757개) / `npm run build`
  전부 통과.

## 특이 사항
- 이 안내는 접수대기 상태 강좌에서만 의미가 있는데, 오늘 추가한 진단
  계측(`2026-10-03-emart-register-window-diagnostic.md`) 결과 현재
  DB에는 접수대기 상태 행이 아직 하나도 없다 — 실제 화면에서 이 안내가
  뜨는 걸 보려면 접수대기 강좌가 수집될 때까지 기다리거나, 테스트처럼
  임의로 상태를 바꿔봐야 한다(실제 기능 자체는 단위 테스트로 검증 완료).
