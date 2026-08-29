# [이벤트픽 & 티켓 할인 정보 MVP: 이벤트/티켓 데이터베이스, API 및 UI 구축]

## 요구사항
1. 지역 축제/체험 프로그램/입장권 정보를 담을 `events` 테이블 생성(정가/할인가/할인율/
   행사 기간/장소/예매 링크 등), 기존 테이블과 동일한 RLS.
2. `GET /api/events`(활성 이벤트 최신순) + 샘플 데이터 초기화 로직.
3. 홈/전용 영역에 그리드 카드 UI + 상세 모달([할인 티켓 예매하기] 새 창 버튼).
4. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 0. 사전 확인 — "events" 테이블명 충돌 발견 및 사용자 확인

지시서 원문은 테이블명을 `events`로 지정했으나, 이 프로젝트에는 이미 위치/일정 기반
핵심 `events` 테이블이 존재한다 — 20개 이상의 수집 어댑터가 채우고, 홈 화면의 기존
"이벤트픽" 탭(Hero Carousel/현재 이용 가능/예약 가능/카테고리·테마별 행사) 전체가 이
테이블로 동작 중이다. 스키마도 이번 지시서 컬럼(`event_period`/`location_name`/
`original_price`/`discount_price`/`booking_url`)과 전혀 겹치지 않는다.

추측으로 진행하면(제3장 제5조) 기존 events 테이블 접근을 실패시키거나, 잘못 병합할 경우
전체 이벤트 파이프라인을 손상시킬 위험이 있어 `AskUserQuestion`으로 사용자에게 확인했다.
**사용자가 "새 테이블(event_tickets)로 분리"를 선택** — 이하 모든 구현은 `event_tickets`
테이블 기준이며, 기존 `events` 테이블은 전혀 건드리지 않았다.

## 1. DB 스키마 (`scripts/migrations/2026-08-29-create-event-tickets-table.sql`)

`deals`(직전 작업)와 동일하게 RLS를 켜고 정책을 하나도 추가하지 않았다 —
anon/authenticated 완전 차단, service_role만 접근. `event_period`는 지시서가 정확한
날짜 구조를 요구하지 않고 카드에 보여줄 표시용 문자열로만 언급해 자유 텍스트로 뒀다
(날짜 연산이 필요해지면 별도 지시로 확장).

## 2. API (`src/app/api/event-tickets/route.ts`)

`deals` GET과 동일한 패턴 — `createAdminClient()`로 `is_active=true`만 `created_at desc`
정렬, 페이지네이션 지원.

## 3. 샘플 데이터 초기화 (`scripts/seed-event-tickets.mjs`)

지시서가 명시적으로 "나들이/체험형 축제 및 티켓 샘플 데이터 세팅"을 요구했다 —
`deals`와 달리 이번엔 표본/테스트 데이터 자체가 요구사항이라 가짜 데이터 금지 원칙에
해당하지 않는다. 가을 단풍 축제/키즈 체험/워터파크/동물원/농촌 체험 등 5건의 현실적인
샘플을 담았고, 이미 데이터가 있으면 삽입하지 않는 멱등 처리를 했다(반복 실행 안전).

**실행 중 버그 발견 및 수정**: `process.argv[1]`을 단순 문자열 결합으로 `file://` URL과
비교하는 "직접 실행 여부" 가드가 Windows에서 항상 false가 되어(경로 구분자/URL 인코딩
불일치) 스크립트를 실행해도 아무 것도 삽입되지 않는 것을 실측으로 발견했다 — 기존
`run-monthly.mjs`/`dedupe-open-spaces.mjs` 등이 이미 쓰고 있던 `pathToFileURL(process.argv[1]).href`
비교 방식(제5장 제4조 기존 구조 우선)으로 교체해 해결, 재실행으로 정상 삽입/멱등 스킵
모두 확인했다.

## 4. 프론트엔드 연동

- **`src/components/cards/event-ticket-card.tsx`**: `deal-card.tsx`의 이미지:텍스트
  flex-[4]/flex-[6] 레이아웃 재사용, 카테고리 뱃지 + 할인율 뱃지 + 행사 기간/장소 라인
  추가.
- **`src/components/map/event-ticket-detail-modal.tsx`**: 설명/기간/장소/가격 정보 +
  `target="_blank" rel="noopener noreferrer"`로 여는 [🎟️ 할인 티켓 예매하기] 버튼.
  deals와 달리 이 지시서는 제휴 마케팅 안내 문구를 요구하지 않아 추가하지 않았다(제3장
  제2조 Spec 우선 — 요청되지 않은 문구를 임의로 넣지 않음).
- **`src/components/home/home-view.tsx`**: `useEventTicketsFeed()` 훅 신설. `deals`/
  `free`와 달리 이 섹션은 "홈" 탭(기본 탭)에 상시 노출돼야 해서 `activeTab === 'home'`일
  때 로드를 시작한다(사실상 마운트 직후 1회 페칭). Hero Carousel 바로 아래, "현재 이용
  가능" 섹션 위에 배치했고, 다른 섹션과 동일하게 0건이면 섹션 자체를 숨긴다(가변 노출).

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(66파일 685건 — 신규: `seed-event-tickets.test.mjs` 3건, `home-view.test.tsx`
  할인 티켓·이벤트 섹션 3건) 통과.
- `npm run build` 통과 — `/api/event-tickets` 라우트 정상 포함.

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- **RLS**: anon 키로 `select`는 빈 배열, `insert`는 명시적 RLS 위반 에러로 차단됨을 확인.
- **시드**: `node scripts/seed-event-tickets.mjs` 실행 → 5건 삽입, 재실행 → 멱등 스킵
  확인.
- **API**: 실행 중인 로컬 개발 서버의 `GET /api/event-tickets` 호출 → `total: 5`, 첫 항목
  "가을 단풍 나들이 축제" 정상 반환 확인.

## 특이 사항
- **테이블명 충돌**: 위 0번 항목 참고 — 지시서의 `events`를 그대로 쓰지 않고
  `event_tickets`로 분리했다(사용자 확인 완료).
- **`hotdeal`(특가·핫딜)과의 관계**: `deals`(제휴 커머스 특가)와 `event_tickets`(축제/
  체험/입장권)는 개념이 다르지만 UX 패턴(그리드 카드 → 상세 모달 → 외부 링크)은
  유사해 컴포넌트 구조를 최대한 재사용했다. 다만 `event_tickets`는 별도 탭이 아니라
  "홈" 탭 안의 상시 섹션으로 배치했다 — 지시서가 "메인 또는 전용 영역"으로 유연하게
  표현했고, 이미 "이벤트픽"이라는 이름이 기존 홈 탭 전체를 가리키는 상황에서 새 탭을
  또 만들면 개념이 헷갈릴 수 있다고 판단했다.
- 실제 축제/티켓 제휴처 API 연동(쿠팡/네이버 등 실 API 기반 수집)은 이번 지시서 범위
  밖이라 진행하지 않았다 — 지시서 자체가 "샘플 데이터 세팅"만 요구했다.
