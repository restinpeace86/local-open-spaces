# 나드리픽 예약 시스템 고도화 기획서 (Partner PMS Spec v2)

> **문서 성격**: `docs/partner_spec.md`(Phase 1, 2026-09-20)의 후속 확장판.
> Phase 1은 이미 대부분 구현·배포됐다(아래 0장 참고). 이 문서는 v1 대비
> **새로 요청된 것**(계좌 정보, 입금 대기 상태값, 회차/연령 옵션, 공개 예약
> 랜딩페이지)과 **v1에 명시됐지만 아직 안 만들어진 것**(알림톡, 우천 공지)을
> 구분해서, 다음 구현 라운드가 그대로 착수할 수 있는 수준까지 구체화한다.
> 제3장 제5조(추측 금지) 원칙에 따라, 모든 "현재 상태" 서술은 실제 코드/DB를
> 확인한 결과이며 파일 경로를 근거로 남긴다.

---

## 0. 현재 구현 상태 요약 (실측, 2026-09-24 기준)

새로 설계하기 전에, 이미 있는 것과 없는 것을 먼저 정리한다 — 상당 부분이
"제로베이스 설계"가 아니라 "기존 구조 확장"이기 때문이다.

| 영역 | 상태 | 근거 |
|---|---|---|
| 파트너 인증/온보딩 (카카오·구글·이메일) | ✅ 구현됨 | `/partner/login`, `src/actions/partner/onboarding.ts` |
| `partners` 테이블 | ✅ 존재, **계좌 정보 컬럼 없음** | `farm_name, owner_name, phone, address, image_url, spot_id, inbound_token, naver_bizes_id` |
| `bookings` 테이블 (수기 등록) | ✅ 구현됨 | `AddBookingFab` → `createBooking` |
| 예약 상태값 | ⚠️ 부분적 | 현재 `confirmed / cancelled / noshow / completed` 4종만 존재. **`pending_deposit`(입금대기) 없음** |
| 상품 카탈로그(`partner_products`) | ✅ 구현됨, **연령대 옵션 없음** | 이름/가격/가격기준(팀당·인당)만 존재 |
| 회차(세션)·정원 관리 | ❌ 없음 | `bookings`는 파트너·고객·일시·인원의 평평한 한 행일 뿐, 세션 그룹/정원 상한 개념 자체가 없음 |
| 네이버 예약 — 웹훅 방식 | 🟡 코드는 있으나 **폐기 결정됨** | `/api/webhook/naver-booking`(임의로 만든 계약, 실사용 경로 미확인), `/api/webhook/email-inbound`(파싱 로직은 동작하나 실제 메일 샘플 없이 만들어짐 — 실사용 경로 미확인) |
| 네이버 예약 — 스태프 계정 방식 | 🟡 뼈대만 구현, **차단 상태** | `scripts/partner/naver-reservation-sync-bot.mjs` — DB upsert/멱등키/상태매핑은 완성, 실제 페이지 파싱(`extractReservationsFromPage`)은 스태프 권한 위임을 실제로 받기 전까지 구현 불가(추측 금지) |
| 카카오 알림톡 / SMS | ❌ 전혀 없음 | 코드 전체에 알림톡·SMS 벤더 연동 0건. `partner_settings.reminder_template`/`auto_reminder_enabled` 컬럼은 존재하나 이걸 읽는 코드가 없음(스키마만 있고 동작 안 함) |
| 우천 시 일괄 취소/공지 | ❌ 없음 | v1 스펙(6장)에 문구만 있고 미구현 |
| 공개(비로그인) 예약 랜딩페이지 | ❌ 없음 | 현재 예약 생성 경로는 파트너 본인 수기 입력뿐 |
| HQ 전체 파트너 대시보드 | ✅ 구현됨 | `/hq`, `/hq/partners/[id]` |
| `reservations`라는 이름의 테이블 | ⚠️ **이미 존재, 다른 용도** | `spot_id/contact/visit_date` 스키마 — 스팟 상세에서 쓰는 "방문 예약 신청"용. **PMS 예약과 이름이 충돌하므로 PMS 쪽은 계속 `bookings`를 쓴다** |

