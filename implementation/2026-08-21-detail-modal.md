# 상세 정보 모달 / 바텀시트 구현

## 구현 대상
- `spec/space/space-detail.md`, `spec/event/event-detail.md` 기준 공간/행사 상세 정보 모달
- 마커 또는 리스트 카드 클릭 시 지도 panTo + 모달 활성화 (`spec/space/space-card.md` 3, `spec/event/event-card.md` 3)

## 구현 일시
2026-08-21

## 변경 사항

### RPC 확장 (2차)
- `supabase/migrations/20260821010000_extend_nearby_rpc_with_detail_fields.sql`: `get_nearby_spaces_and_events`에 `reservation_start_date`, `reservation_url`, `is_reservation_required`, `operating_hours`, `is_free`, `info_url` 추가. 상세 모달의 CTA/정보 영역을 채우기 위한 필수 선행 작업

### 프론트엔드
- `src/components/map/detail-modal.tsx`: 신규. 데스크톱은 중앙 모달, 모바일은 하단 바텀시트로 반응형 표시
  - 헤더: 카테고리 칩, D-day(이벤트), 무료/유료 뱃지(공간), 제목, 거리, 닫기 버튼
  - 이벤트: 썸네일, 행사 기간, 예약 안내(마감 일시 포함)
  - 공간: 주소(복사 버튼 포함), 운영시간 — 값 없을 시 "정보 준비 중 (공공 기관 문의)" fallback (`space-detail.md` 3)
  - CTA: 길찾기(카카오맵, `https://map.kakao.com/link/to/{name},{lat},{lng}`) + 예약하기(이벤트)/상세 정보 보기(공간, `info_url` 있을 때만)
  - 백드롭 클릭 또는 X 버튼으로 닫기
- `src/lib/kakao/directions-url.ts`: 카카오맵 길찾기 URL 빌더
- `src/lib/spaces/format.ts`: 거리(m/km), 기간, 일시 포맷 헬퍼
- `src/components/map/kakao-map-view.tsx`: `focusPosition` prop 추가 — 선택된 아이템 좌표로 `map.panTo()` 부드러운 이동 (검색 중심축인 `center`와는 별도 상태로 분리해, 마커 클릭이 반경 검색을 재실행시키지 않도록 함)
- `src/components/map/map-explorer.tsx`: 기존 `ItemInfoCard`(미니 카드)를 제거하고 `DetailModal`로 교체 — 사용자 요청에 따라 마커/리스트 카드 클릭 모두 상세 모달로 직접 연결
- `src/components/map/item-info-card.tsx`: 삭제 (더 이상 사용되지 않는 컴포넌트, 중복 방지)
- `src/types/kakao.d.ts`: `Map.panTo()` 타입 추가

## 검증 결과
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과
- Playwright 실브라우저 검증 (`npm run dev` 후):
  - 리스트 카드 클릭 → 모달 표시(길찾기/예약하기 버튼 노출) → X 버튼으로 닫기 → 마커 클릭 → 모달 표시 → 백드롭 클릭으로 닫기: 전부 정상
  - 이벤트 상세: 썸네일, "예약형 행사 D-133", 제목, "현재 위치에서 25m", "행사 기간 2026-02-04 ~ 2026-12-31", "예약 안내 사전 예약 필수 / 마감: 2026년 12월 31일 오전 09:00", 길찾기/예약하기 버튼 — 전부 스펙대로 정상 렌더링
  - 공간 상세: "문화기반시설"/"무료" 칩, 제목, 거리, "주소 서울특별시 중구 세종대로 110... [복사]", "운영시간 정보 준비 중 (공공 기관 문의)" fallback, 길찾기/상세 정보 보기 버튼 — 전부 정상
  - 클립보드 복사: Playwright 컨텍스트에 `clipboard-write` 권한 부여 후 재검증 → "복사됨" 텍스트 정상 표시 확인
  - 모바일 뷰포트(390×844)에서 바텀시트 형태로 정상 렌더링
  - 콘솔 에러 0건

## 특이 사항
- **panTo와 검색 중심(center) 분리**: 마커/카드 클릭 시 지도만 부드럽게 이동해야 하고 반경 검색 자체가 재실행되면 안 되므로, `center`(검색 기준점)와 별도로 `focusPosition`(지도 뷰 이동 전용) 상태를 분리함. 하나의 상태로 합쳤다면 카드를 클릭할 때마다 검색 결과가 클릭한 위치 기준으로 바뀌는 버그가 생겼을 것
- **이벤트의 주소 미표시**: `events` 테이블에는 `address` 컬럼이 없어(스키마상 `location`만 존재) 이벤트 상세에는 주소를 표시하지 않음. 필요 시 역지오코딩 추가를 고려할 수 있으나 이번 범위에는 포함하지 않음
- **관련 행사 보기(연계 리스트), 즐겨찾기 버튼**: `space-detail.md`에 언급되어 있으나 사용자가 명시한 "주요 정보 4가지"에는 포함되지 않아 이번 구현에서 제외함. 즐겨찾기는 Decision 003에 따라 미승인 확장 기능이라 Feature Flag 없이는 노출 금지 대상이기도 함 — `implementation/todo.md`에 다음 단계로 기록
- Kakao 지도 이미지는 외부 다중 호스트(yeyak.seoul.go.kr, culture.seoul.go.kr 등)에서 오는 썸네일이라 `next/image` 대신 일반 `<img>` 태그 사용 (도메인별 remotePatterns 등록 부담 회피)
