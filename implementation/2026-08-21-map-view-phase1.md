# 지도 뷰(1단계) 구현 + DB 데이터 표준화 사전 검증

## 구현 대상
- UI 착수 전 요청받은 DB 데이터 정제 상태 검증 및 RPC 표준화 검증
- `spec/map/kakao-map.md`, `spec/map/spatial-search.md`, `spec/common/responsive.md`, `spec/common/search.md` 기준 지도 뷰 1단계 구현

## 구현 일시
2026-08-21

## 사전 검증 결과 (UI 착수 전 요청 사항)

### 1. DB 데이터 정제 상태
```
table_name    total  null_name  null_category  null_location  out_of_range
open_spaces   1275   0          0              0              0
events        2514   0          0              0              0
```
- 필수 컬럼(name/title, category, location) null 0건, 위경도 범위(위도 33~39 / 경도 124~132) 이탈 0건
- open_spaces 1,275건 = 도시공원 200 + 문화공간 1,075 / events 2,514건 = 서울문화행사 20 + 공공서비스예약 2,494 (기존 upsert 합계와 일치)

### 2. RPC 표준화 검증 (반경 검색, 소스별 샘플)
은평구 중심(126.9296, 37.6027) 반경 8km 조회 시 소스별 대표 1건씩:
```json
[
  { "item_type": "SPACE", "name": "은평문화예술회관", "category": "CULTURE", "source_tag": "CULTURE_FACILITY" },
  { "item_type": "SPACE", "name": "시루메어린이공원", "category": "PARK", "source_tag": "PARK_API" },
  { "item_type": "EVENT", "name": "2026 인사동 엔틱&아트페어", "category": "FESTIVAL", "source_tag": "SEOUL_CULTURE" },
  { "item_type": "EVENT", "name": "서울형 키즈카페 은평구 응암1동점", "category": "RESERVATION", "source_tag": "SEOUL_RESERVATION" }
]
```
Source #01/#03/#04/#05 네 소스 모두 동일한 표준 객체 구조(`id/name/category/distance_meters/item_type`)로 정상 통합됨을 확인. → **표준화 이상 없음, 지도 뷰 구현 진행**

## 변경 사항 (지도 뷰 1단계)

### RPC 확장 (선행 필수 작업)
- `supabase/migrations/20260821000000_extend_nearby_rpc_with_coordinates.sql`: 기존 RPC(`project/database_schema.md` 4.1)는 지도 마커에 필요한 좌표를 반환하지 않아 마커 렌더링이 불가능했음. 좌표(`lng`,`lat`)와 카드 표시용 필드(`address`,`thumbnail_url`,`start_date`,`end_date`,`reservation_end_date`)를 추가하고, `spec/map/spatial-search.md` 3.1의 "최대 200개 마커" 정책에 맞춰 `limit 201`(200개 초과 여부 판별용) 적용
- 이미 승인된 지도 스펙을 실제로 구현 가능하게 하는 필수 보완이며, 임의의 신규 기능 추가 아님

### 프론트엔드
- `src/lib/kakao/load-kakao-sdk.ts`: Kakao Maps SDK 비동기 로드 (`autoload=false` → `kakao.maps.load()`)
- `src/lib/kakao/marker-image.ts`: 카테고리별 색상 SVG 커스텀 마커 이미지 생성
- `src/lib/spaces/get-nearby.ts`, `category-meta.ts`, `d-day.ts`: RPC 호출 래퍼, 표준 카테고리→색상/라벨 매핑, D-day 계산
- `src/components/map/`: `kakao-map-view.tsx`(지도+마커+클러스터러), `radius-selector.tsx`(1/5/10km), `layer-toggle.tsx`(상시시설 On/Off), `item-list-panel.tsx`, `item-info-card.tsx`, `toast.tsx`(200건 초과 안내), `map-explorer.tsx`(전체 조립 + 반응형 레이아웃 + 위치 획득)
- `src/app/page.tsx`: `MapExplorer`로 교체 (메인 화면 = 지도 탐색, `project/architecture.md` 흐름과 일치)
- `src/app/layout.tsx`: `body`를 `h-dvh flex flex-col overflow-hidden`으로 변경 (풀스크린 지도 레이아웃 지원)
- `src/types/kakao.d.ts`: Kakao Maps SDK v2 최소 타입 선언 (공식 타입 패키지 미제공)

## 검증 결과
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과
- Playwright로 `npm run dev` 실행 후 실제 브라우저 렌더링 확인:
  - 반경 선택(1/5/10km, 5km 기본 선택 표시), 상시 시설 토글, 데스크톱 좌측 리스트 패널, 모바일 바텷시트("주변 65건 목록 보기") 모두 정상 렌더링
  - 실제 DB 데이터가 리스트에 정상 표시됨 (예약형 행사 D-day 계산 포함: D-133, D-12, D-8 등)
  - **Kakao 지도 타일 자체는 렌더링 실패**: SDK 요청이 `401 domain mismatched! caller=http://localhost:3000`로 거부됨 (직접 fetch로 재현 확인). 사용자가 Kakao Developers에 `http://localhost:3000`을 등록했다고 안내했으나 실제로는 거부되고 있어 등록 상태 재확인 필요

## 특이 사항
- **Kakao Maps 도메인 등록 이슈**: 코드 문제 아님. `https://dapi.kakao.com/v2/maps/sdk.js?appkey=...`를 `Referer: http://localhost:3000/`로 직접 호출해도 동일하게 401 거부됨. Kakao Developers 콘솔의 "Web 플랫폼 도메인" 등록 상태(정확한 URL 형식, 저장 여부, 어떤 앱에 등록했는지)를 재확인 필요
- 커스텀 마커는 이미지 파일 대신 색상별 SVG data URI로 구현 (별도 디자인 에셋이 없는 MVP 단계 판단, `spec/map/kakao-map.md` 4.1의 "커스텀 HTML 마커 이미지" 요건은 충족)
- 검색 바(키워드 debounce 검색)와 카테고리 칩 필터(`spec/common/search.md` 2.1, 2.3), 10km 초과 시도 시 광역 그리드 전환 안내(`spec/common/search.md` 2.2)는 1단계 범위에서 제외 — 다음 단계로 `implementation/todo.md`에 기록
