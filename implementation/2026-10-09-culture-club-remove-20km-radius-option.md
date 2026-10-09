# 문화센터 반경 선택지에서 20km 제거

## 구현 대상
사용자 지시(2026-10-09): "하나 바꾸자 현재 위치반경 변경이 5km 10km 20km
돼있는데 20km는 너무 먼거같고 필요없어보여 그냥 10km 로 하고 위치반경
변경못하도록 하고.." → 이후 "아니다 다시 그냥 20km만 빼자"로 번복 —
반경을 10km로 잠그지 않고, 5km/10km는 그대로 선택 가능하게 두고 20km
옵션만 제거한다.

## 구현 일시
2026-10-09

## 변경 사항
- `src/components/home/culture-club-tab-view.tsx`: `RADIUS_KM_OPTIONS`를
  `[5, 10, 20]` → `[5, 10]`으로 변경(`DEFAULT_RADIUS_KM=10` 유지). 이
  옵션은 `map-explorer.tsx`(스팟픽 지도 탐색)의 반경 선택과 구성만 같았을
  뿐 별개 상수라, map-explorer.tsx는 건드리지 않았다(사용자 지시 범위는
  문화센터 화면 한정).
- `src/components/home/culture-club-tab-view.test.tsx`: '20km' 클릭
  테스트 2건을 '5km' 클릭으로 교체(20km 옵션 자체가 없어졌으므로).

## 확인한 선행 질문(코드 변경 없음)
같은 대화에서 사용자가 재확인 요청한 3가지를 직접 조사해 답변만 했다
(코드 수정 불필요, 이미 정상 동작):
- 8개 브랜드 전부 지오코딩 완료 여부: 활성 강좌가 있는 모든 브랜드
  (emart/lottemart/hyundai/shinsegae/ak_plaza/starfield/lotte_department)
  의 활성 지점 전수를 `open_spaces`와 대조해 **누락 0건** 확인(eland_retail
  은 현재 활성 강좌 자체가 0건이라 대조 대상 없음 — 기존에 확인한 사실과
  동일).
- "코어 데이터 캐싱 & 로컬 필터링" 아키텍처(위치/반경/아이 나이로만 서버
  재조회, 나머지는 메모리 필터): 2026-10-08 todo.md 개선사항1로 이미
  구현돼 있음을 코드로 재확인(`culture-club-tab-view.tsx`의 `basePool`/
  `buildBasePoolUrl`/`filteredItems`).
- 로그인 게이팅: `home-view.tsx`가 문화센터 탭 진입 자체를 비로그인(guest)
  →로그인 유도, 새싹맘 미달→새싹맘 안내로 막고 있음을 확인(이미 구현됨).

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(314개 파일 **3,170개**) /
  `npm run build` 전부 통과.
