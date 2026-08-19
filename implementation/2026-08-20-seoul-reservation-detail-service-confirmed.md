# Source #04 상세 조회 서비스명 확정 (YSListPublicReservationDetail)

## 구현 대상
- 사용자가 확인해준 공식 API 파라미터 문서(KEY/TYPE/SERVICE/START_INDEX/END_INDEX/SVCID/AREANM) 기준 상세 조회 서비스명 반영

## 구현 일시
2026-08-20

## 변경 사항
- `scripts/ingest/seoul-public-reservation.mjs`: 상세 조회 서비스명을 `ListPublicReservationDetail` → `YSListPublicReservationDetail`로 교정. 목록/상세 서비스명을 상수(`LIST_SERVICE_NAME`, `DETAIL_SERVICE_NAME`)로 분리해 목록 서비스명 확정 시 한 곳만 교체하면 되도록 정리

## 검증 결과 (실제 API 호출)
- `YSListPublicReservationDetail/1/1/S200101EM0158` (만료 SVCID): `INFO-200 해당하는 데이터가 없습니다` — 정상 응답, 서비스명 유효함 재확인
- `YSListPublicReservationViaGUI`, `YSListPublicReservation` (목록, 추정 이름): 둘 다 `ERROR-500` — 여전히 미해결
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과

## 특이 사항
- 상세 조회 서비스명은 사용자가 제공한 공식 문서로 확정됐으나, **목록 조회 서비스명은 같은 방식의 확인이 아직 없어 추정값을 유지 중**. 추가로 이름을 임의로 지어내며 시도하지 않고 사용자에게 동일한 문서에서 목록 오퍼레이션의 정확한 SERVICE 값을 확인해달라고 요청함
- 목록 API가 정상화되기 전까지 이 소스의 실제 upsert 검증은 불가능한 상태