**결론**: 이번 고도화는 새 테이블 3~4개 추가 + 기존 `bookings`/`partners` 컬럼
확장으로 충분하다. `stores`/`products`/`sessions`/`reservations`라는 요청
원문의 테이블명은 아래처럼 기존 자산에 매핑한다.

| 요청 원문 개념 | 이 코드베이스의 실제 대응 | 비고 |
|---|---|---|
| `stores` | `partners` (그대로 확장) | 이름 변경 불필요 |
| `products` | `partner_products` (그대로 확장) | 이름 변경 불필요 |
| `sessions` | **신규 테이블 `product_sessions`** | 없던 개념, 새로 추가 |
| `reservations` | `bookings` (그대로 확장) | **`reservations`라는 이름은 이미 다른 테이블이 선점** — 혼동 방지를 위해 네이밍을 맞추지 않는다 |

---

## 1. 핵심 전략 반영 원칙

1. **진입장벽 제로 + 락인**: 네이버 연동은 "완전 자동 동기화"를 이번 단계
   목표로 잡지 않는다(아래 3.2절 — 유일하게 현실적인 경로가 사람이 개입해야
   하는 스태프 권한 위임이라 100% 무인 자동화가 불가능함을 이미 확인함).
   대신 **나드리픽 자체 공개 예약 랜딩페이지**(3.5절)를 우선 완성해, SNS
   유입 고객만이라도 나드리픽 장부에 곧바로 쌓이게 한다 — 이게 네이버
   완전연동보다 기술적으로 훨씬 빠르고 확실하게 락인 효과를 낸다.
2. **린 결제**: 자체 PG 연동은 이번에도 하지 않는다. `pending_deposit` 상태값
   + 계좌 안내 + 사장님 수동 확인이라는, 요청하신 그대로의 워크플로우로만
   설계한다.
3. **체험 특화**: 회차/정원/연령 옵션은 신규 개념이라 처음부터 확장 가능한
   구조(옵션은 JSONB, 정원은 조회 시점 집계)로 설계해, 다음 단계에서
   요구사항이 더 세분화돼도 마이그레이션 없이 버틸 수 있게 한다.

---

## 2. 유저 플로우

### 2.1 소비자(부모) 플로우 — 공개 예약 랜딩페이지 기준
이 플로우는 **인스타그램 bio 링크로 들어온 경우**와 **나드리픽 앱 안에서
"예약하기" 버튼을 누른 경우** 모두 동일한 화면으로 수렴한다(요청 원문
"동일한 구조가 될 것"을 그대로 반영).

```
[진입]
  ① 인스타 bio 링크 (nadri-pick.com/r/{farm-slug})
  ② 나드리픽 앱 스팟/상품 상세 → "예약하기" 버튼
        │
        ▼
[상품 선택] 파트너가 등록한 상품(체험/패키지) 목록 노출 — 이름/가격/설명
        │
        ▼
[회차 선택] 선택한 상품의 예약 가능한 날짜·회차(오전/오후 등) 캘린더 노출
           정원이 찬 회차는 "마감"으로 비활성화(실시간 잔여석 계산, 3.1절)
        │
        ▼
[인원/옵션 입력] 성인/아동 등 연령대별 인원 입력(상품에 옵션이 있는 경우만)
                방문 인원, 예약자명, 연락처 입력
        │
        ▼
[예약 신청 완료 — 상태: pending_deposit]
  화면에 안내: "예약 신청이 접수됐어요. 아래 계좌로 30분 이내 입금해주시면
  사장님 확인 후 확정 알림이 발송됩니다." + 파트너의 계좌 정보(은행/
  계좌번호/예금주) + 입금 기한(신청 시각 + 30분) 카운트다운 노출
        │
        ▼
[대기] 사장님이 입금 확인 → 카카오 알림톡으로 "예약 확정" 알림 수신
       (30분 내 미입금 시 자동 cancelled 전환 + 안내, 3.3절)
```
> **결정(2026-09-24)**: 입금 기한은 **30분**으로 확정. 자체 PG 없이도 예약과
> "거의 동시에" 결제가 체감되도록, 대기 시간을 짧게 잡아 이탈을 최소화한다.

