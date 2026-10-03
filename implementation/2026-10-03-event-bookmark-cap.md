# 우수맘 전용 예약-알람 슬롯 최대 20개 제한 (C)

## 구현 대상
사용자 지시(2026-10-03, 4개 기능 중 C): "혜택 제한: 우수회원에게는 알림
리마인더 슬롯 최대 20개 제한을 두어 무분별한 등록 방지." Plan 승인 완료 후
구현.

이벤트 찜 = 예약 오픈 알람 자동 구독(`event-reservation-reminder-hint.tsx`,
오늘 이전 작업에서 `canReceivePushNotifications`/우수맘 기준으로 상향됨)이라
별도의 "알람 켜기" 토글이 없다 — 이벤트 찜 개수 자체를 캡으로 둔다. 스팟
찜에는 캡이 없다(알람과 무관).

## 변경 사항
- `src/lib/community/bookmarks.ts`: `addBookmark`의 단일 insert 지점
  (chokepoint)에 가드 추가. `target.kind === 'event'`이고 호출자 등급이
  `canReceivePushNotifications`(우수맘 이상)를 만족할 때만, 기존
  `user_bookmarks`에서 `event_id is not null`인 행 수를 세어
  `DEFAULT_EVENT_BOOKMARK_CAP(20)` 이상이면 `BookmarkCapExceededError`
  (구분 가능한 전용 에러 타입)를 던진다. 캡은 `NEXT_PUBLIC_EVENT_BOOKMARK_CAP`
  env var로 재정의 가능(제5장 제6조 — `mom-pick-grade-batch.mjs`의 파워맘
  정원제 상수 패턴과 동일 스타일).
- `src/components/community/bookmark-button.tsx`: catch 블록에서
  `err instanceof BookmarkCapExceededError`일 때만 토스트(기존
  `src/components/map/toast.tsx` 재사용, 3초 후 자동 숨김)로 안내. 그 외
  에러는 기존처럼 조용히 무시(제5장 제11조 — 동작 변경 없음).

## 검증
- `src/lib/community/bookmarks.test.ts`(신규, 6개): 스팟 찜은 캡 체크 자체를
  안 하는지, 열심맘은 캡 체크를 건너뛰는지(알람 대상이 아니므로), 우수맘/
  파워맘은 캡 미만/캡 도달 시 각각 허용/거부되는지, env override가
  동작하는지.
- `src/components/community/bookmark-button.test.tsx`(신규, 3개): 캡
  초과 에러만 토스트로 뜨는지, 일반 에러는 조용히 무시되는지, 정상 찜은
  하트가 채워지는지.
- `npx tsc --noEmit` / `npm run test`(261개 파일 2,721개) / `npm run build`
  전부 통과.
- 실측 확인: 프로덕션 `user_bookmarks`를 직접 조회해 이벤트 찜을 가진
  유저가 현재 0명임을 확인(기능이 아직 거의 쓰이지 않은 상태라 캡 적용
  전 기존 위반 데이터는 없음 — 별도 백필/마이그레이션 불필요).

## 특이 사항
- 이 캡은 클라이언트에서만 체크한다(`addBookmark`가 브라우저의
  `createClient()`로 직접 insert) — "무분별한 등록 방지"라는 취지상
  악의적 우회를 막는 보안 경계가 아니라 UX 유도 장치로 판단해 DB 트리거는
  만들지 않았다(Plan 단계에서 명시, 필요해지면 별도 지시로 전환).
