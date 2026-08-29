# [농장 및 전체 스팟 상세 바텀시트 네이버 플레이스/검색 딥링크 연동]

## 요구사항
1. 스팟(open_spaces)에 공식 홈페이지/플레이스 링크가 있으면 우선 사용, 없으면 이름+주소로
   네이버 딥링크를 동적 생성.
2. 상세 바텀시트(`DetailModal`) 하단 액션 영역에 "[네이버에서 상세/예약 보기]" 버튼 추가,
   새 창으로 부드럽게 열리도록 처리.
3. 검증 후 커밋/푸시.

## 구현 일시
2026-08-29

## 1. 사전 확인

- "SpotDetailSheet"라는 이름의 컴포넌트는 없고, 스팟/이벤트 상세를 공용으로 담당하는
  `src/components/map/detail-modal.tsx`(`DetailModal`)가 실제 대상임을 확인했다 — 이미
  Decision 011(2026-08-25) 기준 "is_free/예약·제휴 URL 유무에 따라 [공공 예약하기]/
  [할인 예매하기]/[길찾기] 3분류 CTA" 로직이 있는 컴포넌트다. 이번 버튼은 그 3분류를
  대체하지 않고 **추가**한다(지시서 "버튼을 추가"라는 표현 그대로, 기존 Decision 011
  로직은 건드리지 않음).
- 지시서가 예시로 든 `m.map.naver.com/search.naver?query=` 형식은 공식 확인이 안 된
  구형 웹 URL이다 — 이미 이 코드베이스의 `buildNaverMapDirectionsUrl`(길찾기 딥링크)이
  "네이버 공식 문서(guide.ncloud-docs.com/docs/maps-url-scheme)로 직접 확인 후에만 URL
  스킴을 쓴다"는 원칙을 세워뒀다(제3장 제5조 추측 금지). 동일 원칙을 적용해 같은 문서를
  WebFetch로 다시 확인한 결과, 길찾기(`nmap://route`) 외에 **검색 전용 스킴**이 공식
  문서에 정의돼 있음을 확인했다:
  - `nmap://search?query=` — 검색어로 장소를 찾음.
  - `nmap://place?lat=&lng=&name=` — 좌표에 마커만 표시(장소 상세 페이지 도달을 보장하지
    않음).
  - 요구사항의 목적("예약하거나 세부 정보를 확인")과 "이름과 주소를 조합" 문구 둘 다
    `search` 스킴에 더 부합해 이를 채택했다(좌표 마커 표시로는 리뷰·영업정보·예약 버튼이
    있는 네이버 플레이스 상세 페이지 도달을 보장할 수 없음).

## 2. 구현

### `src/lib/navigation.ts`
`buildNaverPlaceSearchUrl({ name, address }, appOrigin?)` 신규 추가 — 이름+주소를 공백으로
이어붙여 `query` 파라미터로 넘긴다(주소를 함께 붙이는 이유: 동명 장소가 다른 지역에도 있을
때 검색 정확도를 높이기 위함, 지시서 그대로). 주소가 없으면 이름만으로 검색어를 만든다.
기존 `buildNaverMapDirectionsUrl`과 동일한 관례(appname 기본값 = 호출 시점의
`window.location.origin`)를 그대로 따른다.

### `src/components/map/detail-modal.tsx`
- `naverLinkUrl = !isEvent ? (item.info_url || buildNaverPlaceSearchUrl({ name, address })) : null`
  — info_url(공식 홈페이지)이 있으면 그대로 쓰고, 없으면 항상 네이버 검색 딥링크로
  폴백해 **항상 값이 있게** 만든다(기존 3분류 CTA는 조건에 따라 `null`이 될 수 있는 것과
  다름 — 이 버튼은 지시서 "전체 스팟"이라는 표현대로 이름만 있으면 항상 뜬다).
- `!isEvent`로 제한한 이유: 지시서가 "스팟"이라는 용어를 두 번 명시했고(이 서비스의
  스팟픽/이벤트픽 구분 용어상 스팟=open_spaces), 이벤트는 이미 3분류 CTA로 충분히
  커버되므로 임의로 범위를 넓히지 않았다(제7장 제2조 임의 UI 변경 금지).
- 하단 액션 영역(`flex gap-2`)에 두 번째 버튼으로 추가 — 기존 CTA가 있으면 나란히
  `flex-1` 두 개, CTA가 없으면(예: CITY_APPROX 이벤트, 이번 변경 대상 아님) 이 버튼
  하나만 전체 폭을 차지한다. 시각적으로는 기존 컬러 배경 버튼과 구분되는 보조 스타일
  (흰 배경 + 회색 테두리)을 써서 주 CTA와 위계를 나눴다.
- 아이콘: 이 프로젝트는 아이콘 라이브러리 없이 전부 이모지로 버튼을 구성하는 기존
  관례(🏛️/🎟️/🗺️)라 별도 `ExternalLink` 아이콘 컴포넌트를 새로 들이지 않고 동일하게
  이모지(🔗)를 썼다(제5장 제4조 기존 구조 우선).
- `target="_blank" rel="noopener noreferrer"`로 기존 CTA 링크와 동일하게 새 창에서 안전하게
  연다(보안 모범 사례 — `noopener`로 새 창이 원본 페이지의 `window.opener`에 접근 못하게 함).

## 검증

### 코드 검증
- `npx tsc --noEmit` 통과.
- `npm run test`(62파일 647건 — 신규 `buildNaverPlaceSearchUrl` 테스트 3건,
  `DetailModal 네이버 딥링크 버튼` 테스트 4건 포함) 통과.
- `npm run build` 통과.

## 특이 사항
- 이 환경에는 브라우저 자동화 도구가 없어 실제 모바일 기기에서 `nmap://` 딥링크가
  네이버 지도 앱을 여는지(또는 앱 미설치 시 어떻게 동작하는지)까지는 실기기로 확인하지
  못했다 — `buildNaverMapDirectionsUrl`(기존 길찾기 버튼)도 동일한 한계를 이미 갖고
  있었고(파일 상단 주석에 명시돼 있음), 이번 신규 함수도 같은 공식 스킴을 그대로 재사용해
  동일한 신뢰 수준으로 구현했다.
