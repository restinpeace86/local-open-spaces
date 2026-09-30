# 구 통합 노출중분류 '어린이 과학관 / 박물관' → 어린이박물관 이관

## 구현 대상
사용자 지시(2026-09-30): "노출중분류 문화시설 > 어린이 과학관 / 박물관
여기에 몇 건이 매핑되었는지 확인해주고 어떤게 매핑됐는지 이름 알려줘..
지금 이거 더이상 안쓰고 어린이 과학관과 어린이 박물관으로 나눈 노출중분류
쓸꺼라" → 확인 결과(4건)를 보고한 뒤 "12,3,4 표준중분류 '어린이박물관'으로
옮겨주고 노출중분류 매핑도 '어린이 박물관'으로 해줘"(4건 전체를 어린이박물관
쪽으로 이관하라는 지시).

## 실측 확인
1. 구 통합 노출중분류 '어린이 과학관 / 박물관'
   (`bf9c5c83-01e4-41ea-9828-4415f4a926ab`)에 매핑된 대표 행을 조회한 결과
   **총 4건**이었다: G밸리산업박물관(category_min=종합/기타박물관),
   대전드림아레나(category_min=기타), 서울우리소리박물관(category_min=종합
   /기타박물관), 한성백제박물관(category_min=종합/기타박물관).
2. 4건 전부 표준중분류가 이번 세션에서 진행한 어린이박물관 분리
   이관(batch1~3)과 무관하게 예전에 이 구 통합 노출중분류로 별도 매핑돼
   있었을 뿐, category_min 자체는 그대로 남아 있었다.
3. 사용자가 4건 전체를 새 표준중분류 '어린이박물관' + 새 노출중분류
   '어린이 박물관'(`bc3b83df-b478-4620-9495-6499870bebdc`)으로 이관하도록
   확정했다.

## 변경 사항
### `scripts/migrations/2026-09-30-move-legacy-combined-service-category-to-children-museum.mjs` (신규, 실행 완료)
`TARGET_SPOT_IDS`(4건, export)를 대상으로 `category_min='어린이박물관'`,
`category_min_source='MANUAL'`, `service_category_id='bc3b83df-...'`를 한
번에 반영. 실행 결과: 4/4건 성공.

### `scripts/migrations/2026-09-30-move-legacy-combined-service-category-to-children-museum.test.mjs` (신규, 3개 테스트)
- 3개 필드 정확히 반영 검증(1).
- 대상 ID 목록 중복 없음 + 정확히 4건 검증(1).
- 갱신/대상 건수 반환 검증(1).

## 검증
- `npx vitest run scripts/migrations/2026-09-30-move-legacy-combined-service-category-to-children-museum.test.mjs` — 3개 통과.
- `npx tsc --noEmit` / `npm run test`(전체 234개 파일 2,566개) / `npm run build` 모두 통과.
- 실제 DB: 4/4건 이관 완료(실행 로그로 확인).

## 특이 사항
이관 완료 후 구 통합 노출중분류 '어린이 과학관 / 박물관'
(`bf9c5c83-01e4-41ea-9828-4415f4a926ab`)의 매핑 건수는 0건이 되어 더 이상
실사용되지 않는다. `service_categories` 테이블 행 자체를 삭제할지 여부는
이번 지시에 포함되지 않아 손대지 않았다(제3장 제5조 추측 금지 — 필요하면
별도 지시).
