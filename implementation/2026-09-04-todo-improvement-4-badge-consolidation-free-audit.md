# [개선사항4] 이벤트픽 카드 목록 뱃지 최종 원칙 + 무료/유료 분류 데이터 점검

## 구현 대상
`implementation/todo.md` [개선사항4]:
1. 목록 카드 뱃지를 "상단 좌측(중분류) / 상단 우측(예약 상태) / 하단(실내외·무료유료)"
   원칙으로 정리하고, 그 외 부가 정보는 상세 모달로만 분리.
2. 🔍 '무료/유료' 분류 데이터 점검 및 보완.

## 구현 일시
2026-09-04

## 변경 사항 1 — 상단 우측 "예약 상태" 뱃지 통합
### 발견한 문제
`EventCard`가 상단 우측(`getEventStatus(item).label`)과 텍스트 영역(`booking_status`
기반 ⚡오늘 당일 입장 가능/⏳D-1 마감임박/📅접수중)에 **서로 독립적으로 계산되는 두
개의 "상태" 뱃지**를 동시에 보여주고 있었다 — 지시문의 "상단 우측 = 예약 상태 뱃지"
원칙과 맞지 않을 뿐 아니라, 두 값이 같은 정보를 가리키면서도 동기화되지 않아 중복
노출(둘 다 "접수중"을 따로 보여줄 수 있음)이 가능했다.

두 계산을 코드로 직접 대조한 결과:
- `getEventStatus()`(`event-status.ts`)는 `is_reservation_required`가 있을 때만
  세분화된 예약 상태(예약마감/접수중 등)를 반환한다. 그런데 개선사항1에서 이미
  확인했듯 `is_reservation_required`는 SEOUL_YEYAK을 제외한 모든 어댑터에서 근거
  없는 기본값(false)이라, 대다수 이벤트에서 이 브랜치가 사실상 동작하지 않는다.
- `deriveBookingStatus()`(`ai-tagging.mjs`)는 `is_reservation_required`가 false여도
  `start_date <= 오늘 <= end_date`면 자체적으로 "오늘방문"을 반환하는 별도 폴백을
  갖고 있다 — 즉 `booking_status`는 SEOUL_YEYAK 이외 이벤트에서 "지금 방문 가능한지"를
  알려주는 사실상 유일한 신호다.
- 다만 `booking_status`는 수집 시점 1회만 계산되고 이후 어떤 배치도 재계산하지
  않는다(`run-daily.mjs`에 재계산 로직 없음 확인) — `getEventStatus()`처럼 렌더링
  시점마다 `new Date()` 기준으로 새로 계산되지 않아 시간이 지나면 낡을 수 있다.

### 결정
`booking_status`가 있으면 그 값을 그 자리에서만 상단 우측에 노출하고,
`booking_status`가 없을 때만(즉 booking_status 계산 로직 자체가 값을 못 만든 경우)
`getEventStatus()`의 일반 상태로 대체한다 — 둘 중 하나를 그냥 삭제하는 대신
"더 구체적이고 값이 있는 쪽을 우선"하는 방식으로 통합했다(둘 다 유효한 정보 소스이며
단순 삭제는 정보 손실이기 때문).

```ts
const bookingStatusBadge = allBadges.find((badge) => badge.key === 'booking_status');
const topRightBadgeLabel = bookingStatusBadge?.label ?? (status.label !== '상시' ? status.label : null);
```

텍스트 영역에 별도로 있던 `textBadges` 블록(예약 상태 뱃지 + 이미 개선사항1에서
제거 대상이었던 키즈 대상 뱃지 등)은 완전히 삭제했다 — 원칙("텍스트 영역에는
뱃지를 두지 않는다")에 맞춰 상단 우측 하나로만 통합.

`event-card.tsx`/`event-card.test.tsx` 수정. 상단 좌측(중분류)/하단(실내외·무료유료)
뱃지는 이미 기존 구조와 원칙이 일치해 변경하지 않았다.

## 변경 사항 2 — 무료/유료 분류 데이터 점검
### 조사
키워드 기반 추정(제목에 "무료"/"유료" 포함 여부)이 아니라, 어댑터가 실제로 근거로
삼는 원본 필드를 직접 대조하는 정밀 SQL로 점검했다(제3장 제5조 추측 금지 — 실측
우선):

```sql
select count(*) from events
where source = 'seoul_public_reservation'
  and raw_data->>'PAYATNM' = '무료'
  and is_free is distinct from true;
```

결과: **943건**(그중 `is_active = true`인 것 186건)이 원본 데이터상 명백히 무료
(`PAYATNM = '무료'`)인데도 `is_free`가 true가 아니었다. 반대 방향(실제로 유료인데
무료로 잘못 표기된 경우)은 0건으로 확인되어 이쪽은 손대지 않았다.

`seoul-yeyak-adapter.mjs`의 현재 로직(`isFree: item.PAYATNM === '무료'`) 자체는
올바르다 — 이 불일치는 그 로직이 지금 형태로 정착되기 이전에 이미 적재된 행들이,
이후 재수집 대상 응답에서 빠져(특히 예약이 이미 마감된 과거 행사는 원본 API가 더
이상 "현재 목록"에 포함하지 않아 upsert로 갱신될 기회가 없음) 교정되지 못하고
남은 잔존 데이터로 판단된다.

### 백필
`backfill-seoul-yeyak-description.mjs`(id 커서 페이지네이션 + `--dry-run` +
Safe Merge 패턴)를 그대로 따라 `scripts/ingest/backfill-seoul-yeyak-is-free.mjs`를
신규 작성했다 — `seoul_public_reservation` 소스에서 `raw_data.PAYATNM === '무료'`인데
`is_free`가 true가 아닌 행만, 근거가 확인된 만큼만 `is_free = true`로 교정한다
(정보가 없는 행은 손대지 않는다).

실행 중 `PAGE_SIZE = 500`(description 백필과 동일 크기)으로는 `raw_data` 전체
JSONB를 포함한 조회가 statement timeout에 걸려 실패했다 — `PAGE_SIZE = 100`으로
줄여 안전하게 통과시켰다. 실행 도중 스크립트 자체의 진행 카운터(`scanned`/`fixed`)가
중간값을 보고한 뒤 종료됐지만, 백필 완료 직후 원래의 정밀 SQL로 직접 재확인한
결과는 다음과 같이 완전히 해소됨을 확인했다:

```sql
-- 백필 이후 재실행 결과
select count(*) as still_mismatched from events
where source = 'seoul_public_reservation'
  and raw_data->>'PAYATNM' = '무료'
  and is_free is distinct from true;
-- still_mismatched: 0
```

즉 원래 확인했던 943건 불일치는 이번 백필로 전부 해소됐다(실측으로 최종 확인,
스크립트 자체 카운터 값이 아니라 원본 대조 쿼리로 검증).

## 특이 사항
- 검증: `npx tsc --noEmit` 통과(에러 없음), `npm run test`(99개 파일/1049개 테스트)
  전체 통과, `npm run build` 프로덕션 빌드 통과.
- `backfill-seoul-yeyak-is-free.mjs`는 1회성 백필 스크립트이며, description 백필과
  동일하게 재실행해도 안전하다(Safe Merge 가드로 이미 고쳐진 행은 재확인 후 건너뜀).
