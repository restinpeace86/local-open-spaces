# local-open-spaces 의사결정 기록 (Decision Log)

## 1. 문서 목적

본 문서는 `local-open-spaces` 프로젝트에서 내려진 주요 기술적·기획적 의사결정을 기록한다.

단순한 결과만 기록하지 않고, 결정 이유와 향후 영향(Roadmap, Architecture, Spec)을 함께 기록한다. 새로운 기능이나 아키텍처 구조를 제안할 때 기존 의사결정과 충돌하는지 확인하는 검수 기준으로 활용한다.

---

# Decision 001

## 제목
서비스 초기 단계는 고비용 서버/인프라 구축 대신 Zero-Cost 기반의 공공 데이터 수집 파이프라인 및 PostGIS spatial DB로 구현한다.

## 결정 내용
`local-open-spaces`는 초기 유료 인프라 구축이나 유료 지도 API 종속을 지양하며, 무료 티어(Zero-Cost) 기술 스택을 바탕으로 정제된 열린 공간 및 시한성 이벤트 데이터를 구축하는 구조로 시작한다.

## 결정 이유
- 초기 서비스 단계에서 고정 서버 비용 지출을 최소화(0원)하여 지속 가능성 확보
- 대한민국 공공 데이터 포털에서 제공하는 7대 공공 API 무료 쿼리 한도 내에서 수집 가능
- Supabase PostGIS 무료 티어 및 Kakao Maps API(일 300,000건 무료) 활용으로 대용량 공간 데이터 연산 및 마커 표현 가능

## 영향
- **현재 구현:** GitHub Actions 기반 주기적 수집 Workflow + Supabase PostGIS Stored Procedure (RPC)
- **미래 확장:** 서비스 이용자 및 검색 쿼리 폭증 시 서버리스 Caching Layer(Upstash Redis 등) 도입 고려

---

# Decision 002

## 제목
위치 및 거리에 기반한 데이터 처리 및 반경 연산은 클라이언트(JS)가 아닌 Supabase PostGIS DB 엔진 내에서 처리한다.

## 결정 내용
사용자의 위치(Lat, Lng) 기준 반경 검색, 거리 계산(`distance_meters`), 마커 필터링 등의 공간 연산을 클라이언트 JavaScript 코드가 아닌 PostgreSQL PostGIS Stored Procedure(RPC)로 일임한다.

## 결정 이유
- 클라이언트 측 디바이스 연산 부담을 줄이고 메인 지도 렌더링 성능 최적화
- GIST 인덱스를 활용한 Spatial Query로 십만 건 이상의 장소/행사 데이터 중 지정 반경(500m, 1km, 3km) 내의 데이터만 빠르게 리턴 가능

## 영향
- **현재 구현:** `get_nearby_spaces_and_events` Stored Procedure 작성 및 RPC 호출
- **미래 확장:** 공간 재정의 및 다중 지역 경계(Polygon) 검색 시 PostGIS 쿼리 확장만으로 대응 가능

---

# Decision 003

## 제목
선제적으로 작성된 확장 기능 모듈은 백엔드/프론트엔드 수준에서 작성을 허용하되, 미승인/미오픈 기능은 Feature Flag 기반으로 화면상에 비활성화(Disabled/Hidden) 처리한다.

## 결정 내용
개발 효율성을 위해 향후 확장될 기능(예: 고급 소셜 공유, 맞춤 알림 구독, 마이페이지 저장소 등)을 선제적으로 구현하는 것을 허용한다. 다만, 승인된 Spec 범위 외의 기능은 Feature Flag 제어로 화면 UI에서 노출하지 않는다.

## 결정 이유
- 코드 재작성(Refactoring) 비용 절감 및 모듈형 구조 유지
- 사용자 UX 혼선 방지 및 기획 승인 단계에 맞춘 유연한 피처 플래그 전환 가능

## 영향
- **현재 구현:** Feature Flag 환경변수 또는 Component UI Flag(`is_enabled`)로 노출 제어
- **미래 확장:** 승인 절차 완료 시 플래그 켜기(Toggle On)만으로 즉시 서비스 오픈

---

# Decision 004

## 제목
반응형 레이아웃은 Breakpoint(`768px`) 기준 Mobile과 Desktop 전용 2단 멀티 레이아웃 시스템을 채택한다.

## 결정 내용
- **Mobile (`< 768px`):** 지도 풀스크린 + 바텀시트(Bottom Sheet) 인터페이스
- **Desktop (`>= 768px`):** 좌측 컨트롤/리스트 패널 + 우측 메인 지도 패널 (2단 Split View)

