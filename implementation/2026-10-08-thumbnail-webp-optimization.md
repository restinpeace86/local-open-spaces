# 썸네일 WebP 재인코딩 — 용량 추가 최적화

## 구현 대상
사용자 지시(2026-10-08): "그래 최대한 썸네일 규격 최적화하고 줄여서
성능 끌어올려야지.. 그래서 늦었던거 아니야?"

## 구현 일시
2026-10-08

## 사실 확인 — 이전 느렸던 원인은 썸네일 크기가 아니었다
오늘 먼저 처리한 "개선사항 1"(문화센터 탭 체감 속도 저하) 원인은 실측으로
이미 확인했다: 필터(브랜드/지점/요일/카테고리 등)를 바꿀 때마다 서버에
재요청해 매번 DB를 다시 긁는 구조였고, 위치/연령 조건에만 걸리는 index가
없었던 게 핵심 원인이었다(base-pool 클라이언트 캐싱 + index 추가로 해결,
`implementation/2026-10-08-culture-club-core-data-caching.md` 참고).
썸네일 이미지 자체의 다운로드 시간은 그 체감 속도 저하와는 별개 경로다
(API 응답 payload에는 이미지 URL 문자열만 담기고 실제 이미지 바이트는
브라우저가 그 URL로 별도 요청해서 받는다) — 그래서 "그래서 늦었던거
아니야?"라는 질문에는 "아니다, 느렸던 주 원인은 DB 재조회+인덱스
누락이었다"가 정확한 답이다. 다만 사용자가 명시적으로 요청한 "최대한
썸네일 규격 최적화"는 이미지 로딩 체감 속도를 높이는 별도의 유효한
개선이라 함께 적용한다.

## 변경 사항
- `scripts/ingest/lib/resize-image.mjs`: 기존엔 치수(긴 변 400px)만
  제한하고 포맷은 원본 그대로 유지했다. GIF(애니메이션 보존 필요)를
  제외한 모든 포맷(JPEG/PNG/WebP)을 **WebP로 재인코딩**(quality 80)
  하도록 변경 — 동일 화질 기준 JPEG/PNG보다 용량이 더 작다. 이미 치수가
  상한 이내인 이미지도 이제는 용량 절감을 위해 WebP로 재인코딩한다(기존엔
  "재인코딩 없이 원본 그대로 반환"이었음 — 의도적 동작 변경).
- 업로드 측(`rehost-event-thumbnails.mjs`/`rehost-culture-club-
  thumbnails.mjs`)은 이미 `format` 값 기반으로 확장자/Content-Type을
  동적으로 결정하는 구조(`MIME_TYPE_BY_FORMAT`/`EXTENSION_BY_FORMAT`에
  `webp` 이미 포함)라 수정 불필요 — 두 Storage 버킷(`event-thumbnails`/
  `culture-club-thumbnails`) 모두 `image/webp`가 이미 허용 목록에
  있음을 실측 확인(별도 마이그레이션 불필요).

## 검증
- `npx tsc --noEmit` / `npm run test`(292개 파일 **3,000개**, 신규 GIF
  보존 테스트 2개 포함) / `npm run build` 전부 통과.
- `resize-image.test.mjs`: 큰 이미지 리사이즈+WebP 변환, 이미 작은
  이미지도 WebP로 재인코딩(치수 유지), GIF는 작아도/커도 포맷을 GIF로
  유지(애니메이션 보존) — 4개 케이스 모두 실제 sharp로 합성한 이미지로
  검증(mock 없음, 기존 관례 유지).
- `rehost-event-thumbnails.test.mjs`/`rehost-culture-club-
  thumbnails.test.mjs`: 업로드 경로/확장자(`.webp`)와 Content-Type
  (`image/webp`)으로 갱신된 기대값으로 조정, 전부 통과.

## 특이 사항
- 기존에 이미 재호스팅된 썸네일(JPEG/PNG로 저장된 과거 행)은 이번
  변경으로 자동 재처리되지 않는다 — 재호스팅 스크립트의 대상 조건이
  "아직 우리 버킷 URL이 아닌 행"이라 이미 우리 버킷에 있는 행은 조회
  대상에서 제외된다(멱등성 목적의 기존 설계, 오늘 범위에서 변경하지
  않음). 기존 이미지도 WebP로 일괄 전환하려면 별도 지시로 범위를 넓혀야
  한다(추측 금지, 제3장 제5조) — 제안만 해둔다.
