# Source #04 서울시 공공서비스예약(체육시설) 구현 완료

## 구현 대상
- 사용자가 확인해준 정확한 서비스명(`ListPublicReservationSport`)으로 목록→DB 수집 파이프라인 완성

## 구현 일시
2026-08-20

## 변경 사항
- `scripts/ingest/seoul-public-reservation.mjs` 전면 재작성: 2단계(목록→상세) 구조에서 단일 목록 호출 구조로 단순화. 목록 응답(`ListPublicReservationSport`)에 SVCID, SVCNM(제목), SVCURL(예약 URL), X/Y(좌표), SVCOPNBGNDT/SVCOPNENDDT(이용기간), RCPTBGNDT/RCPTENDDT(접수기간), IMGURL, SVCSTATNM(상태)이 모두 포함되어 있음을 확인하고 이를 `events` 테이블에 직접 매핑
- `event_type`은 `RESERVATION`으로 고정 (ai-rule.md 3.2 표준 카테고리 — "지자체 공공서비스예약 시설/프로그램")
- 페이지네이션: `list_total_count` 기준 100건씩 순회

## 검증 결과 (실제 API/DB 호출)
- `node scripts/ingest/seoul-public-reservation.mjs --dry-run`: 전체 606건 정상 수신 및 매핑 확인
- `node scripts/ingest/seoul-public-reservation.mjs` (실행): `events` 테이블에 실제 573건 upsert 성공 (33건은 좌표/일자 결측으로 필터링)
- RPC 검증: `get_nearby_spaces_and_events`로 응봉공원 인근 반경 검색 시 `RESERVATION` 카테고리 이벤트 정상 반환 확인
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과

## 특이 사항
- 이전 시도(`ListPublicReservationViaGUI`, `YSListPublicReservationViaGUI` 등)는 모두 잘못된 서비스명이었음이 최종 확인됨. 실제 정확한 이름은 카테고리별로 분리된 `ListPublicReservationSport`(체육시설)였음
- 이 엔드포인트는 "체육시설" 카테고리에 한정됨. 스펙 #04("서울시 공공서비스예약(공간/시설)")가 포괄하는 문화시설·교육프로그램 등 다른 카테고리의 정확한 서비스명은 아직 미확인 — 필요 시 동일한 방식(공식 문서 확인)으로 추가 조사 필요
- `reservation_start_date`/`reservation_end_date`는 API가 타임존 없는 문자열("2025-12-02 09:00:00.0", KST 기준으로 추정)로 제공하여 그대로 저장함. 정밀한 타임존 명시가 필요해지면 KST(+09:00) 명시 변환 추가 검토
