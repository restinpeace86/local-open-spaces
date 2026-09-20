# Nadripik Partner PMS Module Specification (`spec.md`)

## 1. 개요 (Overview)
* **목적:** 나드리픽 플랫폼의 공급자(농장 사장님)를 위한 모바일 퍼스트 스마트 장부(PMS) 구축 및 도어투 도어 온보딩 지원.
* **원칙:** 기존 나드리픽 프로젝트의 코드베이스와 루트 경로(`/`)를 유지하면서, 공급자 전용 기능은 `/partner/*` 하위 경로 및 독립된 모듈로 안전하게 확장.

---

## 2. 라우팅 및 아키텍처 격리 (Routing & Architecture)
* **엔드포인트 분리:** 
  * 기존 유저용 서비스: 루트 및 기존 경로 유지 (`/`)
  * 공급자 전용 스마트 장부: `/partner/*` 경로 사용
* **디렉토리 구조:** 사장님 전용 소스 코드는 `/app/partner/` 및 관련 서버 액션은 `/actions/partner/` 하위에 독립적으로 구성하여 기존 코드베이스 오염 방지.

---

## 3. 인증 및 보안 (Authentication & Security)
* **독립 로그인 진입점:** `/partner/login` 경로를 통해 공급자 전용 모바일 퍼스트 로그인 화면부터 시작. (google or kakao 인증 - 추가적 입력란 : 상호명, 나드리픽 스팟과의 위치연동, ... 그 외는 추가로 확장 가능한 구조)
* **미들웨어 보안 가드:** Next.js Middleware를 활용하여 `/partner/*` 하위 모든 라우트(로그인 페이지 제외) 접근 시 Supabase Auth 세션 검증 필수 수행. 미인증 시 `/partner/login`으로 자동 리다이렉트.
* **권한 분리 (Role-Based Access):** 로그인 시 Supabase DB를 참조하여 해당 계정이 승인된 농장 공급자(Partner) 권한을 보유했는지 검증 후 대시보드 접근 허용. (나드리픽의 로그인 유저와는 데이터가 섞이거나 오염되면 안됨)

---

## 4. 멀티 테넌시 데이터 격리 (Multi-Tenancy & Data Isolation)
* **공급자 고유 ID 스코프잉:** 모든 파트너 PMS 관련 데이터베이스 테이블(`bookings`, `partners`, `notification_logs` 등)은 `partner_id` 컬럼을 필수 보유.
* **Supabase RLS(Row Level Security) 강제:** 데이터 유출 및 크로스 액세스 원천 차단을 위해 RLS 정책을 설정하여, 모든 조회 및 조작 쿼리는 현재 로그인한 파트너의 고유 ID(`partner_id`)를 기준으로만 실행되도록 보장.
* **단일 UI / 분리된 데이터:** 모든 파트너는 동일한 컴포넌트 구조와 화면 UI를 공유하되, API 및 Server Action 레이어에서 파트너별 컨텍스트를 주입하여 본인 농장의 데이터만 렌더링.

---

## 5. UI/UX 네비게이션 구조 (Navigation & Cross-UX)
* **하단 탭바 네비게이션:** 모바일 환경 최적화를 위해 하단에 고정 탭바 배치
  * `[ ⏰ 오늘(일간) ]` (기본 홈 디폴트: 시간대별 타임스케줄 및 출석 체크)
  * `[ 🗓️ 주간 ]` (7일간의 예약 리스트 - 월, 화 , 수, 목, 금, 토,일의 7개 리스트 row로 구성 - 각 요일별 영역에 일자 / 금일 예약팀, 시간, 인원 등의 정보들이 1줄씩.. 표기)
  * `[ 📊 월간 ]` (월 총합계 및 일별 지표 칩 뷰- 캘린더형태로 각 일자별 몇건의 예약건수 총합, 예약 인원 총합 등의 집계형식으로 하여 보여줌. 켈린더 위 최상단 헤더에는 전체 월 집계를 보여줌)
  * `[ ⚙️ 더보기 ]` (설정 및 부가 기능 집약)
* **크로스 네비게이션 (Cross-Navigation):**
  * **월간/주간 뷰 ➔ 일간 뷰 점프:** 월간 캘린더 그리드의 일자 칩이나 주간 리스트의 특정 일자 터치 시, 해당 날짜의 **일간 타임스케줄 뷰로 즉시 전환**.
* **[더보기] 탭 세부 구성:**
  * 노쇼 방지 리마인드 템플릿 커스텀 설정
  * 농장(공급자) 기본 프로필 및 정산 정보 관리
  * 네이버 연동 상태 및 메일함 스캔/웹훅 상태 인디케이터
  * 고객센터 연결 및 1분 사용 가이드 링크
  * 로그아웃 기능

---

## 6. 데이터 연동 및 웹훅 (Data Ingestion & Webhooks)
* **실시간 인바운드 웹훅:** `/api/webhook/naver-booking` 엔드포인트를 통해 네이버 예약 알림 이메일 데이터를 실시간 수신 및 파싱하여 마스터 캘린더 DB에 통합 적재.
* **과거 데이터 이관 (도어투 도어 지원):** 
  * 현장 대면 세팅 시 과거 메일함 자동 스캔 프로그램 구동. (개발 필요!- 별도 프로그램 혹은 웹의 별도 화면에서 필요한 정보 입력후 누르면 자동 스캔하여 과거 예약 이력 이관/채우도록)
  * DB 즉시 저장이 아닌 **미리보기(Preview) 화면**을 먼저 거쳐 사장님 검수 후 확정 적재.
