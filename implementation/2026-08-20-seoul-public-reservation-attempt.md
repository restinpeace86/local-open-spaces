# Source #04 서울시 공공서비스예약 — 2단계 파이프라인 구현 시도

## 구현 대상
- 사용자 제공 엔드포인트(`ListPublicReservationViaGUI` 목록 → `ListPublicReservationDetail` 상세) 기준 수집 스크립트

## 구현 일시
2026-08-20

## 변경 사항
- `scripts/ingest/seoul-public-reservation.mjs`: 목록 조회 후 각 SVCID에 대해 상세 조회하는 2단계 파이프라인 골격 구현. 목록 API가 현재 응답 필드를 확인할 수 없는 상태라 SVCID 필드명을 후보군(`SVCID`/`SVC_ID`/`RSV_SVC_ID`/`SVCSTATNM`) 중에서 자동 탐색하도록 방어적으로 작성하고, 실제 upsert 매핑은 필드 구조 확인 전까지 보류

## 검증 결과 (실제 API 호출)
- `ListPublicReservationDetail/1/1/S200101EM0158` (사용자가 만료됐다고 알려준 SVCID): `INFO-200 해당하는 데이터가 없습니다` 정상 응답 → 서비스명/URL 구조 자체는 유효함을 확인
- `ListPublicReservationDetail/1/5/` (SVCID 누락): `ERROR-300 필수 값이 누락되어 있습니다` → 역시 서비스가 정상 인식됨을 뒷받침
- `ListPublicReservationViaGUI/1/1/`, `/1/5/`, `/1/100/`: 모두 `ERROR-500 서버 오류입니다` 응답. 케이싱 변형(`listPublicReservationViaGUI`, `ListPublicReservationViaGui` 등) 및 4회 재시도(2초 간격)로도 동일 → 일시적 네트워크 이슈가 아닌 것으로 판단
- 같은 키로 `culturalEventInfo`(#05)는 정상 호출됨 → 키/네트워크 문제 아님, `ListPublicReservationViaGUI` 자체의 문제
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과 (신규 파일은 .mjs로 TS 영향 없음)

## 특이 사항
- **`ListPublicReservationViaGUI`만 지속적으로 ERROR-500을 반환**하여 목록 응답의 실제 필드 구조(특히 SVCID 필드명)를 확보하지 못했음. 임의로 필드명을 지어내지 않고 원본 응답을 그대로 로그로 남기도록 작성 (제3장 제5조 추측 금지)
- 이 때문에 상세 응답을 받더라도 `events` 테이블 매핑(`mapDetailToEventRow` 등)은 아직 작성하지 않음 — 목록 API가 정상 응답을 반환해야 다음 단계 진행 가능
- 사용자에게 목록 API의 현재 상태 재확인 요청함 (`implementation/todo.md` 참고)
