# 데이터베이스 아키텍처 및 스펙 정의 (project/database_schema.md)

## 1. 개요

본 문서는 `local-open-spaces` 프로젝트에서 사용하는 Supabase PostgreSQL 데이터베이스의 전체 스키마 구조, PostGIS 공간 확장 활용 방안, 그리고 권한 통제(RBAC) 정책을 정의한다.

모든 데이터 구조는 **Zero-Cost 인프라 및 고성능 공간 연산 원칙(Decision 001, Decision 002)**을 준수하여 설계되었다.

---

## 2. 사용 중인 PostgreSQL 익스텐션 (Extensions)

- **`uuid-ossp`**: 기본 키 생성용 UUID 함수 지원
- **`postgis`**: 위경도 공간 좌표 연산(`ST_MakePoint`, `ST_Distance` 등) 및 지리적 인덱싱 지원

---

## 3. 핵심 테이블 구조 (Core Tables)

### 3.1. 열린 공간 (`public.open_spaces`)
전국 도시공원, 공공체육시설, 문화기반시설 등 고정된 위치 기반의 공간 정보를 저장하는 테이블이다.

| 컬럼명 | 데이터 타입 | 제약조건 / 기본값 | 설명 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT `gen_random_uuid()` | 내부 고유 ID |
| `external_id` | VARCHAR(100) | UNIQUE, NOT NULL | 공공 API 원본 제공 고유 ID (Upsert 기준 키) |
| `source_type` | VARCHAR(50) | NOT NULL | 수집 출처 구분 (예: `PARK_API`, `CULTURE_FACILITY`) |
| `name` | VARCHAR(255) | NOT NULL | 공간(시설) 명칭 |
| `category` | VARCHAR(50) | NOT NULL | AI 파이프라인으로 정제된 표준 카테고리 |
| `address` | TEXT | NOT NULL | 도로명 또는 지번 주소 |
| `location` | GEOMETRY(Point, 4326) | NOT NULL | WGS84 좌표계 기준 공간 포인트 (Lng, Lat) |
| `is_free` | BOOLEAN | DEFAULT `true` | 무료 이용 가능 여부 |
| `operating_hours` | TEXT | NULL | 운영 시간 안내 |
| `info_url` | TEXT | NULL | 상세 정보 웹사이트 링크 |
| `raw_data` | JSONB | NULL | 공공 API 원본 응답 데이터 보관 |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | 레코드 생성 일시 |
| `updated_at` | TIMESTAMPTZ | DEFAULT `NOW()` | 레코드 최종 갱신 일시 |
| `is_kids_friendly` | BOOLEAN | DEFAULT `false` | 키즈/어린이 친화 여부 |
| `has_parking` | BOOLEAN | DEFAULT `false` | 주차 가능 여부 |
| `stroller_accessible` | BOOLEAN | DEFAULT `false` | 유모차 접근 가능 여부 |
| `facility_type` | VARCHAR(20) | DEFAULT `'복합'` | 시설 유형 (`실내` \| `야외` \| `복합`) |
| `target_age_group` | VARCHAR(50) | NULL | 대상 연령대 (예: `영유아`, `초등`, `전연령`) |

- **공간 인덱스**: `CREATE INDEX idx_open_spaces_location ON public.open_spaces USING GIST(location);`

---

### 3.2. 시한성 이벤트 및 행사 (`public.events`)
특정 기간 또는 일정에 개최되는 문화행사, 축제, 공연, 체험 프로그램 정보를 저장하는 테이블이다.

