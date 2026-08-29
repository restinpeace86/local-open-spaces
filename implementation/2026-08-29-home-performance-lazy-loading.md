# [홈 화면 성능 최적화 — DB 인덱스 점검 및 슬라이드 영역 Lazy Loading]

## 요구사항
1. events/스팟 테이블의 정렬·필터링 핵심 컬럼(end_date, category_min, category_maj,
   is_completed 등) 인덱스 점검, 필요시 마이그레이션 추가.
2. 홈 화면 진입 시 SSR이 모든 슬라이드 데이터+라운드로빈 믹스 연산을 한 번에 처리해 첫
   응답이 느려지는 구조 개선 — 상단은 즉시 렌더링, 아래 무거운 슬라이드는 스켈레톤 → 비동기
   패치로 전환.
3. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 1. DB 인덱스 점검 (실측 기반, 신규 인덱스 추가 없음)

추측 없이 실제 운영 DB(`pg_indexes`, `information_schema.columns`)를 직접 조회해 확인했다:

- `is_completed` 컬럼은 `events`/`open_spaces` 어느 쪽에도 **존재하지 않는다**(지시서의
  예시 컬럼명이 실제와 다름 — 제3장 제5조 추측 금지에 따라 존재하지 않는 컬럼에 인덱스를
  만들지 않았다).
- `end_date`/`category_min`/`category_maj`는 이미 인덱스가 존재한다:
  `idx_events_dates(start_date, end_date)`, `idx_events_category_min`,
  `idx_events_category_maj`, 그리고 이번 3개 전체보기 쿼리가 실제로 타는
  `idx_events_display_filter(target_audience, category_min) WHERE is_active = true`
  (2026-08-27에 이미 추가돼 있었음).
- `EXPLAIN (ANALYZE, BUFFERS)`로 3개 핵심 쿼리(오늘/현재 이용 가능/예약 가능, 정렬 기준을
  `end_date`로 바꾼 직전 작업 반영)를 직접 측정했다:
  - "현재 이용 가능"(`getCurrentlyOngoingEventsPage` 동일 쿼리): 3.8ms — 이미 충분히 빠름.
  - "예약 가능"(`getReservationOpenEventsPage` 동일 쿼리, `raw_data->>'SVCSTATNM'` JSONB
    추출 포함): 최초 측정 99.6ms로 느려 보였으나, `raw_data->>'SVCSTATNM'` 추출 대상
    컬럼에 대한 실험적 표현식 인덱스를 만들어 재측정한 결과 13.5ms로 빨라졌다 — 그런데 그
    인덱스를 **다시 삭제한 뒤** 원래 쿼리를 재실행해도 동일하게 12.8ms가 나왔다. 즉 인덱스가
    아니라 **콜드 캐시(최초 1회 디스크/버퍼 워밍업)** 때문이었음을 실측으로 확인했다
    (`Buffers: shared hit=2482` 그대로, disk read 없음 — 인덱스 생성 과정에서 해당 컬럼의
    TOAST 페이지가 버퍼에 올라온 것이 원인). 실제로 쓰이지 않는 인덱스를 추가하는 것은
    유지비만 늘릴 뿐이라 **최종적으로 인덱스를 추가하지 않았다**.
- 결론: 이벤트픽 3대 쿼리(오늘/현재 이용 가능/예약 가능)는 현재 데이터 규모(전체
  is_active 이벤트 약 1천~2천 건)에서 이미 두 자리 밀리초 이내로 충분히 빠르며, DB 인덱스는
  홈 화면 지연의 원인이 아니었다 — 실제 원인은 아래 2번(SSR 구조)이었다.

## 2. 홈 슬라이드 Lazy Loading

### 문제
`src/app/page.tsx`(Server Component)가 `getTodayEvents`/`getReservationOpenEvents`/
`getCurrentlyOngoingEvents` 3개를 **모두 SSR에서 기다린 뒤에야** 첫 HTML을 응답했다. 뒤 두
쿼리는 지난 작업(카테고리 믹스 정렬)에서 `interleaveByCategoryMin`/`sortByEndDateAscending`
연산까지 추가돼 더 무거워졌다.

### 해결
- `page.tsx`: `getReservationOpenEvents`/`getCurrentlyOngoingEvents` 호출을 완전히
  제거했다 — 이제 `getTodayEvents`(Hero, "상단 영역") 하나만 SSR에서 기다린다.