### 2.2 공급자(사장님) 플로우
```
[예약 신청 발생 즉시] 사장님 본인 번호로 알림톡(실패 시 SMS) 즉시 발송
  "🔔 새 예약 신청이 들어왔어요
   김손님님 · 감자캐기 체험 · 3명
   입금 대기 중이에요. 계좌 확인 후 입금완료 버튼을 눌러주세요."
  (메시지 안내 문구는 3.3절 템플릿 확정본 참고)
        │
        ▼
[일간/회차 뷰] 오늘 탭에 "입금대기" 예약이 눈에 띄게(뱃지/색상) 별도 표시
        │
        ▼
[입금 확인] 실제 계좌 앱에서 입금 확인 → PMS에서 해당 예약의
           [입금 확인] 버튼 클릭 → status: pending_deposit → confirmed
        │
        ▼
[자동 알림] 확정 전환 시 고객에게 "예약이 확정됐어요" 알림톡 자동 발송
        │
        ▼
(방문 전날) 자동 노쇼 방지 리마인드 알림톡 발송(3.3절, 배치)
        │
        ▼
(우천 등 사유 발생 시) 캘린더에서 해당 날짜 선택 → [일괄 취소 + 안내 발송]
                       → 그 날짜 confirmed 예약 전체를 cancelled로 전환 +
                         사장님이 작성한 안내 문구를 알림톡/SMS로 일괄 발송
```
> **결정(2026-09-24)**: "예약 신청 즉시 사장님에게 알림"은 배치가 아니라
> 예약 생성 서버 액션 안에서 **동기 트리거**한다(발송 실패해도 예약 생성
> 자체는 막지 않음 — 제5장 제11조 오류 처리 원칙, 알림 발송은 try/catch로
> 감싸고 실패 시 로그만 남김). 나머지(노쇼 리마인드, 입금기한 만료)는
> 기존 계획대로 배치로 처리한다.

---

## 3. 핵심 기능 정의서

### 3.1 회차/옵션/정원 관리
- **회차(`product_sessions`)**: 상품(`partner_products`) 하나에 여러 회차를
  둔다(예: "감자캐기 체험" 상품 아래 9/27 10:00, 9/27 14:00 두 회차).
- **정원 계산은 별도 카운터 컬럼을 두지 않는다** — `booked_count`를
  `product_sessions`에 저장해두면 예약 생성/취소마다 동기화해야 해서 버그
  여지가 생긴다(이 프로젝트가 이미 여러 곳에서 "집계는 조회 시점에 계산"
  원칙을 쓰고 있음, 예: `aggregateBookingsByDay`). 대신:
  ```sql
  -- 특정 회차의 잔여석 = capacity - (그 회차의 활성 예약 headcount 합)
  select
    s.capacity - coalesce(sum(b.headcount) filter (where b.status in ('pending_deposit','confirmed')), 0) as remaining
  from product_sessions s
  left join bookings b on b.session_id = s.id
  where s.id = :session_id
  group by s.id, s.capacity;
  ```
  `pending_deposit`도 잔여석에서 미리 빼는 이유: 입금 대기 중인 자리를
  다른 사람이 동시에 신청해 초과 예약되는 것을 막기 위함(단, 입금 기한
  초과로 자동 취소되면 다시 풀림 — 3.3절 배치).