* **마스터 캘린더 통합:** 네이버 예약 데이터와 나드리픽 자체 직계약 예약 데이터를 마스터 캘린더에서 색상별로 구분하여 동시 수용 및 관리.

---

## 7. 운영 및 알림 자동화 (Operations & Notifications)
* **날짜별 단체 안내 문자 (카카오 알림톡):** 
  * 캘린더에서 특정 날짜 선택 후 [단체 안내 문자 발송] 트리거.
  * 사장님이 작성한 메시지를 해당 일자 예약자 전원에게 카카오 알림톡(실패 시 SMS 자동 전환) 일괄 발송.
* **노쇼 방지 자동 리마인드:** 사전에 세팅된 템플릿을 바탕으로, 방문 전날 지정된 시간에 노쇼 방지 리마인드 톡이 자동 발송되도록 백그라운드 트리거 구성.

---

## 8. 메인 플랫폼(나드리픽/스팟픽) 연동 및 확장성 설계 (Platform Integration & Extensibility)
* **스팟/상품 마스터 연동 (`spot_id` / `product_id`):** 
  * 파트너 PMS의 데이터는 메인 플랫폼(나드리픽/스팟픽)의 농장 및 체험 상품 마스터 테이블과 외래 키(Foreign Key) 또는 매핑 ID를 통해 유기적으로 연결되어야 함. (초기에 로그인후 사용자 정보 입력시, 스팟연결시도)
* **실시간 재고 및 회차 동기화:** 
  * 나드리픽 앱 내 결제/예약 데이터와 네이버 웹훅/수기 예약을 아우르는 통합 재고 관리 구조를 지원하여 이중 예약(Double Booking) 방지.
* **스키마 확장성 및 마이그레이션 고려:** 
  * 향후 비즈니스 요구사항 변경에 따른 컬럼 추가·수정·삭제를 대비하여 옵셔널(`nullable`) 필드 및 기본값(`default`) 정책을 철저히 준수하고, 필요시 가변 데이터 저장을 위한 `metadata jsonb` 패턴 활용 고려.
  
## 9. 플랫폼 관리자 (HQ / Superadmin) 모듈
* **관리자 전용 엔드포인트 (`/admin/*`):** 본사 운영진이 전체 파트너 현황을 통제하고 모니터링할 수 있는 독립된 관리자 대시보드 제공.
* **RLS 관리자 예외 정책 (Superadmin Bypass):** 데이터베이스 레벨에서 시스템 관리자 권한을 가진 계정은 모든 파트너의 예약 및 설정 데이터를 조회·관리할 수 있도록 허용.
* **통합 관제 및 CS 지원 기능:**
  * 전체 가입 파트너(농장) 리스트 및 활성 상태 모니터링.
  * 플랫폼 전체 예약 현황 총괄 집계.
  * **임퍼소네이션 (Impersonation):** 사장님들의 CS 요청(예약 오류 등) 발생 시, 관리자가 해당 파트너의 화면을 그대로 시뮬레이션하여 원인을 즉시 파악할 수 있는 조회 지원 기능.
  
  # [Task Prompt] Nadripik Partner PMS - Supabase DB 스키마 및 RLS 보안 설정 구현

너는 나드리픽(Nadripik) 플랫폼의 공급자(농장 사장님) 전용 스마트 장부(PMS) 시스템을 구축하고 있어. 
프로젝트 루트에 있는 `spec.md` 명세서를 기반으로, **Supabase 데이터베이스 테이블 스키마와 RLS(Row Level Security) 보안 정책**을 구현해 줘.

## 요구사항 상세:

1. **테이블 구성 (`partners`, `bookings`, `partner_settings`)**
   - `public.partners` (파트너 프로필):
     - `id` (uuid, references auth.users on delete cascade, primary key)
     - `farm_name` (text, not null) - 농장 이름
     - `owner_name` (text, not null) - 사장님 성함
     - `phone` (text, not null) - 연락처
     - `created_at` (timestamp with time zone)
   - `public.bookings` (통합 예약 마스터 캘린더):
     - `id` (uuid, default gen_random_uuid(), primary key)
     - `partner_id` (uuid, references public.partners(id) on delete cascade, not null)
     - `customer_name` (text, not null)
     - `customer_phone` (text, not null)
     - `booking_date` (date, not null)
     - `booking_time` (time, not null)
     - `headcount` (integer, default 1)
     - `source` (text, check in ('naver', 'nadripik'), not null) - 네이버 예약 vs 나드리픽 직계약
     - `status` (text, check in ('confirmed', 'cancelled', 'noshow', 'completed'), default 'confirmed')
     - `memo` (text)
     - `created_at` (timestamp with time zone)
     - *성능 최적화 인덱스:* `idx_bookings_partner_date` on `(partner_id, booking_date)`
   - `public.partner_settings` (알림 및 설정):
     - `partner_id` (uuid, references public.partners(id) on delete cascade, primary key)
     - `reminder_template` (text) - 노쇼 방지 템플릿 문구
     - `auto_reminder_enabled` (boolean, default true)
     - `updated_at` (timestamp with time zone)

2. **멀티 테넌시 및 RLS(Row Level Security) 보안 필수 적용**
   - 모든 테이블에 RLS를 활성화(`enable row level security`)할 것.
   - 모든 조회, 수정, 삭제 쿼리가 현재 로그인한 유저의 고유 ID(`auth.uid() = partner_id` 또는 `auth.uid() = id`)와 일치하는 데이터에만 접근할 수 있도록 엄격한 정책(Policy)을 작성할 것.

이 구조에 맞는 Supabase 마이그레이션 SQL 파일 또는 코드 적용 가이드를 작성해 줘.