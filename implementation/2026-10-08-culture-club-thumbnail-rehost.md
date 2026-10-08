# 문화센터 썸네일 재호스팅(브랜드 공통)

## 구현 대상
사용자 지시(2026-10-08, 신세계 통합 작업 중): "이미지 긁어오는거 우리
썸네일 규격이라던가 우리쪽 규격에 맞추는것도 하는거지?" — 확인해보니
아니었다. 롯데마트/현대백화점/신세계 아카데미 전부 원천 사이트의 이미지
URL을 그대로 `raw_extra.main_image_url`에 저장만 하고 있었다(우리
Storage로 재호스팅/리사이징 없음).

## 구현 일시
2026-10-08

## 설계 — 기존 패턴 재사용
`events.thumbnail_url`에 이미 적용 중인 재호스팅 파이프라인(2026-09-15
사용자 지시, `scripts/ingest/lib/rehost-event-thumbnails.mjs`)과 동일한
설계를 그대로 따른다(제5장 제4조 기존 구조 우선):
1. 아직 우리 Storage URL이 아닌 `main_image_url`만 대상으로 조회(멱등 —
   이미 재호스팅된 행은 다음 실행부터 자동으로 조회 대상에서 빠짐).
2. 다운로드 → `resizeThumbnail()`(기존 공유 유틸, 400px 긴 변 기준 —
   이벤트 썸네일과 동일 규격) → `culture-club-thumbnails` 버킷(신규,
   public)에 업로드 → `main_image_url`을 우리 Storage 공개 URL로 교체.
3. 하루 최대 100건(이벤트와 동일한 예산 — 매 행마다 외부 네트워크 fetch가
   추가돼 느림, 전체 백로그는 매일 조금씩 처리).

**이벤트와 다른 점**: `events.thumbnail_url`은 평범한 컬럼이라 그 값만
바로 UPDATE하면 됐지만, 여기는 `raw_extra`(JSONB) 안의 한 키만 바꿔야
한다 — Supabase JS 클라이언트가 JSONB 부분 갱신 연산자를 지원하지
않아, SELECT로 읽어온 raw_extra 전체를 스프레드하고 `main_image_url`
키만 덮어써서 다시 통째로 쓴다(다른 키는 보존됨).

**이마트는 대상 아님**: 이마트는 `raw_extra.main_image_url` 자체가 없다
(대신 `main_image_key` + 이미 동작 중인 CloudFront CDN 재구성 방식 — 이미
"우리 쪽에서 통제 가능한" 경로라 재호스팅이 필요 없음). 조회 조건(
`main_image_url`이 null이 아닌 행) 자체가 이마트 행을 자연히 걸러내
브랜드별 분기 코드가 필요 없었다.

## 변경 사항
- `scripts/migrations/2026-10-08-create-culture-club-thumbnails-bucket.mjs`
  (신규, 실행 완료): `culture-club-thumbnails` Storage 버킷 생성(public,
  5MB 제한, png/jpeg/webp/gif만 허용 — 기존 3개 버킷과 동일한 패턴).
- `scripts/ingest/lib/rehost-culture-club-thumbnails.mjs`(신규):
  핵심 로직(`rehostCultureClubThumbnails(client, {limit})`).
- `scripts/ingest/rehost-culture-club-thumbnails.mjs`(신규): 독립 실행
  진입점(문화센터는 run-daily.mjs를 거치지 않는 별도 배치군이라 자체
  스크립트로 둠, 이벤트는 run-daily.mjs에 포함돼 있는 것과 차이).
- `LocalOpenSpaces-CultureClubRehostThumbnails`(작업 스케줄러, 매일
  10:40 — 신세계 목록 09:30→상세 10:10 다음 순서) 신규 등록.

## 검증
- `npx tsc --noEmit` / `npm run test`(290개 파일 2,989개, 신규 테스트
  5개 포함 — 성공 케이스/비표준 image/jpg 정규화/죽은 링크 건너뛰기/
  부분 실패 허용/이마트 행 자연 제외) / `npm run build` 전부 통과.
- 실제 라이브로 3건 소규모 테스트 후, 하루 예산 그대로(100건) 실제 배치
  실행: **성공 95건 / 실패 5건**(개별 행 실패가 배치 전체를 막지 않는
  기존 이벤트 재호스팅과 동일한 관용적 처리 — 일부 원천 이미지 URL이
  죽어있거나 형식이 예상과 다른 경우로 추정, 이벤트 쪽에서도 동일한
  비율의 실패가 정상 범주로 이미 확인된 패턴). 재호스팅된 실제 이미지
  URL 하나를 직접 curl로 확인 — 200, image/png, 리사이징된 크기로 정상
  반환.

## 특이 사항
- 전체 백로그(롯데마트/현대백화점/신세계 전체) 규모는 이번에 측정하지
  않았다 — 하루 100건씩 처리되며 멱등적이라 자연히 소진된다. 필요하면
  배치 크기(`BATCH_SIZE`)를 조정할 수 있다.