## 결정 이유
- 모바일 사용자의 손가락 터치 UX와 데스크톱 사용자의 마우스/대화면 탐색 UX의 본질적 차이 수용
- 동일 데이터 기반으로 디바이스에 최적화된 마커/리스트 상호작용 제공

## 영향
- Layout Component 분리 및 Kakao Map SDK `relayout()` 이벤트를 통한 반응형 대응

---

# Decision 005

## 제목
AI 활용은 공공 API 데이터의 수집 보조 및 카테고리 자동 정제/분류 파이프라인 도구로 한정한다.

## 결정 내용
공공 API의 비정형 텍스트(장소 설명, 행사 내용)를 파싱하고 정제하여 카테고리를 자동 태깅하는 백앤드 데이터 처리 파이프라인 용도로만 AI를 활용한다.

## 결정 이유
- 공공 API 데이터의 정제되지 않은 불명확한 장소/행사 설명 텍스트를 고품질 정형 데이터로 변환
- 검증되지 않은 AI 대화형 서비스나 생성형 기능을 배제하여 가짜 정보 생성을 방지하고 데이터 신뢰성 확보

## 영향
- **현재 적용:** 데이터 자동 분류 및 태깅 파이프라인 구축 (`spec/ai/tagging-rule.md`)

---

# Decision 006

## 제목
구현 결과물의 검수 및 PR 승인은 기획 Spec 및 프로젝트 방향성 기준으로 기획 AI가 수행한다.

## 결정 내용
별도의 리뷰 담당을 두지 않고, 프로젝트의 기획 AI가 Spec 일치 여부, Zero-Cost 원칙 준수 여부, PostGIS 데이터 흐름 충족 여부를 기준으로 구현 코드를 최종 검수한다.

## 결정 이유
본 프로젝트의 주요 검수 포인트는 단순히 Syntactic Code Quality를 넘어 기획 의도와 데이터 파이프라인 스펙의 완벽한 일치 여부이기 때문이다.

## 영향
- 검수 프로세스: 기획 Spec 작성 → 구현 AI 코드 작성 → 기획 AI Spec 준수 검수 및 승인

---

# Decision 007

## 제목
Supabase Auth 계정 권한 관리는 `user_metadata.role` 기반의 RBAC(Role-Based Access Control)을 적용한다.

## 결정 내용
- 관리자 계정 구분을 위해 Supabase Auth의 `user_metadata.role` 메타데이터 클레임(`admin`)을 활용한다.
- `public.is_admin()` 헬퍼 함수를 도입하여 RLS(Row Level Security) 정책을 작성함으로써 일반 사용자가 관리자 전용 데이터 연산 및 관리 기능에 접근하지 못하도록 통제한다.

## 결정 이유
- 별도의 Role 관리 테이블 생성으로 인한 DB 복잡도를 줄이고 Supabase 메타데이터만으로 확실한 보안 격리 구현
- 향후 일반 사용자 커뮤니티 및 관심 장소 저장 기능 확장 시 기존 RLS 구조 손상 없이 유연한 권한 부여 가능

## 영향
- **보안 강화:** `supabase/migrations/*_rbac_admin_role.sql` 작성 및 검증 완료
- **미래 확장:** 사용자 마이페이지 및 장소/행사 북마크 기능 구현 시 역할별 RLS 간편 적용

---

# Decision 008

## 제목
서비스 방향을 "동네 열린 공간 탐색"에서 "가성비 놀거리 큐레이션(아이·가족 대상)"으로 확장 재정의하며, `docs/spec.md`를 UI/데이터 정책의 Single Source of Truth(SSOT)로 지정한다.

