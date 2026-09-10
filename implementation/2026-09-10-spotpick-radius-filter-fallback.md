# 스팟픽 바텀시트 반경 필터/거리순 정렬/건수 — GPS 없을 때 폴백 (개선사항2-1·2-5 / Step 93)

## 구현 대상
`implementation/todo.md` 개선사항2:
- **1. 위치 기반 반경 필터 및 정렬 버그**: "사용자 현재 위치(예: 판교원로 68)
  기준 반경 10km(Default)를 설정했음에도... 전혀 범위를 벗어난 원거리 지역(예:
  경북 칠곡군 등)의 장소들이 상단에 노출". 요구: 선택된 반경(5/10/20km) 내
  데이터만 엄격 필터, 거리 가까운 순 정렬 고정, 직선 거리(km) 표시.
- **5. 반경 내 카운트(274건) 로직 검증**: "표시되는 '274건'이라는 전체 결과
  수와 리스트 내용이 실제 반경과 맞지 않습니다" — 반경 내 실제 포함 건수로
  카운트되어야 함.

## 구현 일시
2026-09-10

## 원인
`src/components/map/map-explorer.tsx`의 `mobileSheetItems`(바텀시트 리스트 +
건수 소스)는 반경 필터·거리순 정렬·거리 표시를 **실시간 GPS 좌표
(`liveGpsPosition`)가 있을 때만** 적용하고, 없으면(`!liveGpsPosition`) 노출
중분류 전역 조회 결과(전국구)를 `slice(0, 1000)`만 해서 그대로 내려주고 있었다.
→ GPS 권한 거부/미허용 상태에서는 반경과 무관한 원거리 스팟(경북 칠곡 등)이
그대로 노출되고, 상단 "N건" 카운트도 전국구 개수(예: 274건)가 됐다.

## 변경 사항
### `src/components/map/map-explorer.tsx`
- 거리 계산 기준점을 `liveGpsPosition ?? effectiveCenter`로 폴백
  (`originLat`/`originLng`). `effectiveCenter`(= `searchOverrideCenter ?? center`,
  사용자가 온보딩/설정한 위치)는 항상 존재하므로, GPS가 없어도 반경 필터·
  거리순 정렬·거리(km) 계산·건수 카운트가 **항상** 적용된다.
- `mobileSheetItems` useMemo: `if (isSearchMode || !liveGpsPosition)` early-return을
  `if (isSearchMode)`로 축소(검색 모드는 기존대로 이름 검색 우선이라 재정렬
  제외). deps를 `liveGpsPosition` → `originLat, originLng` 프리미티브로 교체.

### `src/components/map/map-explorer.test.tsx`
- 기존 "GPS 거부 시 전체 목록 그대로(폴백)" 테스트를 "GPS 거부 시 설정 위치
  기준 반경 필터/거리순 정렬 적용"으로 재작성 — 반경 밖(부산) 스팟이 바텀시트
  건수/목록에서 빠지고 데스크톱 목록에만 남는 것을 검증.

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 121 파일 1407건 통과.
- `npm run build`: Compiled successfully.

## 범위 밖 / 후속
- **2-5 지도 마커 광역 경계 제한**("판교원로68이면 경기+서울만 지도에 노출,
  대구/세종 제외"): 현재 지도 마커(`visibleItems`)는 Decision("반경 컷오프 완전
  폐지 + 도 전역 노출", `get_spots_by_service_category` RPC는 지역 필터 없음)에
  따라 전국 조회 결과를 그대로 쓴다. 마커를 광역 경계로 제한하는 것은 그
  Decision과 상충할 수 있어 이번 커밋에서 다루지 않았다 — todo.md 진행 상태에
  "Decision 확인 필요"로 기록.
- **데스크톱 좌측 `ItemListPanel`**은 여전히 `visibleItems`(전역)를 쓴다 —
  모바일 바텀시트와 일관되게 하려면 별도 판단 필요(주 사용 표면은 모바일
  바텀시트라 이번 범위에서는 바텀시트만 수정).
- 2-2/2-3/2-4/2-6/2-7은 각각 별도 Step으로 진행.
