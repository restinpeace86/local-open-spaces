# 카테고리별 뱃지/룰 완전 독립 Config 구조 (개선사항4)

## 구현 대상
`implementation/todo.md` [개선사항4] — 카테고리(식당, 키즈카페 등)마다 완전히
독립된 뱃지 목록/키워드 매핑을 갖고, "노출 중분류" 콤보박스로 실시간 전환.

## 구현 일시
2026-09-07

## 착수 전 검토 — 실측으로 확인한 문제
"카테고리별 config 구조로 바꾸면 무엇이 달라지는지" 사용자에게 먼저 설명·검토를
요청받아, 코드 변경 전에 실제 데이터를 확인했다:
- "노출 중분류" 드롭다운엔 이미 `service_categories` 실제 13개 값이 존재한다
  (todo.md 자체의 [노출될 중분류] 참고 목록과 정확히 일치 — 사용자가 말한
  "10개"는 실측과 달랐으나, 실측 값을 그대로 따랐다).
- 그중 "키즈카페 / 실내놀이터"로 이미 **17건**이 큐레이션돼 있었는데, 뱃지가
  카테고리 구분 없이 전역 단일 목록(식당 기준)이라 전부 식당용 뱃지(좌식/온돌,
  키즈 메뉴 등)로 체크돼 있었다 — 실제로 이미 발생 중인 문제였다.

사용자 확인 답변으로 범위를 확정했다:
- "노출 중분류 10개(실제 13개) 전부 같이 가도록 적용" — 일부(식당/키즈카페)만
  먼저 만들고 나머지는 나중으로 미루지 않고, 이번에 13개 전부를 config 배열에
  등록한다.
- "하나씩 채워넣어야지 거기에 맞는거" — 실제 콘텐츠(뱃지/키워드)가 있는 건
  식당(기존 13개, 83건 실사용)과 키즈카페(todo.md 예시 그대로)뿐이다. 나머지
  11개(도서관/박물관/캠핑장/휴양마을 등)는 venue별 특화 뱃지를 지어내지 않고
  (제3장 제5조 추측 금지), 보편적으로 적용 가능한 최소 공통 항목(주차/유모차/
  수유실/기저귀대/예약 필수·가능 6개)만 임시로 채워, 관리자가 각 카테고리에
  맞는 실제 뱃지를 이후 하나씩 확정하면 그때 개별 교체할 수 있는 구조로 뒀다.
- "기존 17건의 키즈카페 큐레이션 → 그냥 초기화" — `curation_badges`를 전부
  빈 배열로 초기화했다(아래 참고).

## 변경 사항

### 1. DB — 기존 17건 뱃지 초기화
`scripts/migrations/2026-09-07-reset-kidscafe-badges.sql`(적용 완료):
`service_category_id`가 "키즈카페 / 실내놀이터"인 17건의 `curation_badges`를
`{}`로 초기화했다.

### 2. `src/lib/admin/curation-badges.ts` — 전면 재구성
- 기존 전역 `CURATION_BADGE_OPTIONS`/`CURATION_BADGE_GROUPS`/
  `HIGHLIGHT_KEYWORDS`를 제거하고, 카테고리별 독립 config 배열
  (`CURATION_CATEGORIES`, 비공개)로 재구성했다. 각 config는
  `{ categoryId, exposureCategoryNames, badgeGroups, badgeOptions,
  keywordGroups }`를 갖는다 — todo.md가 제시한 JSON 구조와 동일한 개념을
  TypeScript 배열로 구현했다(별도 JSON 파일 대신 TS 상수로 둔 이유: 이
  프로젝트의 다른 모든 분류/뱃지 상수도 전부 TS 상수 파일이라 형식을
  통일했다 — 제5장 제4조).
  - `restaurant`: 기존 13개 뱃지 그대로(83건 실사용 데이터와 호환).
  - `kids_cafe`: todo.md 예시 그대로(트램폴린/방방, 볼풀장/정글짐,
    편백존/모래놀이, 베이비존, 부모 쉼터, 파티룸, 식사/간식 판매 등 13개).
  - 나머지 11개: 위 "보편 임시 뱃지"(6개) 공유.
