# 순수 어린이전시미술관 표준 중분류 분리(전시실+미술관 → 어린이전시미술관)

## 구현 대상
사용자 지시(2026-09-30): "D:\workspace\local-open-spaces\전시_미술관.csv
해당 파일은 문화시설 > 전시실 (표준중분류) 및 문화시설 > 미술관
(표준중분류)에 있는 데이터중 키즈친화적인 스팟만 추린거야. 이에 대하여
표준 중분류를 '어린이전시미술관' 하나 만들고 여기로 다 이관해줘. 그리고
노출중분류는 '어린이 전시/미술관' 으로 매핑해줘."

## 실측 확인
1. `전시_미술관.csv`(CP949, UTF-8 변환 후 확인, 83개 행)를
   category_min IN ('전시실','미술관') 대표 행 1,048건과 이름+주소로
   대조했다. **63개는 단일 후보로 명확히 매칭**됐다.
2. **20개(고유 기준)는 같은 주소에 후보가 여러 개**였다 — 어린이과학관/
   어린이박물관 분리와 동일한 원칙으로 두 경우를 구분했다(제3장 제5조
   추측 금지):
   - **진짜 중복**(표기 차이만): 두 후보 모두 포함(예: "K현대미술관",
     "양평군립미술관", "돌하르방미술관", "임립미술관", "한향림도자미술관",
     "우양미술관", "진주익룡발자국전시관", "소다미술관"(주소 공백 유무)).
   - **의미 있게 다른 별개의 시설/기관**: CSV가 실제로 적어낸 그 이름과
     정확히 일치하는 후보만 포함. "북서울꿈의숲 상상톡톡미술관"과
     "북서울꿈의숲아트센터 드림갤러리"는 같은 부지의 서로 다른 두 시설이고
     CSV에 각각 별도 행으로 있어 둘 다 포함(각자 정확한 이름으로 매칭).
     "유리섬미술관"(CSV)만 포함하고 같은 주소의 "맥아트미술관"(CSV에 없음)은
     제외, "또봇정크아트뮤지엄"(CSV)만 포함하고 "경주솔거미술관"(CSV에 없음)은
     제외, "조선해양문화관 (어촌민손전시관+조선해양전시관 전시실)"(CSV, 동일
     이름 중복 2건)만 포함하고 같은 주소의 "거제어촌민속전시관"(CSV에 없는
     다른 이름, 2건)은 제외.
3. 최종 고유 ID 기준 **총 85건**(안전 매칭 63건 + 검토 후 포함한 모호
   후보 22건).
4. 노출중분류는 이미 존재하는 서비스 카테고리 **'어린이 전시/미술관'**
   (`2901e5e0-55d5-4799-b18f-6ebe886e40ec`, 신규 생성 아님 — 사용자 요청
   전 DB 조회로 직접 확인)로 매핑.

## 변경 사항
### `scripts/migrations/2026-09-30-add-children-exhibition-art-museum-category-rule.sql` (신규, 적용 완료)
`category_rules`에 `('open_spaces', '어린이전시미술관', '어린이전시미술관',
false)` 등록(어린이과학관/어린이박물관과 동일한 패턴).

### `src/lib/admin/category-min-groups.ts`
`OPEN_SPACES_GROUPS_STATIC`의 문화시설 minors에 `'어린이전시미술관'` 추가.

### `src/lib/admin/category-min-fallback.ts`
`OPEN_SPACES_CATEGORY_MIN_FALLBACK`에 `'어린이전시미술관'` 추가, 변경 이력
주석 갱신.

### `src/lib/spaces/spot-category-groups.ts`
`'art-museum'` 칩(소비자 화면 "미술관" 필터, 이 파일은 라이브 소비자 앱에서
쓰이지 않는 죽은 코드로 이전에 확인됐으나 어드민 정의와의 동기화 테스트
대상이라 함께 갱신)의 minors를 `['미술관', '어린이전시미술관']`로 확장.
'전시실'/'미술관'은 이 파일에서 의도적으로 별개 칩으로 유지되고 있어
(2026-08-29 결정) 두 칩 모두에 중복 배정하면 대분류 전체 합집합을 1:1로
검증하는 기존 동기화 테스트가 실패한다 — 이름의 head noun이 "미술관"이라
`art-museum` 칩 하나에만 배정했다.

### `src/lib/spaces/spot-category-groups.test.ts`
"박물관과 미술관은 별개 칩이다" 테스트의 `artMuseum?.minors` 기대값을
`['미술관', '어린이전시미술관']`로 갱신(museum/library/science-museum 칩
확장 때와 동일한 패턴).

### `scripts/migrations/2026-09-30-split-childrens-exhibition-art-museum-category-min.mjs` (신규, 실행 완료)
`TARGET_SPOT_IDS`(85건, export)를 대상으로 `category_min='어린이전시미술관'`,
`category_min_source='MANUAL'`, `service_category_id='2901e5e0-...'`를 한
번에 반영. 실행 결과: 85/85건 성공.

### `scripts/migrations/2026-09-30-split-childrens-exhibition-art-museum-category-min.test.mjs` (신규, 5개 테스트)
- 3개 필드 정확히 반영 검증(1).
- 같은 부지의 서로 다른 두 시설(북서울꿈의숲)이 각각 정확히 매핑됐는지
  검증(1).
- CSV가 명시하지 않은 다른 이름의 후보는 제외되는지 검증(유리섬미술관/
  또봇정크아트뮤지엄/조선해양문화관)(1).
- 대상 ID 목록 중복 없음 + 정확히 85건 검증(1).
- 갱신/대상 건수 반환 검증(1).

## 검증
- `npx vitest run scripts/migrations/2026-09-30-split-childrens-exhibition-art-museum-category-min.test.mjs src/lib/spaces/spot-category-groups.test.ts` — 전부 통과(5 + 18).
- `npx tsc --noEmit` / `npm run test`(전체 236개 파일 2,574개) / `npm run build` 모두 통과.
- 실제 DB: 85/85건 이관 완료(실행 로그로 확인).

## 특이 사항
사용자가 별도로 요청한 '미술관 / 전시체험관' 노출중분류(구 카테고리, 7건
매핑) 확인 건은 이 작업과 별개로 명칭만 보고했다 — 사용자가 검토 후 어디로
옮길지 결정하면 그때 반영한다(이번 작업 범위 아님).
