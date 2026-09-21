## 🚨 자율 실행 및 작업 진행 지침 (Strict Execution Rules)

1. **GitHub `todo.md` 기반 작업 수행**: 본 문서에 명시된 Task 목록과 세부 작업 지시를 최우선 가이드라인으로 삼아 순차적으로 작업을 진행한다.
2. **충돌 발생 시 즉시 스킵 (Skip on Conflict)**:
   - 기존 Spec 문서 (`spec/`), Decision Log (`project/decision-log.md`), 또는 기존 모듈과 구조적/논리적 충돌이 발생하는 경우, 절대로 무리하게 코드를 수정하지 말고 즉시 **[스킵 (보류)]** 처리한다.
3. **스킵 처리 시 필수 기록 사항**:
   - 충돌로 인해 작업을 스킵할 경우, 해당 Task 하단에 **① 상세 스킵 사유**를 명확히 기록한다.
   - 해당 Task를 재개하기 위해 **② 선행되어야 할 작업**(예: 신규 Decision 기록 필요, Spec 문서 선행 수정 필요 등)을 구체적인 가이드로 명시한다.
4. **원격 문서 갱신 반영 및 동기화**:
   - 원격 저장소의 `project/decision-log.md` (Decision 010) 및 `spec/map/spatial-search.md` (2.2 레이어 분리) 변경 내역을 확인하고, 충돌이 해소된 상태에서 안전하게 다음 Task를 진행한다.
5. **결과 업데이트 및 정합성 유지**:
   - 작업 완료 시 관련 테스트/빌드를 검증하고 `todo.md` 내 체크박스(`[x]`) 및 진행 상태를 최신화한다.

---


[개선사항 1] 현재 Next.js 프로젝트의 도메인을 `vercel.app`에서 커스텀 도메인 `https://nadri-pick.com`으로 변경하려고 해. 
이 작업과 관련해서 프로젝트 코드베이스 전체를 스캔하고 수정해야 할 부분을 파악해 줘.

[체크해 줬으면 하는 내용]
1. 코드 내에 하드코딩되어 있는 기존 도메인(`vercel.app` 등)이나 `localhost` 주소가 있는지 검색해 줘.
2. Next.js App Router 메타데이터 설정(예: `metadataBase` 또는 OG 태그) 중 도메인 변경이 필요한 부분이 있는지 확인해 줘.
3. 환경 변수 파일(`.env.example` 등)에 추가하거나 수정해야 할 도메인 관련 환경 변수가 있는지 점검해 줘.
4. 그 외에 API 라우트나 백엔드 로직 중 도메인 주소에 의존하는 코드가 있는지 검토해 줘.

수정이 필요한 파일 경로와 구체적인 수정 방향을 리스트업해 줘.

### ✅ [개선사항 1] 완료 (2026-09-21) — 후속 외부 점검 리스트 추가
외부 벤더 대시보드 점검 리스트: `implementation/2026-09-21-domain-migration-
external-checklist.md` 참고(요약: 반드시 확인해야 하는 건 Supabase Auth
Redirect URLs 화이트리스트와 Kakao Developers Web 플랫폼 도메인 등록 2곳).


전체 코드베이스 감사 결과 및 적용한 변경 사항: `implementation/2026-09-21-
custom-domain-migration-audit.md` 참고. 요약 — 하드코딩된 `.vercel.app`/
`localhost`는 없었고(OAuth 리다이렉트도 이미 `window.location.origin` 기반이라
도메인 독립적), 유일한 실제 갭은 `metadataBase` 부재였다. `NEXT_PUBLIC_SITE_URL`
env var 추가 + `src/app/layout.tsx`에 `metadataBase` 반영 완료. Vercel 프로젝트
커스텀 도메인 등록/DNS/Vercel 프로덕션 env 등록은 코드 범위 밖(사용자 몫)으로
남아 있다. `npx tsc --noEmit`/`npm run test`/`npm run build` 모두 통과.

[개선사항 2] 
네이버 예약 데이터를 자동 수집하여 우리 PMS(Supabase + PostgreSQL) DB에 동기화하는 백그라운드 봇을 구현하려고해. 아래 조건과 DB 구조를 반영해서 코드를 작성해줘.

기술 스택: Node.js, TypeScript, Playwright, Supabase Client (@supabase/supabase-js)

작동 방식:

공용 스프레드/스태프 계정 세션 쿠키를 주입하여 로그인 과정을 생략하고 예약 관리 페이지로 진입.

등록된 여러 업체의 비즈니스 ID(bizes_id) 목록을 순회(Loop)하며 예약 데이터를 스크래핑.

중복 저장을 방지하기 위해 예약 번호(또는 고유 식별값)를 기준으로 Supabase DB에 Upsert(있으면 업데이트, 없으면 삽입) 처리.

예상되는 Supabase DB 테이블 구조 (reservations):

id (uuid, PK)

business_id (text, 연동된 농장/업체 식별자)

naver_reservation_id (text, 네이버 고유 예약 번호 - 중복 방지 키)

