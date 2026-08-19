# Source #04 서울시 공공서비스예약 — 통합 엔드포인트(tvYeyakCOllect)로 전환

## 구현 대상
- 사용자가 확인해준 카테고리별 서비스명(Culture/Medical) 및 통합 서비스명(`tvYeyakCOllect`) 반영

## 구현 일시
2026-08-20

## 변경 사항
- `scripts/ingest/seoul-public-reservation.mjs`: 서비스명을 `ListPublicReservationSport`(체육시설 전용) → `tvYeyakCOllect`(전체 카테고리 통합)으로 교체
- 응답의 `DIV` 필드(문화행사/시설대관/진료/체육시설/교육 등)를 카테고리별 건수 로그로 활용해 수집 범위를 가시화
- `is_active` 판정을 `SVCSTATNM === '접수마감'` 같은 완전 일치 대신 `.includes('종료') || .includes('마감')` 방식으로 완화 — 카테고리별로 "접수종료"/"접수마감" 등 표현이 다름을 실제 응답에서 확인했기 때문

## 검증 결과 (실제 API/DB 호출)
- `node scripts/ingest/seoul-public-reservation.mjs --dry-run`: 전체 2,600건 정상 수신, 카테고리별 건수(문화행사 978 / 시설대관 594 / 진료 28 / 체육시설 606 / 교육 394) 확인
- `node scripts/ingest/seoul-public-reservation.mjs` (실행): `events` 테이블에 실제 2,494건 upsert 성공 (기존 체육시설 573건은 동일 `external_id`(SVCID 기반)라 자동으로 갱신됨)
- RPC 검증: 서울시청 인근 반경 3km 조회 시 `RESERVATION` 카테고리 151건을 포함해 다양한 카테고리가 정상 반환됨
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과

## 특이 사항
- `tvYeyakCOllect`는 개별 카테고리 엔드포인트(Sport/Culture/Medical 등)의 상위 집합으로 확인되어, 앞으로 이 소스는 통합 엔드포인트 하나만 유지하면 됨 (카테고리별 스크립트를 별도로 관리할 필요 없음)
- 현재 `event_type`은 모두 `RESERVATION`으로 고정 처리 중. `DIV` 값을 활용해 문화행사/진료 등 세부 성격을 반영한 카테고리 세분화가 필요해지면 `ai-rule.md` 매핑 규칙 확장 검토