## 결정 내용
- 서비스 모토를 "오늘/이번 주말, 아이·가족과 가성비 있게(0원~1만 원) 뭐 하고 놀지?"로 재정의한다.
- 데이터 수집 범위를 기존 7대 공공 API 중심에서 **80% 공식/공공 API + 20% 보완 크롤링/제휴 API(쿠팡 파트너스, 네이버 쇼핑 등 커머스 핫딜 포함)** 구조로 확장한다.
- 화면 구조를 기존 상단 탭(지도/도감/캘린더)에서 **하단 5탭 고정 내비게이션([추천픽]-[스팟픽]-[이벤트픽]-[찜]-[마이])** 중심으로 재편한다. 기존 지도/도감/캘린더 뷰는 폐기가 아니라 새 탭 구조 안으로 재배치한다 (내주변=지도, 카테고리=기존 도감 그리드 개념 확장).
- 추후 하단 고정 네비게이션 항목은 사용자의 지시로 변동될 수 있음을 명시한다.
- AI 태깅 표준 카테고리를 기존 `PARK/SPORTS/CULTURE`(공간), `FESTIVAL/EXHIBITION/PERFORMANCE/POPUP/RESERVATION`(이벤트) 체계에서 **5대 핵심 카테고리(체험·클래스/야외·자연/전시·박물관/공연·축제/키즈·액티비티)** 로 확장하며, 기존 세부 카테고리는 DB 원본값으로 유지하고 신규 5대 카테고리는 그 위에 얹는 **UI 표시용 매핑 레이어**로 도입한다 (`spec/data/ai-rule.md` 3.3 참고).
- 예약 마감건은 메인 노출에서 제외하고, 오늘/주말 당일 즉시 이용 가능한 정보를 우선 노출한다.

## 결정 이유
- 사용자(기획 담당)가 대화 중 명시적으로 전달한 "최신 통합 규약"에 따른 서비스 피벗 지시
- 기존 문서(`project/overview.md`, `architecture.md`, `spec/common/search.md`, `spec/data/ai-rule.md` 등)에 부분적·비일관적으로 반영되어 있던 이전 자율 루프의 산발적 수정 내역을 하나의 공식 결정으로 정리할 필요

## 영향
- **문서 재정렬 필요:** `project/overview.md`, `project/architecture.md`, `project/data_sources.md`, `spec/data/ai-rule.md`, `spec/common/search.md`, `spec/event/event-card.md`, `spec/space/space-card.md` — 본 결정 반영해 정리 완료 (2026-08-22)
- **코드 마이그레이션 대기 (미착수, 별도 승인 필요):**
  1. DB `category`/`event_type` 원본값은 유지하되, 5대 UI 카테고리 매핑을 프론트엔드/RPC 레이어에 반영
  2. 하단 5탭 내비게이션 + 홈 화면(캐러셀/카테고리 그리드/큐레이션 피드) 신규 구현 — 현재 코드는 여전히 상단 3탭(지도/도감/캘린더) 구조
  3. 쿠팡 파트너스/네이버 쇼핑 등 커머스 핫딜 API 연동 — 현재 미착수
  4. 산림청, 네이버 Local API 등 신규 데이터 소스 수집 스크립트 — 현재 미착수
  5. 요금 오탐 방지 OCR/Fallback 룰(`is_free: true` 기본 추정) — 현재 미구현
- 위 코드 마이그레이션 항목은 범위가 커서 `implementation/todo.md`에 개별 항목으로 분리해 다음 단계에서 순차 진행한다.

---

# Decision 009

## 제목
`public.events.location`의 `NOT NULL` 제약(Decision 002 연동)을 해제하고, `location_precision` 컬럼(`EXACT`/`CITY_APPROX`/`UNKNOWN`)으로 위치 정밀도를 구분한다.

## 결정 내용
- Task 9-6-1에서 경기데이터드림 API1(`GGCULTUREVENTSTUS`, 3067건)을 실측한 결과, 원본 API 자체에 주소/좌표 필드가 전혀 없어 기존 스키마(`location NOT NULL`)로는 전량 스킵될 수밖에 없었다.
- 사용자가 TITLE/HOST_INST_NM 텍스트에 경기도 시/군명이 일부 포함돼 있음을 직접 확인·제시하며, 다음 방식의 도입을 채팅으로 명시적으로 승인했다(2026-08-23):
  1. 시/군명이 텍스트에서 매칭되는 행은 해당 시/군 중심좌표(근사값)로 `location_precision = 'CITY_APPROX'`를 부여해 노출한다.
  2. 시/군명이 전혀 매칭되지 않는 행도 버리지 않고 `location = NULL`, `location_precision = 'UNKNOWN'`으로 저장해 메인 페이지의 "경기도권 기타" 섹션에서만 노출한다.
  3. 지도/주변 검색(반경 기반 RPC `get_nearby_spaces_and_events`)에는 `location_precision = 'EXACT'`(실제 주소 지오코딩) 행만 노출한다 — 근사/미상 좌표가 지도에 정확한 위치처럼 표시되어 사용자를 오도하지 않도록 한다.
