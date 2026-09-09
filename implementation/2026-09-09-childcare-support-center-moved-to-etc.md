# [개선사항3 후속] 육아종합지원센터/유아교육진흥원 대분류를 '기타'로 이동

## 구현 대상
사용자 지시: "키즈/놀이시설쪽에 육아종합지원센터와 유아교육진흥원 중분류는
왜 기타 대분류로 안옮겼어?"

## 구현 일시
2026-09-09

## 배경
[[2026-09-09-playground-install-place-category-cleanup]](Step 83)에서
설치장소코드 22종을 표준 중분류(category_min)로 정리했지만, 그 작업은
`open_spaces.category_min` 값 자체만 다뤘고 관리자 UI의 "대분류(major)"
그룹핑(`src/lib/admin/category-min-groups.ts`)은 건드리지 않았다.
육아종합지원센터/유아교육진흥원(A092/A093)은 예전부터 이미 '키즈/놀이시설'
대분류에 명시적으로 들어있었는데, 실제로는 육아 정책/행정 지원기관이지
"실제 놀이시설"이 아니라 이번에 함께 정리한 나머지 14개 설치장소코드
(목욕장업소/도로휴게시설/식품접객업소 등, 전부 자동으로 '기타'에 편입됨)와
성격이 같다.

## 변경 사항
- `src/lib/admin/category-min-groups.ts`: `OPEN_SPACES_GROUPS_STATIC`의
  '키즈/놀이시설'에서 두 값을 빼고 '기타'로 옮겼다.
- `src/lib/spaces/spot-category-groups.ts`: `CORE_SPOT_CATEGORIES`에서
  `childcare-support-center`/`early-childhood-education-center` 칩을
  제거했다 — '기타' 대분류는 2026-09-05 동기화 원칙("체육시설/공공청사
  대관/기타 제외")에 따라 이 소비자용 칩 목록에서 원래부터 제외 대상이라,
  남겨두면 어드민과 다시 어긋난다. 실제 소비 화면(map-explorer.tsx는 이미
  이 목록을 안 씀, spot-curations-panel.tsx는 'kids-restaurant' 칩만
  참조)에는 영향이 없음을 확인했다.
- `spot-category-groups.test.ts`: 교차 검증 테스트(어드민 대분류 구성과
  정확히 일치해야 함)가 이 변경을 정확히 반영하도록 관련 단언을 갱신했다.

## 검증
- `category-min-groups.test.ts`/`spot-category-groups.test.ts`: 기존
  교차 검증 테스트가 그대로 통과(어드민-소비자 정의 재동기화 확인).
- `npx tsc --noEmit` / `npm run test`(1379건) / `npm run build` 전체 통과.

## 특이 사항 — 별도로 확인이 필요한 질문
사용자가 함께 물어본 "육아종합지원센터 안에 식품접객업소가 쫙 있는데?
(`instlPlaceCdNm: 식품접객업소`)"는 실측으로 재현하지 못했다:
`category_min='육아종합지원센터'`인 142건 전부(source_type/instlPlaceCd/
instlPlaceCdNm 교차 확인) 예외 없이 A092/육아종합지원센터로 일관됐고,
이름에 "육아종합지원센터"가 포함된 행 중 instlPlaceCd='A004'(식품접객업소)
인 행도 0건이었다. 현재 DB 상태에서는 두 카테고리가 섞인 사례를 찾지
못했다 — 사용자가 어느 화면/필터에서 이 조합을 봤는지 구체적인 예시(스팟
이름이나 ID)를 받아 추가로 확인이 필요하다.
