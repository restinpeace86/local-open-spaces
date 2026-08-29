# [관리자 예약 관리 어드민 대시보드 구축]

## 요구사항
1. `GET /api/reservations` — 서비스 롤 키로 reservations 전체를 최신순 조회, open_spaces
   이름/주소 조인.
2. `/admin/reservations` 어드민 뷰 — 스팟명/방문 예정일/인원수/연락처/접수 시각/상태 표시,
   확정(CONFIRMED)/취소 액션 버튼.
3. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 1. API 확장 (`src/app/api/reservations/route.ts`)

기존(직전 작업) POST 엔드포인트에 GET/PATCH를 추가했다(같은 리소스라 라우트 파일을
새로 쪼개지 않고 기존 파일에 얹음 — `category-rules` API가 GET/POST/DELETE를 한 파일에
모아둔 기존 관례와 동일).

- **GET**: `createAdminClient()`(서비스 롤)로 조회. PostgREST 임베딩
  (`select('..., open_spaces(name, address)')`)으로 `reservations.spot_id → open_spaces.id`
  FK를 통해 스팟 이름/주소를 별도 쿼리 없이 한 번에 가져온다. `page`/`page_size` 페이지네이션
  (기본 20건) — 지시서는 페이지네이션을 명시하지 않았지만, 신청 건수가 계속 쌓이는
  테이블이라 무제한 조회를 피하는 이 프로젝트의 기존 관례(`/events/ongoing` 등)를 그대로
  따랐다.
- **PATCH**: `{ id, status }`를 받아 `CONFIRMED`/`CANCELLED`로만 상태를 바꾼다(신규 신청은
  항상 `PENDING`으로 시작하므로 그쪽으로 되돌리는 액션은 없음 — 지시서 그대로 "확정/취소"
  2가지만). DB의 CHECK 제약과 동일한 값 집합을 애플리케이션에서도 먼저 검증한다.

## 2. 어드민 뷰 (`src/app/admin/reservations/page.tsx`)

`/admin/data-grid`와 마찬가지로 이 앱은 아직 로그인/세션 인증이 없어(known gap) 별도
접근 제어 없이 기존 관례를 그대로 따랐다(인증 추가는 이번 지시서 범위 밖, 제3장 제5조
추측 금지).

- 표(스팟명+주소/방문 예정일/인원/연락처/접수 시각/상태 뱃지/작업)로 나열, 기존
  `Pagination` 컴포넌트(`/events/ongoing` 등에서 이미 쓰던 것) 재사용.
- `PENDING` 건에만 "확정"/"취소" 버튼을 보여준다 — 이미 처리된 건은 되돌릴 액션이
  지시서에 없어 버튼을 숨긴다.
- 상태 변경은 PATCH 성공 시 목록을 다시 불러오지 않고 로컬 상태만 즉시 갱신해 체감
  속도를 높였다.

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(64파일 654건 — 신규 `admin/reservations/page.test.tsx` 5건) 통과.
- `npm run build` 통과(`/admin/reservations`, `/api/reservations` 라우트 확인).

### 실측 검증(로컬 개발 서버, 프로덕션 DB)
- 실제 스팟(무궁화마을)에 테스트 신청을 만든 뒤 `GET /api/reservations`로 조회 —
  `open_spaces` 조인(이름/주소)이 정상적으로 함께 내려오는 것을 확인.
- `PATCH`로 `CONFIRMED` 전환 정상 동작 확인.
- **버그 발견 및 수정**: 존재하지 않는 `id`로 PATCH하면 `.single()`이 던지는 원본
  PostgREST 에러("Cannot coerce the result to a single JSON object")가 그대로
  노출되는 것을 실측으로 발견 — `error.code === 'PGRST116'`(no rows) 분기를 추가해
  "해당 예약 신청을 찾을 수 없습니다"라는 사람이 이해할 수 있는 404 메시지로 교체하고
  재검증했다.
- 검증 완료 후 테스트 데이터는 정리 삭제했다.

## 특이 사항
- 이번 MVP에는 검색/필터(예: 상태별 필터, 스팟별 필터)가 없다 — 지시서가 "가벼운 어드민
  뷰"라고 명시했고 목록 전체를 최신순으로 훑어보는 것만 요구해, 향후 신청 건수가 많이
  늘어나면 별도 지시로 필터를 추가할 수 있다(제7장 제4조 미래 기능 임의 구현 금지).