- `events.location`은 `geometry(Point, 4326) NOT NULL`에서 `NULL 허용`으로 변경하고, `location_precision VARCHAR(20) NOT NULL DEFAULT 'EXACT'`(CHECK: 3개 값만 허용, `UNKNOWN`이면 `location`도 반드시 NULL이어야 하는 정합성 CHECK 제약 포함)를 신설한다.
- 기존 `open_spaces`, `events`의 다른 모든 소스(정확한 주소로 지오코딩된 기존 어댑터들)는 영향 없이 `EXACT`로 남는다 — 이 정책은 API1처럼 원본에 위치 정보 자체가 없는 극히 일부 소스에만 적용되는 예외다.

## 결정 이유
- 원본 데이터에 없는 좌표를 지어내는 것(추측)보다는, 정밀도를 명시적으로 구분해 "덜 정확한 데이터도 버리지 않고 노출하되 정직하게 표시"하는 쪽이 제3장 제5조(추측 금지)와 콘텐츠 최대 활용(제2장 제3·4조) 원칙에 더 부합한다.
- Decision 002(PostGIS 공간 연산 DB 처리)가 전제했던 "모든 이벤트는 정확한 좌표를 가진다"는 가정이 실측으로 깨졌음이 확인됐고, 이를 스펙에 정직하게 반영하지 않으면 향후 수집 스크립트가 계속 같은 한계에 부딪힌다.

## 영향
- **Spec 변경:** `project/database_schema.md` 3.2(`events` 테이블) 갱신 필요.
- **마이그레이션:** `scripts/migrations/2026-08-23-*.sql`로 `location` NOT NULL 해제, `location_precision` 컬럼/CHECK 제약 추가, `get_nearby_spaces_and_events` RPC에 `location_precision = 'EXACT'` 필터 추가.
- **코드 영향 범위:** `scripts/ingest/adapters/lib/schema-mapper.mjs`(`buildEventRow` 가드 완화), `scripts/ingest/adapters/gg-culture-events-adapter.mjs`(API1 시/군명 매칭 로직), `src/lib/home/get-home-feed.ts`(위치 미상 이벤트 조회 함수 신설), `src/components/home/home-view.tsx`(신규 섹션), `src/components/map/detail-modal.tsx`(비-EXACT 항목 지도 UI 숨김), `src/types/database.types.ts`.
- 다른 기존 어댑터(seoul-culture-events.mjs, tour-api-festival.mjs 등)는 이미 실제 주소로 좌표를 확보하므로 변경 불필요 — `location_precision` 컬럼 기본값(`EXACT`)이 그대로 적용된다.

## Decision 010
### 제목
하단 5대 탭 브랜드 구조 개편('추천픽 - 스팟픽 - 이벤트픽') 및 스팟픽 지도 상시 공간 전용 단일화 승인

### 결정 내용
- Decision 008의 하단 탭 구조를 브랜드 정체성에 맞게 **[추천픽] - [스팟픽] - [이벤트픽] - [찜] - [마이]** 5대 탭 구조로 최종 확정한다.
- **[추천픽]**: 3조건(카테고리+가격+거리) 필터 기반 1차 DB 스크리닝 및 2차 AI TOP 3 추천 레이아웃.
- **[스팟픽] (`/nearby`)**: 상시 공간(open_spaces) 전용 지도 탐색 뷰로 단일화하며, 파란 원/고정 반경 칩을 제거하고 줌 레벨별 계층 클러스터링 및 실시간 `panTo` 연동을 적용한다.
- **[이벤트픽] (`/events/today`)**: 시한성 행사(events) 전용 피드로 분리하여 오늘 마감/당일 한정 이벤트를 엄격 피딩한다.

## Decision 011
### 제목
상세페이지 CTA 버튼 3분류(`공공 예약` / `할인 예매` / `길찾기`) 및 조건부 연동 승인

### 결정 내용
- 상세페이지 하단 CTA 버튼을 단순 2버튼에서 장소/행사 성격에 따른 **3분류 조건부 CTA 체계**로 확장 적용한다.
- `is_free` 및 예약/제휴 URL 유무에 따라 [공공 예약하기], [할인 예매하기], [길찾기]로 라벨 및 연결 딥링크를 유연하게 전환한다.

## Decision 012
### 제목
ETL 파이프라인 `docs/pipeline-log.md` 일간 로그 작성 및 이벤트픽 메인 슬라이드 뱃지(`오늘 마감` / `오늘 한정`) 분리 승인

