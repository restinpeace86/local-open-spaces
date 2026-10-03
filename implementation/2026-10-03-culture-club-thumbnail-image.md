# 문화센터 카드 썸네일 이미지 연결 — CDN URL 확보

## 구현 대상
사용자가 실제 사이트에서 로드되는 이미지 요청 URL을 직접 찾아 제공했다
(2026-10-03): `https://d24y2yfxh2iebm.cloudfront.net/resized/thumbnail/
category/4/403/f1dcfa20-b0dc-4f75-890d-84eabb499b33` — 이전까지
`emart_culture_club_classes.main_image_bucket`(S3 직접 접근)가 403이라
플레이스홀더만 보여주던 블로커가 해소됐다.

## 실측 확인
- 사용자가 준 URL을 curl로 직접 확인: `200`, `Content-Type` 헤더는
  `application/octet-stream`이지만 실제 바이트는 `file` 명령으로 진짜
  JPEG(271x173)임을 확인(브라우저 `<img>`는 Content-Type이 아니어도 실제
  파일 시그니처로 렌더링하므로 문제없음).
- 키 형태가 두 가지(`category/4/403/{uuid}`, `classImages/{uuid}`) 있어
  둘 다 테스트 — 둘 다 동일한 `resized/thumbnail/{key}` 패턴으로 200 확인.
  즉 `main_image_key` 값을 그대로 경로에 붙이면 되는 **공개, 인증 불필요**
  CDN이다(별도 bucket/region 불필요).
- 상세(큰) 해상도 경로는 찾지 못했다 — `resized/detail`, `/large`,
  `/medium`, `/original`, `/full`, `/raw`, `/1200`, `/800` 등 8가지를
  순서대로 시도했으나 전부 404. 더 추측하지 않고 중단했다(제3장 제5조) —
  상세보기 자체도 아직 구현 안 돼 있어 이번 범위 밖으로 남긴다.
- 프로덕션 전수 확인: `is_excluded=false`인 6,520건 **전부**
  `main_image_key`를 가지고 있고(100%), 샘플 5건 전부 실제 CDN에서 200
  확인.

## 변경 사항
- `src/lib/home/culture-club-options.ts`: `buildCultureClubThumbnailUrl
  (imageKey)` 추가 — `https://d24y2yfxh2iebm.cloudfront.net/resized/
  thumbnail/{imageKey}` 조합, 키가 없으면 null(추측으로 이미지를 만들어
  내지 않음).
- `src/components/home/culture-club-tab-view.tsx`: `ClassImagePlaceholder`
  → `ClassImage`로 교체 — `main_image_key`가 있으면 실제 `<img>`(plain,
  `next/image` 아님 — 외부 CDN 도메인이라 `hero-carousel.tsx`와 동일한
  이유로 remotePatterns 미등록 상태 유지), 없으면 기존 플레이스홀더로
  폴백. 상태 뱃지는 이미지 위에 그대로 겹쳐 유지.

## 검증
- `src/lib/home/culture-club-options.test.ts`(신규, 3개): 두 키 형태 각각
  URL 조합 정확성, null/undefined 처리.
- `src/components/home/culture-club-tab-view.test.tsx`(2개 추가): 키가
  있으면 해당 CDN URL로 `<img>` 렌더링, 없으면 이미지 태그 자체가 없고
  플레이스홀더만.
- `npx tsc --noEmit` / `npm run test`(263개 파일 2,737개) / `npm run build`
  전부 통과.
- 프로덕션 전수 커버리지(100%) + 샘플 5건 실제 CDN 200 확인(위 "실측 확인"
  참고).

## 특이 사항
- 상세보기(클릭 시 더 큰 해상도로 열기)는 아직 구현되지 않았다 — 상세
  해상도 CDN 경로도 못 찾았고, 애초에 카드 클릭 시 여는 상세 모달 자체가
  없다. 사용자가 상세 화면에서 실제로 뜨는 이미지의 URL을 하나 더
  제공하면 그 때 상세보기 기능과 함께 설계한다.
- 찜(하트) 아이콘은 여전히 레이아웃만 있고 비활성이다(이전 기록 참고) —
  이 변경과 무관.
