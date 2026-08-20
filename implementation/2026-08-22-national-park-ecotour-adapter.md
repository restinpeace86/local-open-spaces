# NationalParkEcotourAdapter 구현 + Kakao 지오코딩 헬퍼

## 구현 대상
- 사용자가 확인해준 data.go.kr 승인 계정 API "국립공원공단_국립공원 생태관광정보 DB" 연동
- 원본 데이터에 좌표가 없어 필요해진 Kakao 주소/키워드 지오코딩 공용 헬퍼

## 구현 일시
2026-08-22

## 변경 사항
- `scripts/ingest/adapters/lib/kakao-geocoder.mjs`: Kakao 주소 검색 API 우선 시도, 실패 시 키워드 검색으로 폴백하는 지오코딩 헬퍼. `KAKAO_REST_API_KEY`(REST API 키 — 지도 렌더링용 JS 키와는 다른 값) 필요
- `scripts/ingest/adapters/national-park-ecotour-adapter.mjs`: odcloud.kr API(`api.odcloud.kr/api/3068312/v1/uddi:...`) 호출, 서비스 지역 텍스트를 지오코딩해 좌표 보완, `open_spaces` 테이블(`category=EXPERIENCE_CLASS`)에 매핑
- `scripts/ingest/adapters/base-collector-adapter.mjs`: `transform()`이 비동기(지오코딩 등 네트워크 보강)를 지원하도록 `run()`에서 `await` 처리로 일반화
- `scripts/ingest/national-park-ecotour.mjs` CLI 진입점 + `package.json`에 `ingest:national-park-ecotour` 스크립트 추가

## 검증 결과 (실제 API 호출)
- Swagger 스펙(`infuser.odcloud.kr/oas/docs?namespace=3068312/v1`)을 직접 fetch해 실제 엔드포인트/파라미터/응답 스키마 확인 (추측 없음)
- 실제 데이터 호출 성공: `PUBLIC_DATA_API_KEY`를 쿼리파라미터 `serviceKey`로 URL 인코딩해 전달 시 200 OK, 전체 110건 확인. Authorization 헤더 방식(`Infuser {key}`)도 동일하게 동작함을 확인
- 응답 필드는 프로그램명/테마별분류/서비스지역/프로그램소개/프로그램상세소개 5종뿐이며 좌표가 없음을 실제 데이터로 확인. "서비스 지역"은 "강원도 속초"(광역 수준)부터 "강원도 원주시 소초면 학곡리 900번지"(지번 수준)까지 정밀도가 섞여 있음을 샘플 10건으로 확인
- Kakao REST API 키로 지오코딩 시도 → **미보유**: 지도 렌더링용 `NEXT_PUBLIC_KAKAO_MAP_API_KEY`(JS 키, 도메인 제한)로 REST 지오코딩 호출 시 `401 AccessDeniedError`로 실패함을 실제 호출로 확인 — 별도 REST API 키가 반드시 필요함을 검증
- `node scripts/ingest/national-park-ecotour.mjs --dry-run`: `KAKAO_REST_API_KEY` 미설정 시 명확한 에러로 정상 종료(exit 1) 확인
- `npx tsc --noEmit` / `npm run test`(2/2) / `npm run build` / `npx playwright test`(6/6): 모두 통과 (base 클래스 `await` 변경에 대한 회귀 테스트로 `SeoulYeyakAdapter` 재실행 — 2,623건 정상 변환 확인)

## 특이 사항
- **`KAKAO_REST_API_KEY` 필요**: Kakao Developers 앱의 [앱 키] 탭에서 확인 가능한 "REST API 키"이며, 이미 보유한 JavaScript 키와 다른 값. 사용자에게 확인 요청함
- 좌표 정밀도가 낮은 원본 지역명(예: "강원도 오대산국립공원")은 지오코딩 시 국립공원 단위의 대표 좌표로 매핑되어 정확한 프로그램 진행 위치가 아닐 수 있음 — 이는 원본 데이터 자체의 한계이며 임의로 보정하지 않음
- 콤마로 여러 지역이 나열된 경우("강원도 속초, 양양, 고성") 첫 번째 지역만 대표 좌표로 사용 — 다중 지역 프로그램을 정확히 표현하려면 스키마 확장(예: 지역별 복수 행 생성)이 필요하나 이번 범위에서는 단순화함
- `BaseCollectorAdapter.transform()`을 비동기 지원하도록 일반화한 변경은 기존 동기 구현체(`SeoulYeyakAdapter`, `LocalDataKidsAdapter`)에도 하위 호환됨 (JS의 `await`는 non-Promise 값도 그대로 통과시킴) — 실제 재실행으로 회귀 없음 확인