### 결정 내용
1. ETL 파이프라인(수집 워크플로우)의 상태 및 파싱 예외 발생 건수를 매일 `docs/pipeline-log.md`에 투명하게 기록하고, 수집 실패/0건 적재 시 경고 태그를 표기한다.
2. 이벤트픽(`/events/today`) 메인 슬라이드 카드의 라벨을 개별 행사의 시작/종료일 정보에 따라 `[⏰ 오늘 마감]`과 `[⚡ 오늘 한정]` 2종 뱃지로 명확히 구별 노출한다.
3. 유저의 위치(서울 vs 경기) 설정에 따라 해당 지역의 이벤트를 메인 카드 및 상단 피드에 우선 정렬 피딩한다.

## Decision 013: 6대 카테고리 개편, 스팟 분리 및 경기도권 기타 섹션 폐지

- **날짜**: 2026-08-25
- **상태**: 승인
- **결정 내용**:
  1. **Decision 009 개정 및 기타 섹션 폐지**: 메인 페이지의 별도 "경기도권 기타" 섹션(getProvinceWideEvents)을 완전 폐지한다. 위치 미상(UNKNOWN) 데이터라도 도/시 단위 조건이 맞으면 6대 카테고리 피드 내부로 100% 통합 흡수 노출한다. (단, 지도 및 반경 검색 제외 기준은 유지)
  2. **6대 카테고리 개편**: 카테고리를 `👶 키즈`, `🎪 공연·축제`, `🎨 체험`, `📚 클래스`, `🏛️ 전시·박물관`, `🏟️ 공공시설 예약`으로 개편하며 메인 화면 내부 인라인 피딩을 적용한다.
  3. **스팟픽 데이터 배제**: 상시 야외/자연 스팟(공원, 수목원 등)은 이벤트픽 피드에서 완벽히 배제하며, 야외 활동 여부는 `[☀️ 야외]` / `[🏛️ 실내]` 뱃지로 상단 표기한다.

---

## Decision 017: 공공데이터 원천 메타필드 직수집, Paging Loop 전수 수집, SVCID NULL 병합 적재 및 정밀 로깅

- **날짜**: 2026-08-25
- **상태**: 승인
- **비고**: 사용자 지시 원문의 "Decision 017" 번호를 그대로 사용한다. 직전 기록은 Decision 013이며 014~016은 본 문서에 존재하지 않는다(별도 세션에서 기록되었을 가능성이 있어 임의로 013a 등으로 재번호하지 않고, 사용자가 명시한 번호를 그대로 채택한다).
- **결정 사항**:
  1. **수집 범위 확대**: 서울시 API 4대 대분류(`문화체험`, `교육강좌`, `체육시설`, `공간시설`) 전수 수집(`진료복지` 제외).
  2. **전수 적재 및 테이블 분리**: 데이터 속성에 따라 `open_spaces`(공간/시설: `체육시설`/`공간시설`) 및 `events`(행사/체험/클래스: `문화체험`/`교육강좌`) 테이블로 적합 매핑하여 저장한다. (사용자 지시 원문의 "spaces" 테이블은 본 프로젝트의 기존 실제 테이블명 `open_spaces`를 가리키는 것으로 해석한다 — 제3장 제5조 추측 금지에 따라 신규 테이블을 만들지 않고 기존 스키마를 그대로 사용한다.)
  3. **SVCID NULL 병합 적재**: 동일 `SVCID` 중복 건 발생 시 1건으로 통합하되, 한쪽 컬럼이 NULL이고 다른 쪽에 데이터가 있다면 존재하는 데이터로 컬럼을 채워 병합(Merge) 적재한다. 이는 (a) 한 번의 수집 배치 내 중복과 (b) 기존 DB에 이미 적재된 행과의 충돌 양쪽 모두에 적용한다.
  4. **Null-safe 원본 적재**: 주소/좌표, 요금, 예약 정보 등 미비 항목이 있더라도 드롭 없이 NULL 적재한다. `source` 원천 정보(예: `seoul_public_reservation`)를 필수 표기한다.
  5. **원천 메타필드 직수집**: 대분류(`MAXCLASSNM`), 중분류(`MINCLASSNM` - 농장체험, 서울형키즈카페, 체육관, 전시 등), 접수기간, 이용기간, 서비스상태(`SVCSTATNM`), 이용대상(`USETGTINFO`), 결제구분(`PAYATNM`)을 DB 고유 컬럼/메타로 적재한다. (구현 시 실제 검증된 API 필드명을 기준으로 하며, 사용자 지시 원문의 필드명과 실측 필드명이 다를 경우 실측값을 따르고 그 차이를 구현 기록에 명시한다.)
  6. **Paging 루프 전수 수집**: API 첫 응답의 `list_total_count` 기반으로 START_INDEX~END_INDEX를 1,000건 단위로 자동 증가시키는 Loop를 구현하여 전체 데이터 건수를 100% 순회/수집한다.
  7. **무중단 예외 처리**: 단일 건 파싱 에러 발생 시 수집 스크립트 중단을 방지하고 건별 try-catch로 skip 처리한다.
  8. **파이프라인 정밀 모니터링**: `docs/pipeline-log.md`에 API별 수집/DB적재 건수, 중복 예외/병합 상세(대상 테이블명, 중복 건수, NULL 병합 건수), 에러 상세(원인별 건수)를 일간 기록한다.
  9. **뱃지/카테고리 정화**: 억지 카테고리 매핑 및 체육/공간시설 '키즈' 뱃지 오매핑을 전면 제거한다. `USETGTINFO`에 유아/어린이/초등학생/가족이 명시되거나 `MINCLASSNM`이 키즈/체험 전용 시설인 경우에만 키즈 뱃지를 부여한다.

