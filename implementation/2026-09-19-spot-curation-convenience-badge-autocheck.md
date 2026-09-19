# [스팟 큐레이션 URL 크롤링 — 편의시설 뱃지 자동 체크]

## 구현 대상
사용자 지시(2026-09-19): "관리자화면에서 스팟 큐레이션.. 할때.. 영업시간 파싱
메뉴 파싱하잖아.. 여기 가져올때 편의시설: 유아시설(놀이방)이라던가 아기의자라던가
이런거 가져오는데 주차라던가.. 이거 관련하여 우리 쪽 뱃지에 대하여 스팟큐레이션에
노출시키고 저기 편의시설? 뱃지같은거 가져온거랑 정합성 맞으면 체크해주는거.. 다만
이미 우리쪽 뱃지 체크되어있는건 해제하지 말고.. 이쪽거도 한번더 가져온데이터로
확인하고체크 안되어있으면 체크 추가로 해주는 방향이야" — 뒤이은 확인 질문에서
"체크박스도 이 화면에 넣어서 자동으로 배지 칩이 읽어온거 병합되어야지.. 다만
자동으로 추가할 때 놓칠 수도 있으니 사람이 수동으로 체크해줄 수 있어야 하고..
체크된 걸 해제하는 것만 못하게"로 구체화.

## 구현 일시
2026-09-19

## 배경 — 왜 뱃지 체크박스 UI가 이 화면에 원래 없었는가
2026-09-08 사용자 지시("블로그 뱃지큐레이션하고 스팟큐레이션 합쳤는데.. 다시
분리해줘")로 "스팟 큐레이션"(영업시간/메뉴/이미지 — 이번 크롤링 기능이 채우는
화면)과 "블로그 뱃지 큐레이션"(뱃지 체크박스, blog-curation-modal.tsx +
curation-badge-form.tsx, 블로그 본문 키워드 매칭 기반 자동 체크)이 의도적으로
분리돼 있었다 — 그래서 이 화면(spot-curations-panel.tsx)엔 kids_menu 뱃지 토글
하나만 예외적으로 남아있고 나머지 12개 뱃지는 체크박스 자체가 없었다. 이번
요청은 그 분리 결정과 충돌 가능성이 있어 사용자에게 먼저 확인했고, "체크박스를
이 화면에도 넣어달라"는 명시적 승인을 받았다.

## 코드 변경
`src/components/admin/spot-curations-panel.tsx`:
- `curation-badges.ts`의 기존 `matchBadgeKeysFromText`(블로그 본문 자동 체크와
  동일한 키워드 매칭 엔진, 새로 만들지 않음)와 `getBadgeGroupsForCategory`/
  `getBadgeOptionsForCategory`(restaurant — 이 화면은 애초에 키즈친화 식당
  전용)를 재사용한다(제5장 제4조 기존 구조 우선).
- `selectedBadges: Set<string>` 신규 상태(초기값은 기존 `otherBadges`, 즉
  kids_menu를 제외한 저장된 뱃지) + `savedBadgeKeys`(색상 구분용 — 파란색=이미
  저장됨, 초록색=이번 화면에서 새로 추가됨, `curation-badge-form.tsx`의 기존
  색상 관례 재사용).
- `handleToggleBadge(key)`: 이미 체크된 키는 무시(해제 불가), 미체크 키만 추가
  — kids_menu(기존 정책 그대로 완전 양방향 토글 유지, 손대지 않음)와는 다른
  규칙이다.
- `handleCrawlNaverPlace()`: 크롤링 응답의 `conveniences`를 합쳐
  `matchBadgeKeysFromText`로 매칭한 뒤 `selectedBadges`에 합집합으로 추가한다
  (기존 체크 절대 건드리지 않음).
- 새 UI 섹션: "편의시설 뱃지" — `getBadgeGroupsForCategory`/
  `getBadgeOptionsForCategory` 기준으로 kids_menu를 제외한 12개 뱃지를 그룹별
  칩으로 렌더링. 체크된 칩은 `disabled`로 잠가(재클릭해도 해제 안 됨) UI 차원에서
  실수 방지, 미체크 칩은 클릭하면 켜진다(자동 감지가 놓친 것을 관리자가 보완).
- 저장 payload: `curation_badges`를 기존 `otherBadges`(정적 배열) 대신
  `selectedBadges`(동적 Set)로 교체.

## 검증
- `src/components/admin/spot-curations-panel.test.tsx`: 신규 테스트 3개 —
  "가져온 편의시설과 일치하는 뱃지 자동 체크"(주차→parking, 아기의자→kids_chair,
  유아시설(놀이방)→kids_zone 매칭 확인, 매칭 안 된 뱃지는 미체크 확인),
  "이미 체크된 뱃지는 이 화면에서 다시 눌러도 해제 안 됨"(disabled 확인 +
  클릭 후에도 checked 유지), "자동 체크가 놓친 뱃지는 관리자가 직접 클릭해
  추가 가능"(전체 14개 통과, 기존 11개 회귀 없음).
- `npx tsc --noEmit`/`npm run test`(166개 파일, 1973개 테스트)/`npm run build`
  모두 통과.
- 실측: 로컬 dev 서버로 실제 네이버 플레이스(딸부자 닭갈비, placeId 1107293125)
  크롤링 재확인 → 실제 `conveniences: ["유아시설 (놀이방)"]`이 내려옴을 확인,
  이 텍스트가 실제로 뱃지("놀이방" → kids_zone 키워드)와 매칭됨을 별도 sanity
  테스트로 확인(확인 후 임시 테스트 파일은 삭제).

## 특이 사항
kids_menu 뱃지는 기존 정책(완전 양방향 수동 토글)을 그대로 유지했다 — 이번
"체크 해제 불가" 규칙은 편의시설 자동 체크 대상 12개 뱃지에만 적용된다. 정말
잘못 체크된 뱃지를 해제해야 하면 기존처럼 블로그 뱃지 큐레이션 화면(전체 토글
가능)에서 처리해야 한다 — 이 화면은 의도적으로 "추가만" 가능하다.
