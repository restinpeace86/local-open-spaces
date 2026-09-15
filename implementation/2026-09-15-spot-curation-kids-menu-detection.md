# [개선사항 5] 스팟 큐레이션 메뉴 파싱 및 '키즈메뉴' 자동 감지·하이라이트

## 구현 대상
`implementation/todo.md` [개선사항 5] — 메뉴 항목별 '키즈메뉴' 자동 감지, 관리자
[키즈메뉴] 뱃지 자동 ON/수동 토글, 유저 화면 하이라이트(파스텔 배경 + ⭐[키즈추천]) +
안내 배너.

## 구현 일시
2026-09-15

## 조사 결과 (구현 전 확인한 기존 구조)
- `spot_curations.menu_items`는 이미 `[{ name, price }]` JSONB 배열로 존재했다
  (2026-09-01 도입) — 스키마 마이그레이션 없이 `is_kids_menu?: boolean`을 자유롭게
  추가할 수 있다.
- `spot_curations.curation_badges`(text[])와 그 안의 `'kids_menu'` 뱃지 키도 이미
  `curation-badges.ts`의 `RESTAURANT_CONFIG`에 존재했다(라벨 "키즈 메뉴") — 다만
  기존 키워드 사전은 `['키즈메뉴', '돈가스', '주먹밥', '어린이메뉴']` 4개뿐이었고,
  이 뱃지의 기존 자동 체크 경로(`matchBadgeKeysFromText`)는 **블로그 후기 자유
  텍스트**만 대상으로 했지 `menu_items`(구조화된 개별 메뉴명 배열)는 전혀 보지
  않았다 — 이번 요청의 실제 신규 구현 지점이다.
- "[메뉴 파싱]" 버튼도 이미 존재했다(`spot-curations-panel.tsx`의 "⚡ 자동 파싱",
  `parseMenuText()` 호출) — 요청은 이 기존 파싱 결과에 키즈메뉴 판정을 추가로
  얹어달라는 것으로 해석해 그 자리에 확장했다(신규 버튼을 따로 만들지 않음, 제5장
  제4조 기존 구조 우선).
- `curation_badges`는 `spot-curations-panel.tsx`(메뉴/시간/가격)와
  `blog-curation-modal.tsx`(블로그 후기 기반 뱃지, `useSpotCurationForm`)가
  **서로 다른 화면에서 같은 컬럼을 나눠 씀**을 확인했다 — 이번에 `kids_menu` 뱃지를
  이 화면에서 자동으로 켤 때 다른 화면이 설정한 나머지 뱃지를 덮어쓰지 않도록,
  `curation_badges`에서 `kids_menu`를 뺀 나머지(`otherBadges`)를 보존한 채
  병합한다.

## 변경 사항
### 1) 키워드 사전 확장 (`src/lib/admin/curation-badges.ts`)
요청 원문의 키워드 사전을 `KIDS_MENU_ITEM_KEYWORDS`로 export하고, 기존
`RESTAURANT_KEYWORD_GROUPS.kids_menu`가 이를 그대로 참조하도록 바꿨다(블로그 후기
자동 체크와 메뉴 항목 자동 감지가 같은 사전을 공유 — 두 화면이 다른 기준으로
"키즈메뉴"를 판정하면 혼란스럽다).

### 2) 개별 메뉴 항목 감지 (`src/lib/admin/spot-curation-parsers.ts`)
`ParsedMenuItem`에 `is_kids_menu?: boolean` 추가, `detectKidsMenuItems()` 신규
(단순 `includes` 매칭 — 메뉴명은 블로그 문단과 달리 이미 짧고 정제된 단일 품목명이라
공백 무시 정규식 엔진을 재사용할 필요가 없다고 판단).

### 3) 관리자 화면 (`src/components/admin/spot-curations-panel.tsx`)
- "⚡ 자동 파싱"(메뉴) 클릭 시 `parseMenuText()` → `detectKidsMenuItems()`로
  이어지고, 매칭된 항목이 하나라도 있으면 `[키즈메뉴] 뱃지` 체크박스를 자동으로
  켠다(OFF→ON 방향으로만 제안, 매칭이 없다고 기존에 켜져 있던 값을 되돌리지 않음).
- 신규 체크박스로 관리자가 언제든 수동으로 켜고 끌 수 있다.
- 저장 시 `curation_badges = [...otherBadges, ...(체크됨 ? ['kids_menu'] : [])]`로
  병합해 전송(백엔드 API는 이미 `curation_badges` 부분 업데이트를 지원해 신규
  백엔드 작업 불필요).
- 파싱된 메뉴 목록에서 매칭 항목에 ⭐ + `[키즈추천]` 표시(관리자 미리보기).

### 4) 유저 화면 (`src/components/map/detail-modal.tsx`)
"메뉴" 섹션(키즈친화 식당 카테고리 한정, 기존 노출 범위 그대로) 안에 항목이 1개
이상 있을 때, 섹션 상단에 요청 원문의 안내 배너 문구를 은은한 파스텔 박스로
배치하고, `is_kids_menu:true`인 개별 항목에 파스텔 노란 배경 + ⭐️ + `[키즈추천]`
태그를 적용했다.

## 검증
- `npx tsc --noEmit`, `npm run test`(전체 1711개, 신규 7개 포함), `npm run build`
  모두 통과.
- 신규 테스트로 다음을 직접 검증: (1) 키워드 사전 매칭/오탐지 배제(공기밥·설렁탕·
  냉동너겟 등은 매칭 안 됨), (2) 관리자 화면에서 메뉴 자동 파싱 → 뱃지 자동 ON →
  등록 payload에 `curation_badges`/`menu_items.is_kids_menu` 정확히 포함, (3)
  매칭 없으면 뱃지가 자동으로 켜지지 않음, (4) 유저 화면에서 배너 문구와
  `[키즈추천]` 태그가 실제로 렌더링됨.
