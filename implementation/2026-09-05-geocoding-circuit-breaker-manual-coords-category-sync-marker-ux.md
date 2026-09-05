# 지오코딩 안전장치(서킷 브레이커/폴백) + 이벤트 수동 좌표 입력 + 스팟픽 표준 중분류 동기화 + 마커 미리보기 UX 수정

## 구현 대상
사용자 지시 5건:
1. V-World 지오코딩 API가 502/타임아웃일 때 배치가 몇 시간씩 멈추는 문제 — 서킷 브레이커,
   타임아웃 강화, 카카오 폴백 3종 안전장치 도입.
2. 지오코딩 실패로 좌표가 없는 events 행을 관리자 화면에서 수동으로 입력할 수 있게 구현.
3. 관리자의 표준 중분류(category_min)와 스팟픽 필터를 일치시키되, 체육시설/공공청사 대관/
   기타 3개 대분류는 제외.
4. 스팟픽 지도에서 마커를 누르면 뜨는 미리보기 카드가 하단 바텀시트를 가리는 문제 수정.

## 구현 일시
2026-09-05

## 조사 — 사용자가 제시한 실제 에러 로그로 근본 원인 실측 확인
로그(`UND_ERR_CONNECT_TIMEOUT`, timeout: 10000ms, "시도 1/3"·"시도 2/3" 재시도 패턴)를 코드
전체에서 grep해 정확한 발생 지점을 특정했다:
- `gg-kidscafe-adapter.mjs`/`gg-events-adapter.mjs`/`gg-culture-events-adapter.mjs`/
  `rural-education-farm-adapter.mjs`/`rural-experience-village-adapter.mjs` 5개 어댑터가
  각자 `GEOCODE_MAX_ATTEMPTS`(3회) 재시도 루프로 `vworld-geocoder.mjs`의 `geocode()`를
  감싸고 있는데, `geocode()` 자신도 내부에서 최대 4회(`MAX_RETRIES=3`) 재시도한다 —
  V-World가 완전히 응답 불가 상태면 주소 하나당 최대 3(외부)×4(내부)=12회 연결 시도를
  전부 소진할 때까지 멈추지 않는 "재시도 안의 재시도" 구조였다. 이 어댑터들은 2026-09-05에
  이미 발견했던 events 배치 3시간+ 정체(직전 작업 참고)의 유력한 실제 원인이다.

## 변경 사항

### 1. 지오코딩 안전장치 3종
- `scripts/ingest/adapters/lib/vworld-circuit-breaker.mjs`(신규): 연결류 에러(502/타임아웃/
  소켓 오류 — `retry.mjs`의 `isRetryableError`와 동일 기준)가 연속 3회 발생하면 회로를
  열어(`isVworldCircuitOpen`) 이후 호출을 즉시 실패로 간주한다. 프로세스(=배치 실행 1회)
  전역 상태라 한 어댑터에서 다운을 확인하면 그 뒤 실행되는 다른 어댑터도 즉시 건너뛴다.
  성공하면 다시 닫힌다(같은 실행 중 일시 장애 후 복구도 반영).
- `scripts/ingest/adapters/lib/kakao-geocoder.mjs`: `geocodeAddress(address)` 신규 추가 —
  기존 `geocodeKeyword`(POI명 검색)와 별개로 카카오의 "주소 검색" 엔드포인트를 쓴다(이
  어댑터들이 다루는 대상이 건물명이 아니라 주소 문자열이라 필요).
- `scripts/ingest/adapters/lib/vworld-geocoder.mjs`: ① 공용 30초 기본 타임아웃 대신 이
  API 전용 8초 엄격 타임아웃 적용(다른 API에 영향 없음), ② `fetchVworld`가 매 시도 전
  서킷 브레이커를 확인하고 열려 있으면 즉시 실패, 연결류 에러 시 회로에 실패를 기록하고
  방금 열렸으면 남은 재시도를 소진하지 않고 즉시 포기, ③ `geocode()`가 더 이상 예외를
  던지지 않는다 — V-World 실패 시 카카오로 자동 폴백하고, 그마저 실패/카카오 키 없음이면
  좌표 없이 null을 반환한다(호출부 중 일부(`gg-culture-location-enrichment.mjs`)가
  try/catch 없이 이 함수를 호출해 예전엔 배치 전체가 죽을 수 있었다).
- `scripts/ingest/lib/with-step-timeout.mjs`(신규) + `run-daily.mjs`/`run-monthly.mjs`:
  각 배치 스텝(어댑터 실행/위치 보강)에 10분 하드 타임아웃을 건다 — 진짜 취소는 아니고
  "포기하고 다음 스텝으로 진행"이다(정직하게 주석에 명시 — JS에는 실행 중 Promise를
  강제 종료하는 표준 방법이 없다). 서킷 브레이커가 지오코딩 자체는 이미 빠르게 끊지만,
  원인 불명의 다른 hang에 대한 방어선으로 추가했다.

### 2. events 좌표 수동 입력 (관리자 화면)
- `src/app/api/admin/data-grid/location/route.ts`(신규): PATCH `{id, lat, lng}` → events의
  `location`/`location_precision`을 갱신(`location_precision`은 항상 `'EXACT'`로). 대한민국
  바운딩 박스(위도 33~39, 경도 124~132)를 벗어나면 거부.