guest_name (text, 예약자명)

reservation_date (timestamptz, 이용 일시)

status (text, 예약 상태: 확정, 취소 등)

raw_data (jsonb, 파싱된 전체 원본 데이터 보관)

updated_at (timestamptz)

---

### ⏭️ [개선사항 2] 스킵 처리 (2026-09-21)

**① 상세 스킵 사유(구조적/논리적 충돌 2건):**

1. **테이블명 충돌**: 이 작업이 제안한 `reservations` 테이블(컬럼:
   `business_id`/`naver_reservation_id`/`guest_name`/`reservation_date`/
   `status`/`raw_data`)은 **이미 존재하는 `public.reservations` 테이블과
   완전히 다른 스키마로 이름이 충돌**한다. 기존 `reservations`는 스팟/이벤트
   방문 예약 신청(공공 예약) 기능이 쓰는 테이블로 `spot_id`(FK to
   `open_spaces`)/`contact`/`visit_date`/`headcount`/`status`(PENDING/
   CONFIRMED/CANCELLED) 컬럼을 가지며, `/api/reservations`와
   `src/app/admin/reservations/page.tsx`(어드민 예약 관리 대시보드)가 이미
   실사용 중이다(실측: `src/types/database.types.ts` 확인). 같은 이름으로
   또 다른 목적의 테이블을 만들 수 없어 최소한 새 테이블명(예:
   `naver_reservation_sync`)이 필요하다.
2. **아키텍처 중복/상충**: 이 작업이 요청한 "네이버 예약 자동 수집 → PMS
   동기화"는 바로 앞서(2026-09-20~21) 이미 별도 인프라로 구현이 끝났다 —
   `partners`/`bookings` 테이블(파트너 PMS Phase 1, `source='naver'`),
   `POST /api/webhook/naver-booking`(구조화 JSON 웹훅), `POST /api/webhook/
   email-inbound`(클라우드플레어 인바운드 메일 + 정규식 파싱, `partners.
   inbound_token`으로 파트너 식별). 이 작업이 요청하는 Playwright 스태프
   계정 스크래핑 봇은 **같은 문제(네이버 예약 데이터를 우리 시스템에
   반영)를 완전히 다른 방식(수동/웹훅 수신이 아닌 능동 스크래핑, 다른
   테이블, 다른 식별자 체계인 `business_id`/`bizes_id`)으로 다시 푸는
   것**이라, 두 파이프라인이 병존하면 같은 예약 건이 서로 다른 테이블에
   중복 기록되거나(식별자 체계가 달라 자동 병합 불가) 어느 쪽이 진실
   소스(source of truth)인지 불명확해진다.

**② 재개 전 선행 작업(사용자 결정 필요):**
- 이 스크래핑 봇이 기존 `bookings`/웹훅 인프라를 **대체**하는 것인지(→ 그렇다면
  `bookings.source='naver'` 행을 이 봇이 채우도록 스키마를 맞춰 재설계),
  아니면 **완전히 별개 목적**(예: 파트너 PMS와 무관하게 네이버 예약 현황
  자체를 실시간 미러링하는 별도 대시보드)인지 먼저 결정해야 한다.
- 대체가 아니라면, 새 테이블명(기존 `reservations`와 충돌하지 않는 이름)과
  `bizes_id`/`business_id` ↔ 기존 `partners.id`(또는 `partners.spot_id`)
  매핑 방식을 확정해야 한다.
- "공용 스태프 계정 세션 쿠키 주입" 방식 자체(`implementation/TODO LIST
  UP.md`의 제안서 초안이 설명하는 네이버 공식 스태프 권한 위임 기능 활용)는
  기술적으로 이견 없음 — 위 스키마/아키텍처 결정만 선행되면 이후 실제
  Playwright 스크립트 구현은 문제없이 진행 가능하다.

### 🔄 [개선사항 2] 재개 (2026-09-21) — 사용자 결정 확인 완료
사용자 확인: "기존 reservations 테이블 기준으로 하면 되지.. 중요한건 그
프로세스"(테이블 네이밍은 문제 아님) + "웹훅은 계속 봤는데 더이상 웹훅할 수
있는게 없음.. 유일한 방법은 스태프 계정 위임 + 봇"(대체 관계 확정, 크롬
확장 프로그램 방식은 비현실적이라 배제). → **대체**로 확정: 새 테이블을
만들지 않고 기존 `bookings`(`source='naver'`)에 `naver_reservation_id`
멱등키만 추가해 이 봇이 채우도록 설계. 상세 구현 기록:
`implementation/2026-09-21-naver-reservation-sync-bot.md` 참고(요약: 프로세스
전체는 완성됐고, 실제 네이버 예약 파트너센터 페이지 구조를 확인한 적이 없어
`extractReservationsFromPage()` 한 곳만 `--debug` 모드로 실제 페이지를 캡처할
수 있는 상태로 남겨뒀다 — 스태프 권한 위임 완료 후 실제 페이지 캡처 결과를
공유하면 완성 가능).
