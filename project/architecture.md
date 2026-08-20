# local-open-spaces 서비스 아키텍처 (Architecture)

> **SSOT 안내 (Decision 008):** 화면 구조/탐색 흐름의 최상위 기준은 `docs/spec.md` 2(UI/UX 및 화면 구조)이다. 본 문서는 그 구조를 데이터/시스템 레이어 관점에서 풀어 설명한다.

## 1. 기본 구조

`local-open-spaces`는 사용자에게 위치 기반의 **가성비 놀거리(열린 공간·시한성 행사·핫딜) 큐레이션** 경험을 제공하는 서비스이며, 사용자 영역, 관리자 및 데이터 파이프라인 영역으로 구성한다.

각 영역은 독립적인 역할을 가지며, Supabase PostGIS 위치 DB를 중심 축으로 연결된다.

전체 서비스 레이어 구조:

사용자 영역 (PC / Mobile 반응형 웹)
      ↓
하단 5탭 내비게이션: [카테고리] - [내주변(지도)] - [홈, 디폴트] - [찜] - [마이] (`docs/spec.md` 2.3)
      ↓
[홈] 위치 선택기 + 통합 검색바 → 서브탭(홈/특가·핫딜/무료·공공) → 캐러셀 → 5대 카테고리 그리드 → 큐레이션 피드
[내주변] GPS/수동 위치 지정 & 반경(Radius) 설정 → 메인 지도 탐색(Kakao Maps SDK) → 지역별 도감 그리드 / 월별 캘린더
      ↓
상세 정보 모달 (Detail Modal - 카카오맵 길찾기 / 카톡 공유)
      ↓
[찜] 저장 목록 / [마이] 맞춤 알림 설정 (Notification View)

*(하단 5탭 구조와 [홈] 화면 레이아웃은 Decision 008에 따른 신규 확장 목표이며 미착수 상태다. 현재 코드는 상단 3탭(지도/도감/캘린더) 구조로 동작한다 — `implementation/todo.md` 참고)*


관리자 및 데이터 파이프라인 영역
      ↓
공식/공공 API(80%) + 보완 크롤링/제휴 API(20%, 커머스 핫딜 포함) 자동 수집 및 WGS84 좌표 정제 (GitHub Actions, Fail-Safe Skip 적용)
      ↓
AI 태깅(5대 카테고리 매핑 + Parental Checkpoint 뱃지) → Supabase PostGIS DB spatial indexing & RPC Stored Procedures
      ↓
웹 푸시 알림 발송 및 데이터 갱신 모니터링

---

## 2. 서비스 영역 및 화면 레이아웃 구조

### 2.1 사용자 영역 (User Space)

#### 목적
사용자가 현재/지정 위치를 기준으로 주변의 가성비 놀거리(무료 공공 공간, 시한성 이벤트, 핫딜)를 직관적으로 탐색하고 길찾기·공유·알림을 활용할 수 있도록 제공한다.

#### 핵심 탐색 흐름
사용자 접속 (위치 권한 또는 지정 동네 선택)
↓
[홈] 큐레이션 피드 또는 [내주변] 지도 상 위치 반경(1km/5km/10km, 조건부 20km/30km) 마커 및 리스트 피벗
↓
카테고리/Quick 필터(키즈·무료·오늘주말)로 관심 공간/이벤트 선택
↓
상세 모달 확인 (운영 시간, 이용료, 길찾기 링크, 카톡 공유)
↓
[찜] 저장 / 관심 지역·카테고리 웹 푸시 알림 구독

#### 멀티 디바이스 반응형 레이아웃 원칙
- **Mobile (`< 768px`):** Full-screen Map + 하단 바텀시트(Bottom Sheet) 인터페이스
- **Desktop (`>= 768px`):** Left Panel (목록/필터/캘린더) + Right Map View (2단 Split View)

---

### 2.2 관리자 및 자동 수집 영역 (Admin & Data Pipeline)

#### 목적
서비스 운영 비용을 Zero(0원)에 가깝게 유지하면서 공식/공공 API(80%) + 보완 크롤링/제휴 API(20%, 커머스 핫딜 포함)를 지속 수집·정제하고, Supabase PostGIS에 대용량 공간 데이터를 안정적으로 동기화한다.

#### 핵심 역할
- 7대 공공 API 수집 파이프라인 상시 작동 (GitHub Actions Scheduled Workflows), 신규 소스(산림청/네이버 Local/커머스 API)는 확장 예정 (미착수)
- 크롤링/스크래핑 모듈 오류 시 전체 파이프라인을 중단하지 않는 Fail-Safe Skip 적용
- 주소/지번 데이터의 위도·경도(WGS84) 지오코딩 및 PostGIS Geometry 변환
- 중복 이벤트 및 기간 종료 시한성 데이터 자동 정리
- 웹 푸시 알림 대상 큐레이션 및 발송 관리

