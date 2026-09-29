# 순수 어린이과학관 표준 중분류 신규 생성 및 이관 + 노출중분류 매핑

## 구현 대상
사용자 지시(2026-09-29): "표준중분류 관련하여 문화시설 대분류쪽에
'어린이과학관'을 생성해줘. 그리고 현재 '과학관' 표준중분류에 있는것중에
D:\workspace\local-open-spaces\과학관.csv 여기에 있는 과학관들은 표준중분류
'어린이과학관'으로 데이터 옮겨줘. 그리고 노출중분류가 문화시설 > 어린이
과학관으로 매핑도 시켜주고" — 2026-09-28 어린이도서관 분리와 동일한 패턴.

## 실측 확인
1. 사용자가 준 `과학관.csv`는 내가 이전에 내보낸 138건(과학관 156건 중
   "OO어린이천문대" 프랜차이즈 18건 제외)과 다른, 사용자가 직접 62개
   고유 시설로 재선별한 목록이었다(CP949로 재인코딩돼 있어 UTF-8 변환 후
   확인) — "국립어린이과학관"/"인천어린이과학관"처럼 이름에 "어린이"가 없는
   기관(국립과천과학관, 서울로봇인공지능과학관 등)도 포함돼 있어, 이름
   패턴이 아니라 실제 어린이 과학관/자연사박물관 적합성을 직접 판단해
   고른 목록으로 보인다.
2. 이 62개를 category_min='과학관' 대표 행 156건과 이름+주소로 대조한 결과
   **54개는 단일 후보로 명확히 매칭**됐고, **8개는 정확히 같은 주소를 공유하는
   미병합 중복 후보**가 있었다(한국자연사박물관 2건, 서대문자연사박물관 3건,
   지질박물관/한국지질자원연구원 지질박물관 2건[같은 주소의 다른 표기],
   강화자연사박물관 2건, 덕소자연사박물관 2건, 구미과학관 2건, 반디랜드
   천문과학관 2건) — 전부 주소가 완전히 같아 실제로 같은 물리적 장소로
   판단, 두 후보 모두 이관 대상에 포함했다(중복 자체의 병합은 이번 지시
   범위 밖이라 손대지 않음). **고유 ID 기준 총 69건.**
3. `service_categories`에 이미 '어린이 과학관'(id: 34c758dd-e55c-4dea-bece-
   e5ab91f6138f)이 존재했다 — 기존 '어린이 과학관 / 박물관'(bf9c5c83-...,
   기존 GENERIC_CONFIGS의 보편 임시 카테고리)과는 별개의 값이라 정확한
   id로 매핑했다(추측 없이 실제 테이블 값 확인 후 사용).

## 변경 사항
### `scripts/migrations/2026-09-29-add-children-science-museum-category-rule.sql` (신규, 적용 완료)
`category_rules`에 `('open_spaces', '어린이과학관', '어린이과학관', false)`
등록(get_category_min_options RPC의 Source of Truth — 어드민 드롭다운에
노출되기 위한 필수 조건, 2026-09-28 어린이도서관과 동일한 관례).

### `scripts/migrations/2026-09-29-split-childrens-science-museum-category-min.mjs` (신규, 실행 완료)
`TARGET_SPOT_IDS`(69건, export)를 대상으로 `category_min='어린이과학관'`,
`category_min_source='MANUAL'`, `service_category_id='34c758dd-...'`를
한 번에 반영. 실행 결과: 69/69건 성공.

### `scripts/migrations/2026-09-29-split-childrens-science-museum-category-min.test.mjs` (신규)
- 대상 스팟 전원에 3개 필드가 정확히 반영되는지 검증(1).
- 미병합 중복(서대문자연사박물관 3건)의 모든 후보가 대상 목록에 포함되는지 검증(1).
- 대상 ID 목록에 중복이 없고 정확히 69건인지 검증(1).
- 갱신 건수/대상 건수 반환 검증(1).

### `src/lib/admin/category-min-groups.ts`
'문화시설' 대분류 minors에 '어린이과학관' 추가(어드민 필터 UI 그룹핑).

### `src/lib/admin/category-min-fallback.ts`
안전망 폴백 목록에 '어린이과학관' 추가.

### `src/lib/spaces/spot-category-groups.ts`
'science-museum' 칩(라벨 "과학관")의 minors에 '어린이과학관' 추가 — 2026-09-28
'library' 칩과 동일한 관례(소비자 화면 필터 칩은 그대로 "과학관" 하나만
유지하고 그 아래 두 표준 중분류를 함께 담음, 임의로 새 칩을 만들지 않음).

## 검증
- `npx vitest run scripts/migrations/2026-09-29-split-childrens-science-museum-category-min.test.mjs src/lib/admin/category-min-groups.test.ts src/lib/spaces/spot-category-groups.test.ts` — 35개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 224개 파일 2,514개) / `npm run build` 모두 통과.
- 실제 DB: category_rules 등록 완료 + 69/69건 이관 완료(실행 로그로 확인).

## 특이 사항
- 발견된 미병합 중복 8쌍(15개 행)은 이번 지시 범위(표준중분류 이관) 밖이라
  병합하지 않았다 — 2026-09-29 어린이도서관 미병합 중복과 같은 유형의 후속
  확인 필요 항목으로 남겨둔다.
- 뱃지(curation_badges) 체계는 이번 지시에 포함되지 않아 손대지 않았다 —
  CHILDREN_LIBRARY_CONFIG처럼 '어린이과학관' 전용 뱃지 config가 필요한지는
  별도 확인 필요.