- `resolveCurationCategoryId(exposureCategoryName)`: category_name 문자열로
  어느 config가 활성화될지 찾는다. 매칭 실패/미지정이면 `restaurant`로
  되돌아간다(가장 많이 실사용 중인 카테고리, 기존 동작과 호환).
- `getBadgeGroupsForCategory`/`getBadgeOptionsForCategory`: 렌더링용.
- `highlightKeywords(text, categoryId, extraKeywords)`: `categoryId` 인자가
  추가돼(2번째 자리, 생략 시 restaurant) 해당 카테고리의 키워드로만 매칭한다.
- `matchBadgeKeysFromText(text, categoryId)`: 동일하게 카테고리별로 판정.

### 3. 프론트엔드 배선
- `useSpotCurationForm(spot, serviceCategories)`: 시그니처에
  `serviceCategories`가 추가됐다(두 호출부 모두 이미 props로 갖고 있던 값을
  그대로 넘김 — 새 조회 없음). 선택된 `serviceCategoryId`로 category_name을
  찾아 `curationCategoryId`를 계산하고, `badgeGroups`/`badgeOptions`를
  반환한다.
- **콤보박스 전환 시 뱃지 필터링**: `setServiceCategoryId`를 감싸, 노출
  중분류가 바뀌면 새 카테고리에 없는 뱃지 키는 `selectedBadges`에서
  제거한다(예: 식당에서 고른 "좌식/온돌"은 키즈카페로 바꾸면 사라짐 — 되돌릴
  방법 없음, 명시적으로 다시 체크해야 함).
- `CurationBadgeForm`: 더 이상 전역 상수를 import하지 않고 `badgeGroups`/
  `badgeOptions`를 props로 받는다.
- `BlogReferenceViewer`: `curationCategoryId` prop 추가, `highlightKeywords`
  호출에 그대로 전달 — 관리자가 콤보박스를 바꾸면 **서버 재요청 없이** 이미
  로드된 본문의 하이라이트가 즉시 새 카테고리 키워드로 다시 계산된다(todo.md
  3번 요구사항 그대로).

## 검증
- `src/lib/admin/curation-badges.test.tsx`: 27개(기존 8 + 신규 19 — 카테고리
  매핑, kids_cafe 전용 뱃지, 보편 임시 뱃지, 카테고리 전환 시 하이라이트 변경,
  카테고리별 뱃지 자동 체크) 전체 통과.
- `src/components/admin/blog-curation-modal.test.tsx`: 신규 3건 추가(기본은
  식당 13개 뱃지, 콤보박스 전환 시 **서버 재요청 없이**(fetch 호출 수 불변)
  즉시 키즈카페 전용 뱃지로 교체, 식당 전용 뱃지 체크 후 전환하면 선택이
  사라지고 되돌아가도 복구되지 않음) — 기존 20건과 합쳐 23건 전체 통과.
- `npx tsc --noEmit` / `npm run test`(115개 파일, 1266개 테스트) /
  `npm run build` 전체 통과.

## 특이 사항 — 다음에 채워야 할 것
나머지 11개 노출 중분류(체험농장·농원, 휴양마을, 물놀이장/바닥분수, 실내
체험·놀이 공간, 대형 근린공원/잔디광장, 생태공원/산책로, 수목원/식물원,
캠핑장/피크닉장, 어린이 도서관, 어린이 과학관/박물관, 미술관/전시체험관)는
현재 "보편 임시 뱃지"(주차/유모차/수유실/기저귀대/예약 필수·가능 6개)만
공유하고 있다 — 각 카테고리 특유의 콘텐츠(예: 캠핑장의 "전기 사이트", 박물관의
"오디오 가이드")는 사용자 지시대로 "하나씩" 확정되는 대로 개별 config로
교체하면 된다. `src/lib/admin/curation-badges.ts`의 `GENERIC_CONFIGS` 배열
항목 하나를 그 카테고리 전용 config로 바꿔치기하는 방식이라, 구조 자체는
이미 갖춰져 있다.