- **연령대 옵션**: 상품마다 옵션 구조가 다를 수 있어(어떤 상품은 "성인/아동"
  2단계, 어떤 상품은 옵션 자체가 없음) 고정 컬럼 대신 JSONB로 설계한다
  (v1 스펙 8장이 이미 "가변 데이터는 metadata jsonb 패턴" 권고).
  - `partner_products.age_options jsonb` — 예:
    `[{"label":"성인","price":15000},{"label":"아동(36개월~)","price":10000}]`
    비어있으면(`null`) 기존처럼 단일 가격(`price`/`pricing_unit`)만 쓰는
    상품 — **기존 상품 데이터와 100% 하위 호환**.
  - 예약 시 `bookings.age_breakdown jsonb` — 예: `{"성인":1,"아동(36개월~)":2}`.
    총 결제 금액은 `Σ(옵션별 인원 × 옵션 가격)`으로 서버에서 계산(클라이언트
    입력값을 그대로 믿지 않음 — 기존 `createBooking`의 서버 검증 관례 유지).

### 3.2 네이버 예약 연동
**두 경로 모두 이미 시도됐고, 결론이 나 있다** — 여기서 또 새로 고민할
필요 없이 결정을 그대로 승계한다.

| 경로 | 상태 | 이번 단계에서 할 일 |
|---|---|---|
| ① 웹훅(이메일 파싱) | 코드 완성, 실사용 미검증 | **보류 유지**. 네이버가 3rd-party 웹훅을 지원하지 않고, 파트너 메일함을 나드리픽 인바운드 주소로 포워딩하는 실사용 경로도 확인된 바 없음(추측 금지로 이미 결론남) |
| ② 스태프 계정 스크래핑 | 뼈대 완성, 파싱 로직만 비어있음 | **파트너 1곳 실제 온보딩 시 스태프 권한 위임을 받는 순간 재개** — `--debug` 플래그로 실제 페이지 HTML/스크린샷을 확보하면 `extractReservationsFromPage()` 완성 가능(`scripts/partner/naver-reservation-sync-bot.mjs` 참고) |

**권장**: 이번 고도화 라운드에서는 네이버 연동에 개발 리소스를 더 쓰지 않고,
**3.5절 공개 예약 랜딩페이지**로 SNS 유입을 흡수하는 쪽에 집중한다 — 이미
"인스타그램 등 SNS 마케팅 채널... 나드리픽 고유의 모바일 예약 랜딩
페이지"가 명시적으로 요청됐고, 이건 외부 시스템(네이버) 의존 없이 100%
우리 힘으로 완성할 수 있는 항목이라 ROI가 훨씬 높다. 네이버 스태프 위임은
영업/현장 온보딩 단계에서 실제 파트너 한 곳이라도 위임을 완료하는 시점에
병행 재개하면 된다(코드 관점에서는 "언제든 재개 가능한 상태로 대기 중").

### 3.3 노쇼 방지 알림톡 + 우천 공지 일괄 발송

#### 벤더 결정(2026-09-24) — Solapi(솔라피) 채택
알림톡 대행사 4곳(솔라피/알리고/NHN Cloud/비즈엠)을 실제 웹 조사로
비교했다(가격 페이지·공식 문서 기준, 출처는 아래 참고).

| 항목 | Solapi(솔라피) | Aligo(알리고) | NHN Cloud | Bizmsg |
|---|---|---|---|---|
| 알림톡→SMS 자동전환 | ✅ 공식 명시 | ✅ `failover` 파라미터 | ✅ 명시 | 서술은 됨(공식 문서 미확인) |
| 알림톡 단가(원, 직접연동) | 13원 | 6.5원 | 7.9원(추정) | 8원(추정) |
| 공식 SDK | Node/Go/PHP/Ruby/Java + MCP | 없음(raw REST) | 없음(raw REST) | 불명확 |
| 최소요금/약정 | 없음(무료 베이직) | 확인 안 됨 | 비공개(영업문의) | 비공개(영업문의) |
| 진입장벽 | 카카오 채널 심사 후 셀프서비스 연동 | 카카오 채널 심사만 통과하면 됨 | NHN Cloud 사업자 계정 개설 선행 | 이커머스 플러그인 중심 유통 |

