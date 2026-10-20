# 블로그 후기 버튼에 제목 노출 ("블로그 후기 N" → 실제 제목)

## 구현 대상
`todo.md` 개선사항 2 중: "블로그 우리 가져오는것도 블로그 1 블로그 2
블로그 3 이렇게 되어있는데.. 이것도 제목 같은거 몇자.. 나오게 ? 까지..
나오도록 하자."

## 구현 일시
2026-10-20

## 변경 사항
- `src/lib/spaces/blog-title.ts`(신규): 저장된 블로그 URL을 fetch해
  `<title>`(또는 `og:title`) 텍스트를 뽑아낸다.
  - 네이버 블로그 특유의 " : 닉네임 - 네이버 블로그" 꼬리말만 떼어낸다
    (다른 플랫폼 꼬리말 패턴은 추측하지 않고 원문 그대로 둠).
  - 매 상세 화면 오픈마다 외부로 실시간 fetch를 날리면 느리고 상대
    서버에도 부담이라, 모듈 스코프 Map에 성공 7일/실패 10분 TTL로
    캐싱(`nearby-restaurants-cache.ts`와 동일한 기존 패턴 재사용).
  - fetch 타임아웃 3초, 실패 시 조용히 null(페이지가 멈추지 않는다).
- `src/app/api/spot-blog-reviews/route.ts`,
  `src/app/api/events/curated-blog-urls/route.ts`: 기존엔 URL 문자열
  배열만 내려줬는데, 이제 각 URL에 대해 `fetchBlogTitle`을 병렬 호출해
  `{ url, title }[]`로 내려준다.
- `src/components/map/detail-modal.tsx`: 두 블로그 버튼 렌더링(스팟픽
  카드/이벤트 상세)에서 `title`이 있으면 24자(스팟픽은 16자, 뱃지형이라
  더 좁음)로 잘라 보여주고, 없으면 기존처럼 "블로그 후기 N"으로
  폴백한다.

## 검증
- `npx tsc --noEmit` / `npm run test -- --run`(337 파일 3,356개, 신규
  17개 포함) / `npm run build` 전부 통과.
- `blog-title.test.ts`(신규 11개): og:title 우선, 네이버 꼬리말 제거,
  타 플랫폼 꼬리말 미제거, 캐싱, 실패 시 null 폴백.
- `spot-blog-reviews/route.test.ts`/`curated-blog-urls/route.test.ts`
  (신규, 이 두 라우트의 첫 테스트): title 포함 응답, title fetch 실패
  시에도 응답 유지, URL 없으면 title fetch 자체를 시도하지 않음.
- `detail-modal.test.tsx`: 제목 있을 때/없을 때(기존 "블로그 후기 N"
  폴백 유지) 각각 스팟픽·이벤트 양쪽에 테스트 추가.

## 특이 사항
- 이 캐시는 Vercel 서버리스 함수 인스턴스가 살아있는 동안만 유지된다
  (서버 전역/DB 캐시가 아님) — 콜드 스타트 후 첫 조회는 다시 fetch가
  발생한다. 더 강하게 캐싱하려면(DB 컬럼 추가 등) 별도 지시 필요.