### 결정 이유
- 서울시 공공서비스예약 통합 API(`tvYeyakCOllect`)가 문화체험/교육강좌/체육시설/공간시설 등 성격이 다른 데이터를 하나의 엔드포인트로 함께 내려주는 것이 실측으로 재확인되어, 성격에 맞는 표준 테이블로 분리 적재해야 데이터 활용도가 높아진다(제2장 제3·4조 콘텐츠·데이터 중심).
- 기존 구현은 위치/날짜 등 일부 메타데이터가 없으면 행 자체를 드롭했는데, 이는 제2장 제4조(데이터는 핵심 자산)에 위배되므로 드롭 대신 정직하게 NULL로 표시해 보존한다.
- 기존 `체육시설 → KIDS_ACTIVITY` 강제 매핑은 실제로는 성인 대상 체육시설도 다수 포함하는 카테고리를 임의로 좁게 재단한 오매핑이었다(제3장 제5조 추측 금지 위반 사례).

### 영향
- **DB 마이그레이션**: `events`/`open_spaces`에 `source` 컬럼 추가, `events`에 `raw_data` 컬럼 추가, `open_spaces.location`의 `NOT NULL` 해제 및 `location_precision` 컬럼 추가(Decision 009와 동일 패턴을 `open_spaces`에도 적용), `get_nearby_spaces_and_events` RPC의 `open_spaces` 분기에 `EXACT` 정밀도 필터 추가.
- **코드 영향 범위**: `scripts/ingest/adapters/seoul-yeyak-adapter.mjs`(MAXCLASSNM 기준 재분류 및 테이블 분리 적재로 전면 재작성), `scripts/ingest/adapters/lib/schema-mapper.mjs`(`buildOpenSpaceRow`에 `locationPrecision`/`source` 지원 추가, `buildEventRow`에 `source`/`rawData` 지원 추가), `scripts/ingest/adapters/base-collector-adapter.mjs`(다중 테이블 분리 적재를 위한 `targetTable: 'multi'` 모드 및 `transformSplit()` 훅 추가), `scripts/ingest/lib/supabase-admin.mjs`(`upsertRowsSafeMerge`의 배치 내 중복도 NULL 병합하도록 개선), `scripts/ingest/lib/ai-tagging.mjs`(공간형 시설 전용 정밀 키즈 뱃지 판별 함수 추가), `docs/pipeline-log.md`(API별 상세 리포트 블록 추가).
- 기존 24개 어댑터(단일 테이블 대상)는 이번 변경으로 동작이 바뀌지 않는다 — 신규 훅/모드는 전부 opt-in이다.


### Decision 018: 일반 사용자 소셜 로그인(Kakao/Google) 및 프로필 연동 도입
- **날짜:** 2026-09-02
- **상태:** 승인 (Approved)
- **맥락:** 자녀 출생년도(`birth_years`), 찜 목록, 방문 이력 등 초개인화 맞춤 큐레이션과 스마트 챗봇 기능을 위해 일반 사용자 인증 시스템(Supabase Auth) 도입이 필수적으로 요구됨. 따라서 기존의 '무로그인 MVP' 정책을 수정하여 소셜 로그인을 도입함.