- `home-view.tsx`: `reservationOpenEvents`/`currentlyOngoingEvents` state를 initial
  props가 아니라 `null`(로드 전)로 시작한다. 기존에 "위치가 설정된 경우에만" 재조회하던
  `/api/home/feed` effect의 가드(`if (!addressName) return`)를 제거해, 위치 설정 여부와
  무관하게 마운트 시 항상 한 번 조회하도록 바꿨다(이 두 섹션의 유일한 데이터 출처가 됐기
  때문). 실패해도 스켈레톤이 영원히 남지 않도록 에러 시에도 `null → []`로 확정한다(기존
  로드분이 있으면 유지).
- `reservation-open-slider.tsx`: 신규 `ReservationOpenSliderSkeleton` — 실제 카드와 동일한
  규격(`w-40 h-64`)의 펄스 애니메이션 플레이스홀더 4개를 보여줘 데이터 도착 시 레이아웃
  흔들림(CLS)이 없게 한다(`free-feed-skeleton.tsx`와 같은 목적).
- 두 섹션 모두 "로드 전(null)→스켈레톤", "로드 후 0건→섹션 숨김(기존 가변 노출 원칙 유지)",
  "로드 후 1건 이상→실제 슬라이더" 3단계로 렌더링한다. "전체보기" 버튼도 로드 전에는
  숨겨(몇 건인지 모르는 상태로 바텀시트를 여는 것을 방지) 로드 완료 후에만 노출한다.

### 효과(실측, 프로덕션 빌드)
- `npm run build && npm run start` 후 워밍업된 상태에서 `/` 응답 시간: **약 0.4~0.6초**
  (Hero 쿼리 1개만 기다림).
- 같은 데이터를 반환하던 기존 `/api/home/feed`(3개 쿼리 전부)는 **약 1.3초** — 이 차이만큼이
  이전에는 첫 화면 응답을 그대로 지연시켰던 부분이며, 이제는 첫 화면이 이미 그려진(스켈레톤
  포함) 뒤 백그라운드에서 처리된다.
- Client Component(`'use client'`)라 이 스켈레톤은 서버 렌더링 HTML에도 그대로 포함된다
  (실측: `curl`로 받은 최초 HTML에 "불러오는 중" 문구가 이미 존재) — 하이드레이션 이전에도
  사용자에게 빈 화면이 아니라 스켈레톤이 즉시 보인다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(60파일 613건 — 신규 Lazy Loading 스켈레톤 테스트 2건 포함, 기존
  `initialReservationOpenEvents`/`initialCurrentlyOngoingEvents` prop을 쓰던 테스트 1건을
  새 지연 페칭 방식에 맞게 수정) 통과.
- `npm run build` 통과 — 라우트 목록 변화 없음(SSR 데이터 소스만 축소됨).

### 실측 검증(프로덕션 빌드/서버)
- `/` 응답 시간 웜업 후 0.4~0.6초(위 "효과" 참고).
- `curl`로 받은 초기 HTML에 스켈레톤 aria-label 문구가 포함돼 있음을 확인.
- `/api/home/feed` 응답이 여전히 정상적으로 3개 섹션 데이터를 반환함을 확인(클라이언트
  지연 페칭이 기존 로직을 그대로 재사용하고 있음을 검증).

## 특이 사항
- DB 인덱스 관련해서는 "추가하지 않기로 한 결정"이 이번 작업의 실제 산출물이다 — 실측 없이
  지시서의 컬럼명을 그대로 믿고 인덱스를 만들었다면 존재하지 않는 컬럼에 대한 마이그레이션
  오류가 나거나, 이미 있는 인덱스와 중복되거나, 콜드 캐시 효과를 인덱스 효과로 오인해 불필요한
  인덱스가 남을 뻔했다.
- Hero Carousel(`getTodayEvents`)은 이번에도 SSR에 남겨뒀다 — 지시서가 "상단 영역은 즉시
  렌더링"이라고 명시했고, 실측상으로도 Hero 단독 쿼리는 3.8ms 수준으로 가벼워 SSR로 두는
  것이 오히려 첫 페인트에 유리하다(클라이언트 왕복 없이 바로 콘텐츠 노출).