---

## 3. 핵심 데이터 구조 및 공간 관계

`local-open-spaces`의 핵심 자산은 **PostGIS 위도·경도(Spatial Point) 좌표 중심의 데이터 연결**이다.

주요 데이터 관계:

공공 데이터 API (7대 출처)
      ↓
WGS84 위경도 변환 & PostGIS Geometry Point 생성
      ↓
`spaces` (열린 공간)  <--->  `events` (시한성 이벤트)
      ↓
PostGIS ST_DWithin / ST_Distance 반경 검색 (RPC)
      ↓
사용자 화면 (마커 & 미터 단위를 적용한 거리 순 리스트)

---

## 4. 데이터 관계 및 Entity 정의

### 4.1 열린 공간 (`spaces`)
지속적으로 존재하며 시민들에게 상시/정기 개방되는 무료/공공 장소.
- 예: 쉼터, 공원, 무료 도서관, 주민센터 열린 공간, 어린이 놀이터 등
- 주요 속성: 공간명, 카테고리, 도로명주소, 위치(ST_Point), 운영시간, 편의시설, 이미지 URL

### 4.2 시한성 이벤트 (`events`)
시작일과 종료일이 명확히 정해져 있는 시한성 행사.
- 예: 지역 축제, 거리 공연, 플리마켓, 무료 특강, 팝업 전시 등
- 주요 속성: 행사명, 시작일/종료일, 장소명, 위치(ST_Point), 주관기관, 마감 임박 여부, 상세 URL
- 관계: 특정 `spaces` 내부에서 개최될 경우 `space_id` 외래키(FK) 연결 지원

---

## 5. 데이터 중심 서비스 및 Stored Procedure (RPC) 구조

화면 UI는 DB의 Spatial Query 결과를 표현하는 수단일 뿐이다. 모든 거리 계산과 반경 필터링은 클라이언트(JS)가 아닌 **Supabase PostGIS DB 엔진 내부에서 직접 처리**한다.

구조:
사용자 현재 위치(Lat, Lng) & 검색 반경(Radius)
      ↓
Supabase PostGIS RPC 호출 (`get_nearby_spaces_and_events`)
      ↓
DB 내 인덱싱(GIST)된 반경 매칭 및 거리(`distance_meters`) 자동 계산
      ↓
클라이언트 지도 마커 및 거리순 리스트 렌더링

---

## 6. Zero-Cost 기술 스택 및 AI 활용 아키텍처

### 6.1 Zero-Cost 인프라 구성
- **Frontend / Hosting:** Next.js (App Router), Vercel (Hobby Free Tier)
- **Database & Spatial Engine:** PostgreSQL + Supabase PostGIS (Free Tier)
- **Map & Geocoding SDK:** Kakao Maps API (일일 300,000건 무료)
- **Batch Automation:** GitHub Actions Workflows (무료 CI/CD 러너 기반 수집)

### 6.2 AI 활용 방향
- 공공 API 데이터 수집 시 불명확한 장소 설명 텍스트 자동 요약 및 5대 UI 카테고리 매핑 (`spec/data/ai-rule.md` 3.3)
- 장소/행사 텍스트 데이터를 기반으로 한 Parental Checkpoint 뱃지(가성비/방문시점/실내외/연령 등) 자동 추출
- 요금 정보 오탐 방지 OCR/Fallback 룰 (국공립 시설 `is_free: true` 우선 추정, 미착수)
- 데이터가 축적된 후 사용자 맞춤 취향 큐레이션 알고리즘 연결

---

## 7. 현재 아키텍처 방향 및 노출 제어 (Feature Toggling)

### Phase 1 (구현 완료)
GitHub Actions  →  7대 공공 API 수집  →  AI 태깅  →  Supabase PostGIS  →  Kakao Map & 반응형 UI (상단 3탭: 지도/도감/캘린더)

### Phase 2 (Decision 008 확장 목표, 미착수)
보완 크롤링/커머스 API 수집  →  하단 5탭 내비게이션 + 홈 캐러셀/큐레이션 피드  →  찜 기능 오픈

### 향후 확장 준비 및 코드 선제 구현 원칙
- 선제적으로 구현된 확장 기능(소셜 커뮤니티, 고급 필터링, 회원 맞춤 북마크 등)은 백엔드/프론트엔드 모듈 수준에서 유연하게 작성을 허용한다.
- 단, 승인된 Spec에 포함되지 않거나 미오픈 처리된 기능은 **화면상에서 비활성화(Disabled) 또는 Hidden 처리**하여 사용자에게 노출하지 않는다.
- 스펙 변경 및 승인 후 UI 플래그를 전환하여 즉시 서비스에 반영한다.