- `src/components/admin/raw-data-modal.tsx`: `LocationEditor` 신규 — events 탭 상세 모달에
  위도/경도 입력창 2개 + 저장 버튼, 현재 `location_precision` 배지, 카카오맵 검색 링크
  (장소명으로 새 탭 검색 — 좌표를 대신 찾아주진 않지만 관리자가 직접 찾는 실제 작업
  흐름에 필요한 보조 링크).
- `src/components/admin/data-grid-client.tsx`: `extractLngLat` export, `onLocationUpdated`
  콜백으로 목록/상세 모달 상태 즉시 갱신.

### 3. 스팟픽 표준 중분류 동기화
- `src/lib/admin/category-min-groups.ts`: `OPEN_SPACES_GROUPS_STATIC`(어드민의 실제
  대분류/중분류 정의) export.
- `src/lib/spaces/spot-category-groups.ts`: 위 정의를 기준 진실로 삼아 요청대로 제외한
  3개 대분류(체육시설/공공청사 대관/기타)를 뺀 나머지 4개 대분류의 중분류 구성을
  정확히 맞췄다. 어드민과 어긋났던 배정 3건을 바로잡음: 캠핑장(농장/체험→자연/공원),
  체험학습장(농장/체험→키즈/놀이시설), 역사유적지(문화시설→자연/공원). 신규 편입
  3종(시민교육센터/광장/관광명소, 문화시설·자연/공원 소속)도 추가 — "관광명소"는
  2026-08-29에 목적이 모호하다는 이유로 의도적으로 제외했었으나, 이번 지시가 "일단
  관리자쪽과 일치"를 명시했으므로 어드민 정의를 그대로 따랐다(특이 사항 참고).
- `src/lib/spaces/spot-category-groups.test.ts`: `OPEN_SPACES_GROUPS_STATIC`을 직접
  참조해 두 파일의 대분류별 중분류 구성이 정확히 일치하는지 검증하는 교차 테스트 추가 —
  앞으로 어느 한쪽만 수정되면 이 테스트가 즉시 실패한다.

### 4. 마커 미리보기 카드 위치 수정
- `src/components/map/marker-preview-card.tsx`: 모바일 바텀시트(접힌 높이 112px, 화면
  바닥에서 64px 띄움 → 윗면이 바닥에서 176px)보다 위(184px)로 카드 위치를 옮겨 더 이상
  시트 핸들/"목록 보기" 버튼을 덮지 않는다. 데스크톱(바텀시트 없음)은 기존 위치 유지.
- `src/components/map/map-explorer.tsx`: 바텀시트가 펼쳐진(70vh) 상태에서 마커를 누르면
  그 큰 시트가 카드를 다시 가릴 수 있어, 마커 클릭 시 시트를 자동으로 접는다(리스트
  클릭 시 이미 적용 중이던 정책과 동일하게 확장).

## 검증
- `npx tsc --noEmit` 통과.
- `npm run test`: 108개 파일 / 1130개 테스트(기존 1111개 + 신규 19개: 서킷 브레이커 5,
  vworld-geocoder 6, kakao geocodeAddress 3, with-step-timeout 3, 마커 시트 자동 접힘 1,
  표준 중분류 교차 검증 1) 전체 통과.
- `npm run build`: 프로덕션 빌드 통과, `/api/admin/data-grid/location` 라우트 정상 등록.
- 서킷 브레이커/카카오 폴백은 실제 사용자가 제시한 에러 메시지(`UND_ERR_CONNECT_TIMEOUT`)를
  그대로 재현하는 단위 테스트로 검증(연속 3회 실패 시 열림, 이후 호출은 V-World 재시도 없이
  즉시 카카오로 폴백, 둘 다 실패해도 예외 없이 null).

## 특이 사항
- **서킷 브레이커가 열린 뒤 다음 배치 실행까지 다시 시도하지 않는다** — half-open/쿨다운
  상태를 두지 않고, 다음 날 cron이 새 프로세스로 시작될 때 자동으로 리셋된다. "이번 실행은
  포기하고 다음 실행을 기다린다"는 요구사항의 Fail Fast 취지를 그대로 따른 설계다.
- **`with-step-timeout.mjs`는 진짜 취소가 아니라 "포기"다** — 응답 없는 소켓을 강제로
  끊지는 못한다(JS/Node 표준 메커니즘 부재). 다만 배치 자체는 그 스텝을 실패로 기록하고
  다음 스텝으로 넘어가므로 "job이 몇 시간이고 in_progress로 멈춰 있는" 상황은 방지된다.
- **"관광명소" 재포함은 이전 큐레이션 판단을 뒤집은 것이다** — 2026-08-29엔 "목적이 모호"
  하다는 이유로 의도적으로 제외했었으나, 이번 사용자 지시("일단 관리자쪽과 일치")를 그대로
  따랐다. 더 큐레이션하고 싶다면 어드민 쪽(`category-min-groups.ts`) 정의부터 바꿔야
  두 화면이 다시 벌어지지 않는다 — 이 관계를 코드 주석과 교차 검증 테스트로 고정해뒀다.
- **좌표 수동 입력은 events 탭 전용이다**(요청 범위 그대로) — open_spaces는 대상이 아니다.
- **마커 미리보기 카드 위치는 바텀시트의 현재 치수(bottom-16, 접힌 높이 112px)에 맞춰
  하드코딩한 값(184px)이다** — 추후 바텀시트 치수가 바뀌면 이 값도 함께 조정해야 한다
  (동적 계산으로 만들 수도 있었으나, 두 컴포넌트 사이에 없던 결합을 새로 만드는 것보다
  이 정도 상수 의존이 제5장 제4조 취지에 더 맞다고 판단했다).
