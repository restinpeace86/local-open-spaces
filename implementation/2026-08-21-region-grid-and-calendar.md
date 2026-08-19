# 지역별 도감 그리드 + 월별 캘린더 뷰 구현

## 구현 대상
- 상단 탭 내비게이션(지도/도감/캘린더)
- 지역별 도감 그리드 뷰 (자치구/카테고리 필터, 카드 클릭 → 상세 모달)
- 월별 캘린더 뷰 (월 이동, 날짜별 행사 칩, 접수/진행 상태 뱃지, 클릭 → 상세 모달)

## 구현 일시
2026-08-21

## 사전 확인
- `spec/` 디렉토리에는 도감 그리드/캘린더 전용 스펙 문서가 없음 (`project/overview.md`, `architecture.md`에 탐색 흐름 개념만 언급). 이번 구현은 사용자가 이 대화에서 직접 전달한 요구사항을 기준으로 진행했으며, 정식 spec 문서화는 되어 있지 않은 상태임을 명시해둠

## 변경 사항

### 공용 유틸/훅 (지도 뷰와 중복 방지 위해 추출)
- `src/lib/geo/haversine.ts`: 두 좌표 간 직선거리 계산
- `src/hooks/use-user-location.ts`: 위치 획득 훅 — 기존 `MapExplorer`에 인라인돼 있던 geolocation 로직을 추출해 3개 뷰(지도/도감)에서 공용으로 사용하도록 리팩터링 (동작 변경 없음)
- `src/lib/spaces/extract-district.ts`: 주소 문자열에서 자치구(시/군/구) 파싱 — DB에 별도 district 컬럼이 없어 이미 저장된 `address` 값에서 두 번째 토큰을 파싱하는 방식으로 구현
- `src/lib/spaces/get-all-spaces.ts`: 반경 무관 전체 `open_spaces` 카탈로그 조회 (Supabase PostgREST가 geometry 컬럼을 GeoJSON으로 직렬화하는 것을 실제 호출로 확인 후 파싱)
- `src/lib/spaces/get-events-for-month.ts`: 월과 기간이 겹치는 전체 `events` 조회
- `src/lib/spaces/event-status.ts`: 접수중/오늘마감/접수마감/예정/진행중 상태 판정
- `src/lib/spaces/calendar-grid.ts`: 일요일 시작 6주(42칸) 캘린더 그리드 + 날짜별 매칭 이벤트 구성
- `src/components/map/category-filter.tsx`: `options` prop 추가해 표시할 카테고리를 제한할 수 있도록 확장 (도감 뷰는 공간 카테고리만 사용)
- `src/components/map/item-list-panel.tsx`, `detail-modal.tsx`: 거리 정보가 없는 경우(`distance_meters < 0`, 캘린더에서 사용) 거리 표시를 숨기도록 방어 처리

### 내비게이션
- `src/components/nav/top-tabs.tsx`: 지도/도감/캘린더 탭, 현재 경로 기준 활성 표시
- `src/app/layout.tsx`: `TopTabs` 상단 고정 추가

### 도감 그리드 뷰
- `src/app/region/page.tsx`, `src/components/region/region-grid-view.tsx`, `space-grid-card.tsx`
- 자치구 드롭다운(데이터에서 동적으로 추출) + 카테고리 칩(공원/체육시설/문화기반시설) 필터, 결과 없을 시 EmptyState

### 월별 캘린더 뷰
- `src/app/calendar/page.tsx`, `src/components/calendar/calendar-view.tsx`
- 월 이동, 날짜 셀당 최대 2개 칩 + "+N건 더보기", 날짜 클릭 시 하단에 해당 일자 전체 목록(상태 뱃지 포함) 노출, 칩/목록 클릭 시 `DetailModal` 재사용

## 검증 결과
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과 (라우트 3개: `/`, `/region`, `/calendar` 정상 생성)
- Playwright 실브라우저 검증:
  - 상단 탭 클릭으로 지도→도감→캘린더 전환, 활성 탭 하이라이트 정상
  - 도감: 전체 카탈로그 렌더링, "강남구" 지역 필터 선택 시 85건으로 정확히 축소, 카드 클릭 → `DetailModal`(거리 "9.6km" 포함) 정상 표시
  - 캘린더: "2026년 8월" → "▶" 클릭 시 "2026년 9월"로 정상 이동, 날짜 칩 클릭 → `DetailModal`(거리 라인 없이 행사기간/예약안내 정상 표시)
  - 모바일 뷰포트(390×844)에서 도감(2열 그리드)/캘린더 모두 정상 렌더링
  - 콘솔 에러 0건

## 특이 사항
- **캘린더 시각적 밀도 이슈 (알려진 한계, 후속 논의 필요)**: 데이터의 상당수(Source #04 공공서비스예약)가 `2026-01-01~2026-12-31`처럼 연중 상시 예약 가능한 "시설 슬롯" 형태라, 요구사항대로 정확하게 구현한 결과 거의 모든 날짜 셀에 같은 항목들이 반복 노출되고 "+500건 더보기" 식으로 매우 혼잡하게 보임. 이는 코드 버그가 아니라 데이터 특성과 "날짜별로 겹치는 모든 행사 표시"라는 요구사항을 그대로 구현한 결과임. 예약형 행사를 캘린더에서 제외하거나, 기간이 긴 항목을 우선순위 하위로 정렬하는 등의 개선은 임의로 판단하지 않고 사용자 확인 후 반영 필요 (`implementation/todo.md`에 기록)
- 도감 카드는 정렬 기준을 이름 가나다순으로 고정 (`order('name')`). 거리순/카테고리순 등 다른 정렬 옵션은 요구사항에 없어 미포함
- `extractDistrict`는 완벽한 행정구역 파서가 아니라 주소 토큰 위치 기반 휴리스틱 — 대부분의 국내 주소에 잘 맞지만 예외적인 주소 형식에서는 "기타"로 분류될 수 있음