**선정: Solapi**. 월 수십~수백 건 규모에서는 벤더 간 실비용 차이가
미미하고(단가가 알리고보다 비싸도 월 몇천 원 수준), **가격/문서가 완전히
공개돼 있고 공식 Node.js SDK가 있어 영업 협의 없이 바로 붙일 수 있다**는
점이 이 단계에서 더 중요하다고 판단했다. 알리고는 가장 저렴하고 API에
`testMode`/`failover`가 명시돼 있어 "비용을 더 낮춰야 한다"는 신호가
나오면 2순위 대안으로 재검토한다.
> 출처: [Solapi 가격](https://solapi.com/pricing), [Solapi 발송단가](https://solapi.zendesk.com/hc/ko/articles/360053238434), [Solapi Developers](https://solapi.com/developers), [알리고 알림톡 API](https://smartsms.aligo.in/alimapi.html), [NHN Cloud 카카오톡 비즈메시지](https://docs.nhncloud.com/ko/Notification/KakaoTalk%20Bizmessage/ko/Overview/)

#### 알림 종류 및 발송 트리거
| 알림 | 수신자 | 트리거 방식 | 상태 |
|---|---|---|---|
| 새 예약 신청 접수 | **파트너(사장님)** | 예약 생성 시 동기 트리거(배치 아님) | 신규 |
| 예약 확정 | 고객 | 파트너가 [입금 확인] 클릭 시 동기 트리거 | 신규 |
| 노쇼 방지 리마인드 | 고객 | 배치(방문 전날) | v1 스펙에 명시, 미구현 |
| 입금 기한 만료 안내 | 고객 | 배치(신청 + 30분 경과) | 신규 |
| 우천 등 일괄 취소 공지 | 고객 | 파트너가 캘린더에서 수동 트리거 | v1 스펙에 명시, 미구현 |

**새 예약 신청 접수 알림 문구(확정)** — 사용자 지시 원문 그대로 템플릿화:
```
🔔 새 예약 신청이 들어왔어요
{고객명}님 · {상품명} · {인원}명
입금 대기 중이에요. 계좌 확인 후 파트너 앱에서
[입금완료] 버튼을 눌러주세요.
```

- **배치**: `scripts/ingest/event-reservation-reminder-push-batch.mjs`(10분
  주기 cron, "지금 시점 기준 알림 대상"을 조회해 발송하고 `*_sent_at`
  컬럼으로 중복 발송 방지)와 동일한 패턴을 따른다.
  - 신규 `scripts/partner/booking-notification-batch.mjs`(제안):
    1. **노쇼 리마인드**: `booking_date = 내일`이고 `status='confirmed'`이고
       `reminder_sent_at is null`인 예약에 발송 → 발송 후 `reminder_sent_at`
       기록.
    2. **입금 기한 만료**: `status='pending_deposit'`이고
       `deposit_due_at < now()`(= 신청 시각 + 30분)인 예약을 `cancelled`로
       전환(회차 잔여석 자동 복구) + 고객에게 "입금 기한이 지나 예약이
       취소됐어요" 안내. 30분 단위 정밀도가 필요하므로 이 배치는
       **10분보다 짧은 주기(예: 5분)**로 돌리는 걸 권장한다.
- **우천 등 사유 일괄 취소/공지**(v1 스펙 7장, 미구현): 파트너 캘린더
  화면에 날짜 선택 → "이 날짜 예약 일괄 취소 + 안내 발송" 버튼(신규 UI) →
  서버 액션이 해당 날짜의 `confirmed`/`pending_deposit` 예약 전체를
  `cancelled`로 일괄 전환 + 파트너가 입력한 문구로 알림톡(실패 시 SMS
  자동 전환) 일괄 발송.

### 3.4 온보딩 — 정산 계좌 정보 추가
`partners` 테이블과 온보딩 폼(`OnboardingForm`, `submitPartnerOnboarding`)에
아래 3개 필드를 추가한다(전부 필수 — 입금 확인 워크플로우의 전제조건이라
선택 입력으로 두면 안 됨):
- `bank_name` (text) — 은행명
- `bank_account_number` (text) — 계좌번호
- `bank_account_holder` (text) — 예금주명

### 3.5 공개 예약 랜딩페이지 (신규, 이번 라운드 핵심)
- 경로 제안: `/r/[farmSlug]`(비로그인 접근 가능, `middleware.ts`의 파트너
  인증 가드 대상에서 제외해야 함 — 기존 `PARTNER_PUBLIC_PATHS`에 프리픽스
  추가).
- `partners`에 `slug text unique` 컬럼 추가(온보딩 시 농장명 기반 자동 생성
  + 중복 시 숫자 접미사, 추후 직접 수정 가능하게 확장 여지만 둠).
- 이 페이지가 만드는 예약은 `bookings.source = 'nadripik_link'`(신규 값,
  기존 `naver`/`manual`과 구분)로 저장 — 어디서 유입됐는지 나중에 집계
  가능하게.
- 나드리픽 앱 내부의 "예약하기" 버튼도 **같은 페이지로 이동**시킨다(새
  화면을 따로 만들지 않음, 제5장 제4조).

---

## 4. 데이터베이스 설계

### 4.1 변경 요약 (마이그레이션 단위로 쪼갤 것을 권장)
1. `partners`에 계좌 3필드 + `slug` 추가
2. `partner_products`에 `age_options jsonb` 추가
3. 신규 테이블 `product_sessions`
4. `bookings`에 `session_id`, `age_breakdown jsonb`, `deposit_due_at`,
   `reminder_sent_at` 추가(입금 금액은 기존 `total_price` 재사용) + `status`
   CHECK에 `pending_deposit` 추가 + `source` CHECK에 `nadripik_link` 추가

### 4.2 `partners` (확장)
```sql
alter table public.partners
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_holder text,
  add column if not exists slug text unique;
```
> **결정(2026-09-24)**: 현재 운영 중인 실제 파트너가 아직 없어(전부 테스트
> 계정) **기존 데이터 소급 입력은 하지 않는다**. 이 세 계좌 필드는
> **오늘 이후 온보딩하는 신규 파트너부터 필수 입력**으로 온보딩 폼에
> 추가한다(`OnboardingForm`/`submitPartnerOnboarding`의 다른 필수 필드와
> 동일하게 처리).

### 4.3 `product_sessions` (신규)
```sql
create table public.product_sessions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.partner_products(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade, -- RLS 단순화를 위해 비정규화
  session_date date not null,
  start_time time not null,
  end_time time,
  capacity integer not null check (capacity > 0),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now()
);
create index idx_product_sessions_partner_date on public.product_sessions (partner_id, session_date);
alter table public.product_sessions enable row level security;
create policy "product_sessions_select_own" on public.product_sessions for select using (auth.uid() = partner_id);
create policy "product_sessions_insert_own" on public.product_sessions for insert with check (auth.uid() = partner_id);
create policy "product_sessions_update_own" on public.product_sessions for update using (auth.uid() = partner_id) with check (auth.uid() = partner_id);
create policy "product_sessions_delete_own" on public.product_sessions for delete using (auth.uid() = partner_id);
```

### 4.4 `bookings` (확장 — `reservations` 역할)
```sql
alter table public.bookings
  add column if not exists session_id uuid references public.product_sessions(id) on delete set null,
  add column if not exists age_breakdown jsonb,
  add column if not exists deposit_due_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;
-- 입금해야 할 금액은 별도 컬럼을 두지 않고 기존 total_price를 그대로 쓴다
-- (같은 값을 두 컬럼에 중복 저장하면 나중에 둘이 어긋나는 버그 여지가
-- 생긴다 — 제5장 제4조 기존 구조 우선).

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending_deposit', 'confirmed', 'cancelled', 'noshow', 'completed'));

alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings add constraint bookings_source_check
  check (source in ('naver', 'manual', 'nadripik_link'));
```

### 4.5 `partner_products` (확장)
```sql
alter table public.partner_products
  add column if not exists age_options jsonb;
```

### 4.6 상태값(`bookings.status`) 워크플로우
```
        (공개 랜딩페이지 예약 신청)
                 │
                 ▼
        ┌─────────────────┐
        │ pending_deposit │──(입금 기한 초과, 배치)──▶ cancelled
        └─────────────────┘
                 │ (사장님이 입금 확인 버튼 클릭)
                 ▼
           ┌───────────┐
     ┌─────│ confirmed │─────┐
     │     └───────────┘     │
     │(우천 등 일괄취소)      │(방문일 경과, 배치 또는 수동)
     ▼                       ▼
 cancelled               completed
                             │
                     (파트너가 노쇼 수동 표시)
                             ▼
                          noshow
```
- `manual`/`naver` 소스로 등록되는 예약(기존 흐름)은 여전히 `confirmed`로
  바로 시작해도 된다 — `pending_deposit`은 **공개 랜딩페이지 경유 예약에만
  강제**한다(사장님이 전화로 직접 잡는 예약까지 입금 대기를 강제하면
  기존 UX가 오히려 불편해짐, 기존 `AddBookingFab` 흐름은 그대로 유지).

---

## 5. MVP 범위 vs 다음 단계 경계

벤더가 확정돼(3.3절) 알림 관련 항목 대부분이 이번 라운드로 앞당겨졌다.

**이번 라운드(MVP) 포함**:
- 계좌 정보 온보딩 필드 3종(신규 파트너부터 필수)
- `pending_deposit` 상태값 + 사장님 "입금 확인" 버튼
- 회차/정원(연령 옵션 없이도 동작하는 기본형)
- 공개 예약 랜딩페이지(`/r/[slug]`, 농장명 기반 자동 슬러그) — 나드리픽
  링크/앱 내부 버튼 공용
- **Solapi 연동 + 새 예약 신청 접수 알림(파트너 대상, 동기 트리거)**
- **입금 기한(30분) 만료 자동 취소 배치**
- 예약 확정 알림(고객 대상, 입금 확인 버튼 클릭 시 동기 트리거)

**다음 단계**:
- 노쇼 자동 리마인드 배치(방문 전날) — v1 스펙에 이미 명시, 벤더는 정해졌으니
  구현만 남음
- 우천 일괄 취소 + 공지 발송 버튼 — 파트너 캘린더 UI 신규 개발 필요

**계속 대기(외부 의존, 코드로 더 진행 불가)**:
- 네이버 스태프 계정 자동 동기화 — 실제 파트너의 권한 위임이 선행돼야 함

---

## 6. 의사결정 현황

2026-09-24 확인 완료:
1. ~~알림톡/SMS 벤더~~ → **Solapi 채택**(3.3절).
2. ~~입금 기한 정책~~ → **30분**, 초과 시 자동 취소 + 회차 잔여석 복구.
3. ~~`slug` 생성 규칙~~ → **농장명 기반 자동 생성**(로마자/영문 변환 + 중복
   시 숫자 접미사). 사장님이 직접 커스텀하는 UI는 이번 범위 밖(추후 확장
   여지만 컬럼에 남겨둠).
4. ~~기존 파트너 계좌 정보 소급~~ → **소급 입력 없음**. 신규 온보딩부터
   필수 입력.

**남은 미해결 항목**(신규):
- Solapi 카카오 비즈니스 채널/발신프로필 심사(수일 소요 추정)를 언제
  시작할지 — 실제 계정 신청은 이 문서 범위 밖(운영팀 액션).
- 알림톡 템플릿(예약확정/노쇼리마인드/우천공지) 문구는 카카오 심사를
  통과해야 하는 사전 등록 대상이라, 실제 발송 전 템플릿 승인 절차가
  별도로 필요함(Solapi 콘솔에서 진행) — 이번 문서는 문구 초안만 제공하고
  승인 자체는 구현 단계 액션으로 남긴다.
