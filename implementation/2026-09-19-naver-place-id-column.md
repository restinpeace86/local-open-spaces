# [open_spaces.naver_place_id 컬럼 추가 + 딸부자 닭갈비 백필]

## 구현 대상
사용자 지시(2026-09-19): 네이버 플레이스 URL(딸부자 닭갈비 닭도리탕,
placeId 1107293125)을 주며 "네이버 플레이스 스팟 ID를 파싱해서 우리쪽에
저장해.. 이걸 가지고 [멀티 엔트리포인트 온디맨드 레이더] 같은거 해야해" — 뒤이은
큰 기능(공지 실시간 감지/관리자 큐레이션 파이프라인)의 기반이 되는 첫 단계.

## 구현 일시
2026-09-19

## 변경 사항
- `scripts/migrations/2026-09-19-add-naver-place-id-to-open-spaces.sql`(신규,
  라이브 DB에 적용 완료): `open_spaces.naver_place_id text unique` 추가(NULL
  다수 허용, 값이 있으면 중복 연결 방지).
- `npm run gen:types`로 `src/types/database.types.ts` 갱신.
- 기존 `src/lib/admin/naver-place-crawler.ts`의 `extractNaverPlaceId()`(2026-09-18
  구현, 새로 만들지 않음)로 제공된 URL에서 `1107293125`를 추출해, open_spaces
  id `4131d338-8e0d-486e-a2ee-4744e98209a1`(딸부자 닭갈비 닭도리탕) 행의
  `naver_place_id`에 반영.

## 검증
`npx tsc --noEmit`/`npm run test`(166개 파일, 1977개 테스트)/`npm run build`
모두 통과. 반영 후 해당 행을 재조회해 `naver_place_id: '1107293125'`로 정확히
저장됐음을 확인.

## 다음 단계
사용자가 이어서 요청한 "멀티 엔트리포인트 온디맨드 레이더 + 관리자 큐레이션
파이프라인"(공지 자동 감지 → 스테이징 → 관리자 검수/발행 → 스팟픽/이벤트/제휴
상세 노출)은 DB 스키마·재사용 서버 액션·관리자 UI·3개 화면 연동을 아우르는
큰 기능이라 별도로 계획을 세운 뒤 진행한다(이 커밋에는 포함하지 않음).
