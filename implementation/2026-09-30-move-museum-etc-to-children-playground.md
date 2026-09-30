# 종합/기타박물관 → 어린이놀이터 표준중분류 이관

## 구현 대상
사용자 지시(2026-09-30): "박물관_기타.csv 여기있는건 박물관이 아닌거 같아
일단 키즈/놀이시설>> 어린이놀이터 표준 중분류로 이관해줘"

## 실측 확인
1. `박물관_기타.csv`(CP949, UTF-8 변환 후 확인, 25개 행)를 DB에서 이름
   완전일치로 조회했다.
2. **25건 전부 단일 후보로 명확히 매칭**됐다(모호 그룹 없음, 매칭 실패
   없음).
3. 전부 현재 `category_min='종합/기타박물관'`이며, 실제로는 지역 공원/
   체험장/온천/테마파크 등에 부속된 놀이시설(예: "한탄강 지질공원
   실외놀이시설", "유교랜드 2층 소망나무놀이터", "원더파크 볼풀게임",
   "부곡온천르네상스관 놀이터")로, 사용자가 지적한 대로 박물관이 아니라
   '키즈/놀이시설' 대분류에 해당한다.
4. '어린이놀이터'는 이미 존재하는 표준중분류라(`src/lib/spaces/spot-
   category-groups.ts`의 'kids-play' 그룹 등에 이미 등록됨) 신규 생성이나
   `category_rules`/분류체계 파일(category-min-groups.ts 등) 변경이
   필요하지 않았다.
5. 이번 지시에는 노출중분류(service_category_id) 매핑 요청이 없어
   **표준중분류만 변경**하고 노출중분류는 그대로 두었다(제3장 제5조 추측
   금지 — 지시에 없는 필드는 임의로 바꾸지 않음).

## 변경 사항
### `scripts/migrations/2026-09-30-move-museum-etc-to-children-playground.mjs` (신규, 실행 완료)
`TARGET_SPOT_IDS`(25건, export)를 대상으로 `category_min='어린이놀이터'`,
`category_min_source='MANUAL'`만 반영(`service_category_id`는 변경하지
않음). 실행 결과: 25/25건 성공.

### `scripts/migrations/2026-09-30-move-museum-etc-to-children-playground.test.mjs` (신규)
- 2개 필드만 정확히 반영하고 `service_category_id`는 patch에 포함되지
  않는지 검증(1).
- 대상 ID 목록 중복 없음 + 정확히 25건 검증(1).
- 갱신/대상 건수 반환 검증(1).

## 검증
- `npx vitest run scripts/migrations/2026-09-30-move-museum-etc-to-children-playground.test.mjs` — 3개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 230개 파일 2,541개) / `npm run build` 모두 통과.
- 실제 DB: 25/25건 이관 완료(실행 로그로 확인).

## 특이 사항
기존 박물관 이관 배치(batch1~3)와 달리 이번 건은 (a) 대상 표준중분류가
이미 존재해 분류체계 파일 변경이 불필요했고, (b) 노출중분류 매핑 요청이
없어 그 필드는 손대지 않았다.
