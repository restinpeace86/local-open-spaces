# 클래스 신청하러 가기 — 강좌별 딥링크로 수정

## 구현 대상
사용자 지적(2026-10-03): "클래스 신청하러 가기 하면 에러나는데? 잘못된거
같아 url이 https://www.cultureclub.emart.com/class/403oo9Mze2026S3760
이런식으로 class ID가 뒤에붙은게 들어가있어야 할거같은데?" — 이전까지는
딥링크 패턴을 몰라 전체 검색 화면(`/enrolment`)으로만 보내고 있었는데,
사용자가 실제 강좌별 상세 페이지 URL을 찾아줬다.

## 실측 확인
- 처음 `curl`로 해당 URL을 그냥 호출하니 403이 나왔는데, 비교를 위해
  기존 `/enrolment` 베이스 페이지도 동일하게 `curl`로 호출해보니 역시
  403이었다 — 즉 이 사이트 전역의 봇 차단(브라우저 User-Agent 없는 요청을
  막음, 이전부터 알고 있던 동작)이지 `/class/{classId}` 경로 자체의 문제가
  아니었다. 브라우저 User-Agent를 붙여 다시 호출하니 200.
- 우리 DB의 실제 class_id 3개(`403WOArCd2026S3760`,
  `4034L4N7N2026S3960`, `403yG6VyO2026S3960`)로도 전부 200 확인 — 패턴이
  class_id 전반에 일반적으로 적용됨을 재확인.

## 변경 사항 — `src/components/home/culture-club-tab-view.tsx`
`EMART_ENROLMENT_URL`(고정 문자열) 상수를 `buildEmartClassUrl(classId)`
함수로 교체 — `https://www.cultureclub.emart.com/class/{classId}` 형태로
강좌별 상세 페이지에 바로 연결한다. "클래스 신청하러 가기" 버튼의
`href`를 `buildEmartClassUrl(item.class_id)`로 변경.

## 검증
- `src/components/home/culture-club-tab-view.test.tsx` 기존 테스트를
  실제 class_id(`403oo9Mze2026S3760`)로 갱신해 href가 정확히 그 강좌의
  딥링크로 연결되는지 검증(14개 전부 통과).
- `npx tsc --noEmit` / `npm run test`(263개 파일 2,750개) / `npm run build`
  전부 통과.
- 실측: 사용자 제공 URL + 우리 DB의 실제 class_id 3개 전부 브라우저
  User-Agent로 200 확인(위 "실측 확인" 참고).
