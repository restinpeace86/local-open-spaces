# TourAPI 키 재검증 + Source #01(전국 도시공원) 구현

## 구현 대상
- 사용자 제보(URL 인코딩 문제 의심)에 따른 TourAPI 키 디코딩/인코딩 두 방식 재검증
- Source #01 전국 도시공원 정보 표준데이터 수집 스크립트

## 구현 일시
2026-08-20

## 변경 사항
- `.env.local`의 `PUBLIC_DATA_API_KEY`(디코딩 키), `TOUR_API_KEY`(인코딩 키)를 사용자 제공 값으로 갱신
- `scripts/ingest/city-parks.mjs`: `api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api` 실제 호출 → `open_spaces` 테이블 upsert. 페이지네이션 및 `--max-pages` 옵션 지원 (전량 19,154건 중 부분 재수집 테스트 가능)
- `scripts/check-api-keys.mjs`: 공공데이터포털 항목을 존재 여부 확인에서 전국 도시공원 정보 실제 호출 검증으로 격상

## 검증 결과 (실제 API/DB 호출)
- TourAPI: 디코딩 키+encodeURIComponent, 디코딩 키 raw, 인코딩 키 raw 세 가지 조합 모두 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30)로 동일 — 인코딩 문제가 아님을 확인
- 같은 `PUBLIC_DATA_API_KEY`로 전국 도시공원 정보(`tn_pubr_public_cty_park_info_api`) 호출 시 정상 응답(HTTP 200, 전체 19,154건) → 키 자체는 유효하며 TourAPI 4.0 상품에 대해서만 활용신청 승인이 누락된 것으로 결론
- `node scripts/ingest/city-parks.mjs --dry-run --max-pages=2`: 200건 정상 매핑 확인
- `node scripts/ingest/city-parks.mjs --max-pages=2` (실행): `open_spaces` 테이블에 실제 200건 upsert 성공
- RPC 검증: `get_nearby_spaces_and_events` 반경 검색으로 upsert된 공원 데이터 거리순 조회 성공
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과
- `node scripts/check-api-keys.mjs`: Supabase(REST/Management API)·Gemini·서울 열린데이터광장·공공데이터포털(도시공원) 5개 실제 호출 OK, TourAPI만 계정 승인 이슈로 FAIL(정상적인 진단 동작)

## 특이 사항
- TourAPI 오류는 인코딩이 아니라 **data.go.kr의 상품별 개별 활용신청 승인 체계** 때문임이 최종 확인됨. 같은 계정 키라도 상품(API)마다 별도 승인이 필요하며, "전국 도시공원 정보"는 승인되어 있고 "TourAPI 4.0(한국관광공사_국문 관광정보 서비스_GW)"은 아직 승인되지 않은 상태. data.go.kr 마이페이지에서 확인 필요 (`implementation/todo.md` 참고)
- Source #01은 실제 엔드포인트가 확인되어 구현 완료로 전환. Source #02/#03/#04/#07은 여전히 정확한 엔드포인트 미확인 상태로 보류 유지 (추측 구현 금지 원칙 준수)
- 이번 upsert는 검증 목적으로 전체 19,154건 중 200건만 반영함. 전체 수집은 GitHub Actions 스케줄링 구성 시 `--max-pages` 옵션 없이 전량 실행 예정
