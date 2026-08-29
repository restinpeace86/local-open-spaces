# [스팟 자체 간편 예약/신청 시스템 MVP 구축]

## 요구사항
1. `reservations` 테이블 신설(spot_id/연락처/방문일/인원수/상태/생성일시).
2. `DetailModal`의 네이버 검색 딥링크 폴백(직전 작업에서 추가) 완전 제거 — info_url 있으면
   [공식 홈페이지 바로가기], 없으면 [간편 예약/신청하기] 버튼으로 분기.
3. 신청 폼 모달(날짜/인원수/연락처) + `POST /api/reservations` API, 성공 시 안내 팝업 후
   모달 닫힘.
4. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 1. DB 스키마 (`scripts/migrations/2026-08-29-create-reservations-table.sql`)

```sql
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.open_spaces(id) on delete cascade,
  contact text not null,
  visit_date date not null,
  headcount integer not null check (headcount > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'CONFIRMED', 'CANCELLED')),
  created_at timestamptz not null default now()
);
```

지시서의 "user_name 또는 연락처"는 실제 신청 폼(요구사항 3)이 날짜/인원수/연락처 3개만
받는다는 점과 맞춰, 사용되지 않을 `user_name` 컬럼을 별도로 두지 않고 `contact` 하나로
합쳤다(제5장 제6조 하드코딩·불필요 컬럼 최소화).

**보안**: 이 앱은 아직 로그인/세션 인증이 없다(`src/lib/supabase/admin.ts`에 이미 문서화된
known gap). `reservations`는 연락처 등 개인정보를 담으므로 기존 open_spaces/events(공개
읽기 전용 데이터, RLS 없음)보다 한 단계 보수적으로 다뤘다 — RLS를 켜고 정책을 하나도
추가하지 않아 anon/authenticated 롤은 전부 차단되고 service_role(서버 전용
`createAdminClient()`)만 통과한다. 실측으로 직접 검증했다(아래 "실측 검증" 참고).

마이그레이션은 `npx supabase db query --linked --file`로 실제 적용했고(`db push` 사용
안 함, 기존 관례), `npm run gen:types`로 `src/types/database.types.ts`도 갱신했다.

## 2. `DetailModal` 버튼 분기 로직 교체

기존(직전 작업) `naverLinkUrl = info_url ?? buildNaverPlaceSearchUrl(...)` 폴백을 완전히
제거하고, `secondaryAction`으로 대체했다:
- `item.info_url`이 있으면 `{ type: 'link', label: '🌐 공식 홈페이지 바로가기', href: info_url }`
- 없으면 `{ type: 'reservation', label: '📝 간편 예약/신청하기' }`(버튼 클릭 시
  `ReservationRequestModal` 오픈)
- 이벤트(`isEvent`)에는 노출하지 않는다 — `reservations.spot_id`가 `open_spaces`만
  참조하는 FK라 이벤트 id를 넣으면 애초에 제약 위반이 나고, 지시서도 "스팟" 용어를
  반복 사용해 범위를 명확히 스팟(open_spaces)으로 한정했다(직전 작업과 동일한 경계).

`buildNaverPlaceSearchUrl`(직전 작업에서 추가한 함수)은 이제 아무 데서도 쓰지 않아
`src/lib/navigation.ts`와 그 테스트에서 완전히 삭제했다(제거 요구사항 그대로, 죽은 코드를
남기지 않음).

## 3. 신청 폼 모달 + API

### `src/components/map/reservation-request-modal.tsx`
날짜(`type="date"`, `min`=오늘 — 과거 날짜 선택 방지)/인원수(`type="number"`, 최소 1)/
연락처(`type="tel"`) 3개 입력만 받는 최소 구성(MVP, 제3장 제3조). 제출 시
`POST /api/reservations` 호출 → 성공하면 `window.alert('예약 신청이 정상적으로
접수되었습니다!')` 후 `onClose()` 호출, 실패하면 에러 메시지를 폼 안에 보여주고 모달은
열어둔 채 재시도할 수 있게 한다. 이 프로젝트에 토스트/알림 컴포넌트가 아직 없어(제5장
제4조 기존 구조 우선 — 새 알림 시스템을 이번 범위에서 만들지 않음) 지시서가 명시한 그대로
브라우저 `alert()`을 그대로 썼다.

### `src/app/api/reservations/route.ts`
`category-rules` API(기존 유일한 쓰기 API)와 동일하게 서버 전용 `createAdminClient()`를
쓴다. spot_id/contact/visit_date(YYYY-MM-DD 형식+유효 날짜)/headcount(1 이상 정수)를
서버에서 각각 검증하고, Supabase의 파라미터화된 `.insert()`를 쓰므로 SQL 인젝션 여지가
없다(OWASP 기본 대응).

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(63파일 649건 — 신규 `reservation-request-modal.test.tsx` 6건,
  `DetailModal 보조 액션` 재작성 3건, `buildNaverPlaceSearchUrl` 테스트 3건 삭제) 통과.
- `npm run build` 통과(`/api/reservations` 라우트가 빌드 결과에 포함됨을 확인).

### 실측 검증(로컬 개발 서버, 프로덕션 DB, 실제 인증 경로)
- 정상 요청: `curl -X POST /api/reservations`로 실제 스팟(`무궁화마을`, 
  RURAL_EXPERIENCE_VILLAGE)에 대해 신청 접수 → DB에 실제 insert됨을 확인(이후 테스트
  데이터이므로 정리 삭제함).
- 검증 실패 경로 4종 모두 확인: 연락처 누락/날짜 형식 오류/인원수 0/존재하지 않는
  spot_id(FK 위반) — 각각 명확한 400 에러 메시지 반환.
- **RLS 보안 확인(핵심)**: anon 키로 Supabase REST에 직접 SELECT 시도 → 빈 배열(행
  자체가 보이지 않음), 직접 INSERT 시도 → `"new row violates row-level security
  policy"` 명시적 거부. 개인정보가 서버 API 경로를 거치지 않고는 절대 읽거나 쓸 수
  없음을 실측으로 확인했다.

## 특이 사항
- `status` 컬럼은 `'PENDING'` 기본값으로만 채워지고, 이번 MVP 범위에는 관리자가 상태를
  변경(승인/거절)하는 화면은 포함되지 않았다(지시서 범위 밖 — 필요시 별도 작업으로 진행).
- 이메일/SMS 알림, 어드민 예약 목록 조회 화면도 이번 범위에는 없다(지시서가 명시한
  "MVP" 범위: DB 스키마 + 버튼 분기 + 신청 폼 + 접수 API까지).
