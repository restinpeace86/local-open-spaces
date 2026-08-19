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
