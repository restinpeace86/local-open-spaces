# [UI/UX 개선] 외부 지도 앱 연동 제거 및 '스팟픽' 인앱 지도/위치 표시 기능 구현

## 요구사항
1. 네이버 지도 등으로 나가던 길찾기/위치 보기 버튼의 외부 연동 동작 제거.
2. 상세 모달 내부에 좌표 기반 인앱 지도(핀 포함) 도입.
3. 직관적인 UI로 위치를 앱 안에서 바로 인지할 수 있게 정리.

## 구현 일시
2026-08-30

## 사전 조사 — 인앱 지도 인프라는 이미 대부분 존재했음

코드를 조사한 결과, 요구사항 2/3(인앱 지도 컴포넌트, 핀 표시, 직관적 UI)은 이미
`MiniMap`(`src/components/map/mini-map.tsx`, Kakao Maps SDK 기반 단일 마커 지도)과
`MapPreviewModal`(`src/components/map/map-preview-modal.tsx`, 풀스크린 인터랙티브
지도)로 `DetailModal`에 구현돼 있었다(Task 9-5-1, 2026-08-22) — `location_precision`이
`EXACT`일 때만 노출해 근사 좌표를 정확한 핀처럼 오인시키지 않는 안전장치까지 이미
갖춰져 있었다. project/decision-log.md 확인 결과 이 프로젝트의 지도 SDK는 애초에
Kakao Maps(무료 티어)로 정해져 있어 새 지도 라이브러리를 도입하지 않고 그대로
재사용했다(제5장 제4조 기존 구조 우선).

**실제로 남아 있던 문제는 요구사항 1 하나였다**: `DetailModal`의 조건부 CTA 3분류
(Task 9-6-11, Decision 011) 중 세 번째 옵션("그 외의 경우")이 여전히
`buildNaverMapDirectionsUrl()`(`src/lib/navigation.ts`)로 만든 `nmap://route/car?...`
딥링크를 `<a target="_blank">`로 열어, 예약/예매 링크가 없는 스팟(공공 예약도 할인
예매도 아닌 일반 공원 등)을 누르면 네이버 지도 앱/웹으로 튕겨 나가고 있었다.
`grep`으로 전수 확인한 결과 이 컴포넌트가 앱 전체에서 유일한 외부 지도 연동
지점이었다(`/nearby`의 `map-explorer.tsx`도 동일한 `DetailModal`을 재사용).

## 변경 내용

### `src/components/map/detail-modal.tsx`
- Decision 011의 3번째 CTA를 `{ label: '🗺️ 길찾기', href: 외부딥링크 }`(`<a
  target="_blank">`)에서 `{ type: 'map', label: '🗺️ 지도에서 보기' }`(`<button
  onClick={() => setIsMapPreviewOpen(true)}>`)로 교체 — 이미 미니맵의 "🔍 크게보기"가
  여는 것과 동일한 `MapPreviewModal`을 재사용한다(새 지도 컴포넌트를 만들지 않음).
  좌표가 정확하지 않으면(`hasExactLocation === false`) 여전히 아무 CTA도 뜨지 않는다
  (오도 방지 원칙 그대로 유지).
- `buildNaverMapDirectionsUrl` import와 그 계산에만 쓰이던 `useUserLocation()` 호출을
  제거했다(더 이상 "내 위치 ➔ 목적지" 출발지를 계산할 필요가 없음 — 길찾기가 아니라
  단순 위치 확인이므로).

### 삭제된 파일
`src/lib/navigation.ts`/`navigation.test.ts` — `buildNaverMapDirectionsUrl`의 유일한
소비처가 사라져 전체 앱에서 완전히 미사용 상태가 됐다(grep으로 확인 후 삭제, 제7장
제4조와 무관 — 사용자가 직접 이 동작 제거를 지시했으므로 임의 기능 삭제가 아님).

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(67파일 691건 — 네이버 딥링크 검증 테스트를 인앱 지도 모달 오픈
  검증으로 교체, CTA 폴백 라벨 갱신) 통과.
- `npm run build` 통과.

### 실측 검증
로컬 개발 서버로 `/nearby` 페이지가 정상 렌더링됨을 확인했고, 페이지 HTML에
`nmap://` 문자열이 전혀 남아있지 않음을 확인했다(전수 grep). `DetailModal`의 지도
CTA는 클라이언트 상호작용(마커 클릭 → 모달 오픈)에 의존해 SSR HTML만으로는
검증되지 않아, 정확한 버튼 타입(`<button>`, `<a>` 아님)과 클릭 시 인앱 모달이 열리는
동작은 컴포넌트 단위 테스트로 검증했다.

## 특이 사항
- Decision 011("상세페이지 CTA 버튼 3분류... 길찾기") 자체를 폐기한 것이 아니라, 세
  번째 분류의 "동작"만 외부 링크에서 인앱 모달로 바꿨다 — 3분류 조건부 로직(공공
  예약/할인 예매/그 외)은 그대로 유지된다.
- 미니맵이 항상 보이는 상태에서 3번째 CTA도 같은 모달을 여는 버튼이라 약간 중복되는
  느낌이 있을 수 있으나, 예약/예매 링크가 아예 없는 스팟에서 유저가 누를 수 있는
  유일한 주 액션이 "위치 확인"이 되는 게 자연스럽다고 판단해 그대로 뒀다(제3장
  제5조 추측 금지 — 지시서에 없는 추가 액션을 임의로 만들어내지 않음).
