# Source #03 문화공간 정보 구현 완료 + Source #02 재시도

## 구현 대상
- 사용자 확인 서비스명 기준 #02(`ListPublicSportsFacility`), #03(`culturalSpaceInfo`) 수집 스크립트
- #07은 별도 수집 없이 기존 데이터 필터링으로 대체하기로 결정 반영 (todo.md)

## 구현 일시
2026-08-20

## 변경 사항
- `scripts/ingest/cultural-spaces.mjs` 신규 구현: `culturalSpaceInfo` 호출 → `open_spaces` 테이블(`category=CULTURE`) upsert
- `external_id`는 `NUM` 필드 사용 — 페이지 위치가 아닌 안정적 고유값임을 실제 호출로 검증(범위를 벗어난 500번째 요청에서도 NUM=492처럼 페이지와 무관한 값 확인)
- 좌표 매핑 시 `X_COORD`/`Y_COORD` 필드명이 실제 위경도와 반대로 되어 있음을 발견 → 필드명을 신뢰하지 않고 값 범위(위도 30~40)로 판별하도록 방어적으로 작성
- Source #02는 사용자가 준 서비스명(`ListPublicSportsFacility`) 및 케이싱/단복수 변형 4종 모두 시도했으나 `ERROR-500` 지속 — 코드에는 반영하지 않고 todo.md에 보류 사유 기록

## 검증 결과 (실제 API/DB 호출)
- `node scripts/ingest/cultural-spaces.mjs --dry-run`: 전체 1,076건 정상 수신, 좌표 보정 매핑 확인
- `node scripts/ingest/cultural-spaces.mjs` (실행): `open_spaces` 테이블에 실제 1,075건 upsert 성공
- RPC 검증: DDP 인근 반경 1km 조회 시 `CULTURE` 카테고리 다수(DDP, 종로구민회관, 한양도성박물관 등) 정상 반환
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과

## 특이 사항
- **좌표 필드명 함정**: `culturalSpaceInfo` API의 `X_COORD` 값이 위도(37.x), `Y_COORD` 값이 경도(127.x)로 필드명과 실제 의미가 반대. 다른 소스(#04/#05)의 `X`/`Y`, `LOT`/`LAT` 필드는 정상적으로 경도/위도 순서였던 것과 달리 이 API만 예외적임 — 향후 서울시 API를 추가할 때마다 필드명을 맹신하지 말고 실제 값 범위로 검증해야 함
- Source #02는 Source #04에서 목록 서비스명이 예상과 완전히 다른 이름(`tvYeyakCOllect`)이었던 사례처럼, `ListPublicSportsFacility`도 실제로는 다른 이름일 가능성이 있음. 임의로 추가 이름을 지어내지 않고 사용자 확인 요청함
