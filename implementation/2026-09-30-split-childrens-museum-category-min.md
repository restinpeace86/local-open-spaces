# 순수 어린이박물관 표준 중분류 신규 생성 및 이관 + 노출중분류 매핑

## 구현 대상
사용자 지시(2026-09-30): "표준중분류로 '어린이박물관' 하나 생성하고 하기
파일에 있는 '역사박물관' 표준중분류의 데이터들에 대하여 '어린이박물관'으로
이관시켜줘. 그리고 노출중분류는 어린이 박물관으로 매핑시켜주고.
D:\workspace\local-open-spaces\역사박물관.csv" — 2026-09-29 어린이과학관
분리와 동일한 패턴(사용자가 LLM으로 직접 선별한 목록을 명칭+주소로 대조).

## 실측 확인
1. `역사박물관.csv`(CP949 인코딩, UTF-8 변환 후 확인, 44개 고유 항목)를
   category_min='역사박물관' 대표 행 325건과 이름+주소로 대조했다.
2. **31개는 단일 후보로 명확히 매칭**됐고, **13개는 정확히 같은 주소를
   공유하는 미병등 중복 후보**가 있었다(전쟁기념관 3건, 대한민국역사박물관은
   주소 표기가 두 변형("세종대로 198"/"세종대로 198 (세종로)")으로 갈려 있어
   각 변형당 2건씩 총 4건, 그 외 청강만화역사박물관/칠곡호국평화기념관/
   서울역사박물관/합덕수리민속박물관/유류피해(극복)기념관/의림지 역사박물관/
   부평역사박물관/국립민속박물관 각 2건). 전부 이관 대상에 포함했다(중복
   자체의 병합은 사용자가 직접 "중복 스팟 검수 및 매핑"에서 진행할 예정 —
   2026-09-29 어린이과학관 때와 동일한 합의).
3. **제외 판단 1건**: "독립기념관" 주소에 후보가 3개 나왔는데, 그중
   "독립기념관단풍나무숲길(단풍나무숲길독립기념관)"은 독립기념관 경내의
   산책로(단풍나무숲길)를 가리키는 이름이라, CSV가 실제로 의도한 "독립기념관"
   (박물관 건물)과 같은 시설인지 확신할 근거가 없어 제외했다(제3장 제5조
   추측 금지) — 이름이 정확히 "독립기념관"인 2건만 포함.
4. `service_categories`에 이미 '어린이 박물관'(id: bc3b83df-b478-4620-9495-
   6499870bebdc)이 존재했다 — 기존 '어린이 과학관 / 박물관'(bf9c5c83-...)과는
   별개의 값이라 정확한 id로 매핑했다.

## 변경 사항
### `scripts/migrations/2026-09-30-add-children-museum-category-rule.sql` (신규, 적용 완료)
`category_rules`에 `('open_spaces', '어린이박물관', '어린이박물관', false)`
등록.

### `scripts/migrations/2026-09-30-split-childrens-museum-category-min.mjs` (신규, 실행 완료)
`TARGET_SPOT_IDS`(56건, export)를 대상으로 `category_min='어린이박물관'`,
`category_min_source='MANUAL'`, `service_category_id='bc3b83df-...'`를 한
번에 반영. 실행 결과: 56/56건 성공.

### `scripts/migrations/2026-09-30-split-childrens-museum-category-min.test.mjs` (신규)
- 3개 필드 정확히 반영 검증(1).
- 전쟁기념관(3건 미병합 중복) 전부 포함 검증(1).
- 독립기념관의 "단풍나무숲길" 후보 제외 검증(1).
- 대상 ID 목록 중복 없음 + 정확히 56건 검증(1).
- 갱신/대상 건수 반환 검증(1).

### `src/lib/admin/category-min-groups.ts`
'문화시설' 대분류 minors에 '어린이박물관' 추가.

### `src/lib/admin/category-min-fallback.ts`
안전망 폴백 목록에 '어린이박물관' 추가.

### `src/lib/spaces/spot-category-groups.ts`
'museum' 칩(라벨 "박물관")의 minors에 '어린이박물관' 추가 — 2026-09-28
'library', 2026-09-29 'science-museum' 칩과 동일한 관례.

### `src/lib/spaces/spot-category-groups.test.ts`
`isSpotCategoryVisible` 테스트가 'museum' 칩의 이전 minors(2개)만 가정하고
있었다 — `counts[min] ?? 1`(값이 없는 minor는 "노출 가능"으로 간주하는 기존
설계) 때문에 새로 추가된 '어린이박물관'을 카운트 없이 두면 항상 노출로
판정돼 "전부 0이면 숨긴다" 테스트가 깨졌다. 세 테스트 모두 '어린이박물관'
카운트를 명시적으로 포함하도록 수정(로직 변경 아님, 테스트 갱신).

## 검증
- `npx vitest run scripts/migrations/2026-09-30-split-childrens-museum-category-min.test.mjs src/lib/admin/category-min-groups.test.ts src/lib/spaces/spot-category-groups.test.ts` — 36개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 225개 파일 2,519개) / `npm run build` 모두 통과.
- 실제 DB: category_rules 등록 완료 + 56/56건 이관 완료(실행 로그로 확인).

## 특이 사항
발견된 미병합 중복 12쌍(25개 행)은 이번 지시 범위(표준중분류 이관) 밖이라
병합하지 않았다 — 사용자가 직접 "중복 스팟 검수 및 매핑"에서 진행할
예정이라고 확인받았다(2026-09-29 어린이과학관 건과 동일).
