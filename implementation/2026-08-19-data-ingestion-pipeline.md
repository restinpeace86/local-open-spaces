# 데이터 수집 파이프라인 초기 구현 (Source #05, #06)

## 구현 대상
- 공공 데이터 수집 → PostGIS Upsert 공용 파이프라인 프레임워크
- `spec/data/data_sources.md` #05(서울시 문화행사 정보), #06(TourAPI 축제 정보) 수집 스크립트
- `spec/data/ai-rule.md` 3.2 기준 표준 카테고리 규칙 기반 매핑

## 구현 일시
2026-08-19

## 변경 사항
- `scripts/lib/load-env.mjs`: 기존 4개 스크립트에 중복돼 있던 `.env.local` 파서를 공용 모듈로 추출 (제4조 기존 구조 우선). 값 양끝 따옴표 제거 로직 추가
- `scripts/ingest/lib/supabase-admin.mjs`: `SUPABASE_SERVICE_ROLE_KEY` 기반 관리자 클라이언트 + `external_id` 기준 upsert 헬퍼
- `scripts/ingest/lib/geometry.mjs`: PostGIS `geometry(Point,4326)` 컬럼에 PostgREST로 입력 가능한 EWKT 문자열 변환 헬퍼
- `scripts/ingest/lib/category-map.mjs`: `ai-rule.md` 3.2 표준 카테고리 규칙 기반 매핑. 매핑표에 없는 값은 임의 생성하지 않고 `ETC`로 분류 + 경고 로그 (ai-rule.md 4.1 준수)
- `scripts/ingest/seoul-culture-events.mjs`: 서울 열린데이터광장 `culturalEventInfo` 실제 호출 → `events` 테이블 upsert. `--dry-run` 옵션으로 DB 쓰기 없이 검증 가능
- `scripts/ingest/tour-api-festival.mjs`: TourAPI `searchFestival2` 호출 스크립트 (계정 승인 이슈로 현재 실사용 불가, 아래 특이사항 참고)
- `scripts/check-api-keys.mjs`: 서울 열린데이터광장/TourAPI에 대해 존재 여부 확인에서 실제 호출 검증으로 격상

## 검증 결과 (실제 API/DB 호출)
- `node scripts/ingest/seoul-culture-events.mjs --dry-run`: 서울 열린데이터광장 실제 호출 성공, 20건 수신, 좌표/일자 유효성 통과
- `node scripts/ingest/seoul-culture-events.mjs` (실행): Supabase `events` 테이블에 실제 20건 upsert 성공
- RPC 검증: `get_nearby_spaces_and_events(126.978, 37.5665, 50000)` 호출 → upsert된 실제 이벤트가 거리순으로 정상 반환됨 (서울시청 좌표 기준)
- `node scripts/check-api-keys.mjs`: Supabase(REST/Management API), Gemini, 서울 열린데이터광장 4개 항목 실제 호출 OK. TourAPI는 계정 승인 이슈로 FAIL(진단 메시지 포함). Kakao(도메인 제한)와 공공데이터포털(엔드포인트 미확정)은 존재 여부만 확인
- `npx tsc --noEmit` / `npm run test` / `npm run build`: 모두 통과

## 특이 사항
1. **`.env.local` 값의 따옴표 처리 버그 발견 및 수정**: `PUBLIC_DATA_API_KEY`, `TOUR_API_KEY`, `SEOUL_OPEN_DATA_KEY`, `NEXT_PUBLIC_KAKAO_MAP_API_KEY` 값이 파일에 큰따옴표로 감싸여 저장되어 있었음. Next.js 자체 dotenv 파서는 이를 자동 처리하지만, 직접 작성한 Node 스크립트용 파서는 따옴표를 값의 일부로 읽어 API 키가 깨진 상태로 호출되고 있었음. `scripts/lib/load-env.mjs`에서 양끝 따옴표를 제거하도록 수정 → 서울 열린데이터광장 키가 이 수정 이후 정상 작동 확인됨
2. **TourAPI(#06)는 코드가 아닌 계정 승인 문제로 보류**: 엔드포인트를 `KorService1`(폐기됨, `NO_OPENAPI_SERVICE_ERROR` 확인) → `KorService2`(정상 경로 확인)로 교정했음에도 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(returnReasonCode 30) 발생. 이는 data.go.kr에서 API 상품별로 별도 "활용신청" 승인이 필요한 구조 때문으로, 사용자가 data.go.kr 마이페이지에서 TourAPI 4.0 상품의 승인 상태를 확인해야 함 (`implementation/todo.md` 참고)
3. **event_type 분류는 현재 규칙 기반(rule-based)만 적용**: `ai-rule.md`가 정의한 정식 AI 파이프라인(비정형 텍스트 정제, Gemini 기반 애매 케이스 분류)은 이번 범위에 포함하지 않음. 서울시 문화행사 API의 `CODENAME`(예: "축제-전통/역사", "전시/미술", "연극" 등)을 표준 5종 카테고리로 결정적 매핑했고, 매핑표에 없는 값은 `ETC` + 경고 로그로 처리해 ai-rule.md 4.1 예외처리 규칙은 준수함. 전체 AI 파이프라인은 별도 구현 단계로 분리 (`implementation/todo.md`)
4. **서울시 문화행사 API는 안정적인 고유 ID 필드를 제공하지 않음**: `external_id`(Upsert 기준 키) 요건 충족을 위해 `TITLE+STRTDATE+PLACE` 조합의 SHA-1 해시를 결정적 키로 사용함 (`buildExternalId` in `seoul-culture-events.mjs`)
5. **Source #01~#04, #07은 추측 구현하지 않고 보류**: 리서치 결과 정확한 엔드포인트/파라미터를 확정할 수 없었거나(#01/#02/#04 — JS 렌더링 문서라 자동 조사 불가), 스펙에 명시된 데이터셋명과 실제 존재하는 데이터셋 간 불일치가 발견됨(#03/#07). 제3장 제5조(추측 금지) 및 제7장 제1조(Spec 없는 기능 추가 금지)에 따라 임의로 엔드포인트를 지어내지 않고 `implementation/todo.md`에 보류 사유를 기록함