| 컬럼명 | 데이터 타입 | 제약조건 / 기본값 | 설명 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | PRIMARY KEY, DEFAULT `gen_random_uuid()` | 내부 고유 ID |
| `external_id` | VARCHAR(100) | UNIQUE, NOT NULL | 공공 API 원본 이벤트 고유 ID |
| `space_id` | UUID | REFERENCES `public.open_spaces(id)` ON DELETE SET NULL | 연계된 공간 ID (선택 사항) |
| `title` | VARCHAR(255) | NOT NULL | 행사/이벤트명 |
| `event_type` | VARCHAR(50) | NOT NULL | 행사 유형 (축제, 전시, 공연, 팝업 등) |
| `start_date` | DATE | NOT NULL | 행사 시작일 |
| `end_date` | DATE | NOT NULL | 행사 종료일 |
| `is_reservation_required` | BOOLEAN | DEFAULT `false` | 사전 예약 필요 여부 |
| `reservation_start_date` | TIMESTAMPTZ | NULL | 예약 접수 시작 일시 |
| `reservation_end_date` | TIMESTAMPTZ | NULL | 예약 접수 마감 일시 (언제까지 예약해야 하는가) |
| `reservation_url` | TEXT | NULL | 예약 신청 링크 |
| `location` | GEOMETRY(Point, 4326) | NOT NULL | 행사 장소 위경도 좌표 |
| `thumbnail_url` | TEXT | NULL | 대표 이미지 URL |
| `is_active` | BOOLEAN | DEFAULT `true` | 활성화 상태 여부 |
| `created_at` | TIMESTAMPTZ | DEFAULT `NOW()` | 레코드 생성 일시 |
| `source_type` | VARCHAR(50) | NOT NULL | 수집 출처 구분 |
| `category` | VARCHAR(50) | NOT NULL | AI 파이프라인으로 정제된 표준 카테고리 |
| `is_free` | BOOLEAN | DEFAULT `false` | 무료 행사 여부 |
| `is_kids_friendly` | BOOLEAN | DEFAULT `false` | 키즈/어린이 친화 여부 |
| `has_parking` | BOOLEAN | DEFAULT `false` | 주차 가능 여부 |
| `stroller_accessible` | BOOLEAN | DEFAULT `false` | 유모차 접근 가능 여부 |
| `facility_type` | VARCHAR(20) | DEFAULT `'복합'` | 시설 유형 (`실내` \| `야외` \| `복합`) |
| `target_age_group` | VARCHAR(50) | NULL | 대상 연령대 (예: `영유아`, `초등`, `전연령`) |
| `booking_status` | VARCHAR(50) | NULL | 예약/접수 상태 (`오늘방문` \| `D-1 마감임박` \| `주말예약` \| `접수중`) |

- **공간/일자 인덱스**:
  - `CREATE INDEX idx_events_location ON public.events USING GIST(location);`
  - `CREATE INDEX idx_events_dates ON public.events(start_date, end_date);`
  - `CREATE INDEX idx_events_reservation ON public.events(reservation_end_date);`

---

## 4. PostGIS 핵심 공간 연산 함수 (RPC Stored Procedures)

클라이언트 연산 부하를 줄이고 반경 검색 성능을 극대화하기 위해 PostgreSQL 내장 함수(RPC)를 활용한다. (Decision 002)

### 4.1. 주변 열린 공간 및 행사 조회 함수 예시
```sql
CREATE OR REPLACE FUNCTION get_nearby_spaces_and_events(
    user_lng DOUBLE PRECISION,
    user_lat DOUBLE PRECISION,
    radius_meters INT DEFAULT 3000
)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    category VARCHAR,
    distance_meters FLOAT,
    item_type VARCHAR
) AS $$ BEGIN     RETURN QUERY     SELECT          s.id,          s.name,          s.category,          ST_Distance(s.location::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) AS distance_meters,         'SPACE'::VARCHAR AS item_type     FROM public.open_spaces s     WHERE ST_DWithin(s.location::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography, radius_meters)          UNION ALL          SELECT          e.id,          e.title AS name,          e.event_type AS category,          ST_Distance(e.location::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography) AS distance_meters,         'EVENT'::VARCHAR AS item_type     FROM public.events e     WHERE e.is_active = true        AND ST_DWithin(e.location::geography, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography, radius_meters); END; $$ LANGUAGE plpgsql;
